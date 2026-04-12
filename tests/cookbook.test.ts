#!/usr/bin/env bun
/**
 * Cookbook graph execution test suite.
 *
 * Starts a local mock server for HTTP-based services (Slack, inventory, uptime),
 * optionally connects to a Docker postgres, then runs ALL triggered graphs in
 * parallel with a hard timeout per graph. Streams results as each completes.
 *
 * Usage:
 *   bun run tests/cookbook.test.ts              # mock server auto-starts
 *   CONCURRENCY=10 bun run tests/cookbook.test.ts
 *
 * Postgres (optional):
 *   docker compose -f tests/docker-compose.yml up -d
 *   bun run tests/cookbook.test.ts              # auto-detects postgres
 *
 * Exit codes:
 *   0 — all runnable graphs passed
 *   1 — one or more graphs failed or timed out
 *
 * NOTE: Graphs with `ai` nodes make real LLM calls through OpenRouter and
 * will incur API costs. Graphs with `resend` nodes send real emails.
 */

import { join } from "node:path"
import {
  scanCookbookSync,
  buildGraphTestInfos,
  getAvailableEnvVars,
  type GraphTestInfo,
} from "./parse"
import {
  startMockServer,
  getMockEnvVars,
  setMockEnvVars,
  removeMockEnvVars,
} from "./mock-server"

const cookbookDir = join(import.meta.dir, "..", "cookbook")

