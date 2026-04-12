/**
 * Mock HTTP server for cookbook integration tests.
 *
 * Simulates external services so graphs that depend on HTTP endpoints,
 * Slack webhooks, and inventory APIs can run locally without real credentials.
 *
 * Responses are crafted to exercise happy-path branches (e.g. healthy
 * inventory routes to log_ok, avoiding Resend calls).
 */

import type { Server } from "bun"
import type { ParsedFile } from "./parse"

// ---------------------------------------------------------------------------
// Mock responses
// ---------------------------------------------------------------------------

const INVENTORY_ITEMS = [
  { name: "Widget A", quantity: 150, reorder_point: 20 },
  { name: "Widget B", quantity: 80, reorder_point: 10 },
  { name: "Gadget C", quantity: 200, reorder_point: 50 },
]

function handleRequest(req: Request): Response {
  const url = new URL(req.url)
  const path = url.pathname

  // --- Slack webhook (accepts any POST, returns ok) ---
  if (path.startsWith("/slack")) {
    return Response.json({ ok: true })
  }

  // --- Inventory API ---
  if (path === "/inventory/levels") {
    return Response.json({ items: INVENTORY_ITEMS })
  }

  // --- Health / uptime check ---
  if (path === "/health") {
    return new Response("OK", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })
  }

  // --- Weather API (OpenWeatherMap mock) ---
  if (path.startsWith("/data/2.5/weather")) {
    const q = url.searchParams.get("q") || "San Francisco"
    return Response.json({
      name: q,
      main: { temp: 62.5, humidity: 72 },
      weather: [{ description: "partly cloudy" }],
    })
  }

  // --- GitHub API mock ---
  if (path.startsWith("/repos/")) {
    const repo = path.replace("/repos/", "")
    return Response.json({
      full_name: repo,
      stargazers_count: 1234,
      forks_count: 56,
      open_issues_count: 12,
      watchers_count: 89,
    })
  }

  // --- GitHub OAuth token endpoint mock ---
  if (path === "/login/oauth/access_token") {
    return Response.json({ access_token: "mock-token", token_type: "bearer" })
  }

  // --- Catch-all: return 200 with generic JSON ---
  return Response.json({ status: "ok", path, method: req.method })
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export function startMockServer(port = 0): Server {
  return Bun.serve({
    port,
    fetch: handleRequest,
  })
}

// ---------------------------------------------------------------------------
// Env vars the mock server provides
//
// Swirls secrets use the format `block_name::VAR_NAME` so they resolve
// correctly via context.secrets.<block>.<VAR>.
// ---------------------------------------------------------------------------

/** Mock values keyed by bare var name → value factory. */
type MockValue = (port: number) => string

const MOCK_VALUES: Record<string, MockValue> = {
  SLACK_WEBHOOK_URL: (p) => `http://localhost:${p}/slack`,
  INVENTORY_API_URL: (p) => `http://localhost:${p}/inventory`,
  INVENTORY_API_KEY: () => "mock-inventory-key",
  MONITOR_URL: (p) => `http://localhost:${p}/health`,
  WAREHOUSE_EMAIL: () => "warehouse@test.local",
  ALERT_EMAIL: () => "alert@test.local",
  ANNOUNCE_EMAIL: () => "announce@test.local",
  DIGEST_RECIPIENT: () => "digest@test.local",
  WEATHER_API_KEY: () => "mock-weather-key",
  WEATHER_API_URL: (p) => `http://localhost:${p}`,
  GITHUB_API_URL: (p) => `http://localhost:${p}`,
  EMBEDDING_MODEL: () => "openai/text-embedding-3-small",
  IMAGE_MODEL: () => "openai/dall-e-3",
}

/**
 * Build namespaced env vars (`block::VAR=value`) from parsed cookbook files.
 * Scans all secret blocks and produces entries for vars we can mock.
 */
export function getMockEnvVars(
  port: number,
  parsedFiles: ParsedFile[],
): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const pf of parsedFiles) {
    for (const secret of pf.secrets) {
      for (const varName of secret.vars) {
        const factory = MOCK_VALUES[varName]
        if (factory) {
          vars[`${secret.name}::${varName}`] = factory(port)
        }
      }
    }
  }

  // Also set bare keys (used by implicit node-type resolution like
  // OPENROUTER_API_KEY, RESEND_API_KEY — and for env-var gating in the
  // test runner's skip logic)
  for (const [varName, factory] of Object.entries(MOCK_VALUES)) {
    vars[varName] = factory(port)
  }

  return vars
}

// ---------------------------------------------------------------------------
// Set / remove mock env vars via swirls CLI
// ---------------------------------------------------------------------------

export function setMockEnvVars(
  cookbookDir: string,
  vars: Record<string, string>,
): string[] {
  const set: string[] = []
  for (const [key, value] of Object.entries(vars)) {
    const res = Bun.spawnSync(
      ["swirls", "env", "set", `${key}=${value}`],
      { cwd: cookbookDir },
    )
    if (res.exitCode === 0) set.push(key)
  }
  return set
}

export function removeMockEnvVars(
  cookbookDir: string,
  keys: string[],
): void {
  for (const key of keys) {
    Bun.spawnSync(["swirls", "env", "remove", key], {
      cwd: cookbookDir,
    })
  }
}