const TIMEOUT_MS = 60_000
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "5", 10)
const POSTGRES_URL = "postgres://swirls:swirls@localhost:5433/swirls_test"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const clean = (s: string) =>
  s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\[?\d*[GJK]/g, "")
    .replace(/[◒◐◓◑■▲●○│◇┌┐└┘├┤─]/g, "")
    .replace(/Executing graph\.*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

// ---------------------------------------------------------------------------
// Doctor validation
// ---------------------------------------------------------------------------

async function runDoctor(): Promise<boolean> {
  process.stdout.write(dim("running swirls doctor..."))
  const proc = Bun.spawn(["swirls", "doctor"], {
    cwd: cookbookDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  if (exitCode === 0) {
    process.stdout.write(`\r${green("PASS")} swirls doctor\n`)
    return true
  }
  process.stdout.write(
    `\r${red("FAIL")} swirls doctor\n${clean(stdout)}\n${clean(stderr)}\n`,
  )
  return false
}

// ---------------------------------------------------------------------------
// Check if Docker postgres is reachable
// ---------------------------------------------------------------------------

function isPostgresAvailable(): boolean {
  const res = Bun.spawnSync(
    ["pg_isready", "-h", "localhost", "-p", "5433", "-U", "swirls"],
    { stdout: "pipe", stderr: "pipe" },
  )
  return res.exitCode === 0
}

// ---------------------------------------------------------------------------
// Execute a single graph with hard timeout
// ---------------------------------------------------------------------------

interface RunResult {
  graph: GraphTestInfo
  status: "pass" | "fail" | "timeout"
  durationMs: number
  error?: string
}

async function executeGraph(graph: GraphTestInfo): Promise<RunResult> {
  const start = performance.now()
  const inputJson = JSON.stringify(graph.input)

  const proc = Bun.spawn(
    ["swirls", "graph", "execute", graph.name, "--input", inputJson],
    { cwd: cookbookDir, stdout: "pipe", stderr: "pipe" },
  )

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, TIMEOUT_MS)

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  clearTimeout(timer)
  const durationMs = performance.now() - start

  if (timedOut) {
    return { graph, status: "timeout", durationMs }
  }

  if (exitCode !== 0) {
    const raw = [stderr, stdout].join("\n")
    const errorLine =
      raw
        .split("\n")
        .map((l) => clean(l))
        .find(
          (l) =>
            l.includes("failed:") ||
            l.includes("Error") ||
            l.includes("not supported"),
        ) ??
      clean(raw).split("\n").filter(Boolean).pop() ??
      "unknown error"
    return { graph, status: "fail", durationMs, error: errorLine }
  }

  return { graph, status: "pass", durationMs }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --- Parse cookbook first (need secret block names for namespaced env vars) ---
  const parsed = scanCookbookSync(cookbookDir)

  // --- Start mock server ---
  const mock = startMockServer()
  const mockPort = mock.port
  const mockVars = getMockEnvVars(mockPort, parsed)

  // Check postgres availability — add namespaced DATABASE_URL
  const pgAvailable = isPostgresAvailable()
  if (pgAvailable) {
    mockVars["DATABASE_URL"] = POSTGRES_URL
    // Find the secret block that declares DATABASE_URL
    for (const pf of parsed) {
      for (const s of pf.secrets) {
        if (s.vars.includes("DATABASE_URL")) {
          mockVars[`${s.name}::DATABASE_URL`] = POSTGRES_URL
        }
      }
    }
  }

  console.log(
    `\n${bold("mock server")} listening on :${mockPort}` +
      (pgAvailable
        ? ` ${dim("+ postgres on :5433")}`
        : ` ${dim("(no postgres — run: docker compose -f tests/docker-compose.yml up -d)")}`),
  )

  // --- Set mock env vars (track which ones are new so we only remove those) ---
  const existingBefore = getAvailableEnvVars(cookbookDir)
  const newKeys = Object.keys(mockVars).filter((k) => !existingBefore.has(k))
  const keysSet = setMockEnvVars(cookbookDir, mockVars)

  let exitCode = 0

  try {
    // --- Categorize (AFTER mock env vars are set) ---
    const allGraphs = buildGraphTestInfos(parsed)
    const available = getAvailableEnvVars(cookbookDir)

    interface SkipInfo {
      graph: GraphTestInfo
      reason: string
    }

    const runnable: GraphTestInfo[] = []
    const skipped: SkipInfo[] = []

    for (const graph of allGraphs) {
      if (!graph.triggerType) {
        skipped.push({ graph, reason: "subgraph (tested via parent)" })
        continue
      }
      if (graph.hasWaitNode) {
        skipped.push({ graph, reason: "wait node" })
        continue
      }
      if (graph.cloudOnly) {
        skipped.push({ graph, reason: "cloud-only (bucket/stream)" })
        continue
      }
      const missing = [...graph.requiredEnvVars].filter(
        (v) => !available.has(v),
      )
      if (missing.length > 0) {
        skipped.push({ graph, reason: `missing env: ${missing.join(", ")}` })
        continue
      }
      runnable.push(graph)
    }

    console.log(
      `${bold("cookbook test suite")} — ${allGraphs.length} graphs found, ${runnable.length} runnable, ${skipped.length} skipped\n`,
    )

    for (const { graph, reason } of skipped) {
      console.log(`${yellow("SKIP")} ${graph.name} ${dim(`(${reason})`)}`)
    }
    if (skipped.length > 0) console.log()

    // --- Doctor ---
    const doctorOk = await runDoctor()
    if (!doctorOk) {
      process.exit(1)
    }

    console.log(
      `\n${bold("executing")} ${runnable.length} graphs ${dim(`(${CONCURRENCY} concurrent, ${TIMEOUT_MS / 1000}s timeout each)`)}\n`,
    )

    // --- Execute graphs ---
    let passed = 0
    let failed = 0
    let timedout = 0
    let completed = 0
    const results: RunResult[] = []
    const queue = [...runnable]

    async function runNext(): Promise<void> {
      while (queue.length > 0) {
        const graph = queue.shift()!
        const result = await executeGraph(graph)
        results.push(result)
        completed++

        const progress = dim(`[${completed}/${runnable.length}]`)
        const duration = dim(`${(result.durationMs / 1000).toFixed(1)}s`)
        const types = dim(`[${[...result.graph.nodeTypes].join(", ")}]`)

        switch (result.status) {
          case "pass":
            passed++
            console.log(
              `${green("PASS")} ${result.graph.name} ${types} ${duration} ${progress}`,
            )
            break
          case "timeout":
            timedout++
            console.log(
              `${red("TIME")} ${result.graph.name} ${types} ${dim(`>${TIMEOUT_MS / 1000}s`)} ${progress}`,
            )
            break
          case "fail":
            failed++
            console.log(
              `${red("FAIL")} ${result.graph.name} ${types} ${duration} ${progress}`,
            )
            if (result.error) {
              console.log(`     ${dim(result.error)}`)
            }
            break
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => runNext())
    await Promise.all(workers)

    // --- Summary ---
    console.log(`\n${bold("results")}`)
    console.log(
      `  ${green(`${passed} passed`)}  ${failed + timedout > 0 ? red(`${failed} failed`) : "0 failed"}  ${timedout > 0 ? red(`${timedout} timed out`) : "0 timed out"}  ${yellow(`${skipped.length} skipped`)}`,
    )
    console.log()

    const failures = results.filter((r) => r.status !== "pass")
    if (failures.length > 0) {
      console.log(bold("failures:"))
      for (const f of failures) {
        const tag = f.status === "timeout" ? "TIMEOUT" : "ERROR"
        console.log(`  ${f.graph.name} (${f.graph.file}) — ${tag}`)
        if (f.error) console.log(`    ${f.error}`)
      }
      console.log()
    }

    exitCode = failed + timedout > 0 ? 1 : 0
  } finally {
    // --- Cleanup: remove only env vars we added ---
    const onlyNew = keysSet.filter((k) => newKeys.includes(k))
    if (onlyNew.length > 0) {
      removeMockEnvVars(cookbookDir, onlyNew)
    }
    mock.stop()
  }

  process.exit(exitCode)
}

main()
