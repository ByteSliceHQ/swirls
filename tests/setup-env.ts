#!/usr/bin/env bun
/**
 * Interactive setup script for cookbook test environment variables.
 *
 * Scans every .swirls file in the cookbook, determines which env vars each
 * graph needs, checks which are already set via `swirls env list`, and
 * prompts for any missing ones.
 *
 * Usage:
 *   bun run tests/setup-env.ts
 */

import { createInterface } from 'node:readline'
import { join } from 'node:path'
import {
  scanCookbookSync,
  buildGraphTestInfos,
  getAvailableEnvVars,
} from './parse'

const cookbookDir = join(import.meta.dir, '..', 'cookbook')

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
})
const ask = (q: string): Promise<string> =>
  new Promise((r) => rl.question(q, r))

async function main() {
  const parsed = scanCookbookSync(cookbookDir)
  const graphs = buildGraphTestInfos(parsed)
  const available = getAvailableEnvVars(cookbookDir)

  // Collect union of all required vars and which graphs use them
  const varToGraphs = new Map<string, string[]>()
  for (const g of graphs) {
    for (const v of g.requiredEnvVars) {
      if (!varToGraphs.has(v)) varToGraphs.set(v, [])
      varToGraphs.get(v)!.push(g.name)
    }
  }

  const allVars = [...varToGraphs.keys()].sort()
  const missing = allVars.filter((v) => !available.has(v))

  console.log(
    `\nFound ${graphs.length} graphs across ${parsed.length} files.\n`,
  )
  console.log('Environment variables:\n')

  for (const v of allVars) {
    const status = available.has(v) ? '\x1b[32m+\x1b[0m' : '\x1b[31m-\x1b[0m'
    const graphNames = varToGraphs.get(v)!
    console.log(
      `  ${status} ${v}  (${graphNames.length} graph${graphNames.length === 1 ? '' : 's'})`,
    )
  }

  if (missing.length === 0) {
    console.log('\nAll required variables are set. Run the tests:\n')
    console.log('  bun run tests/cookbook.test.ts\n')
    rl.close()
    return
  }

  console.log(
    `\n${missing.length} variable${missing.length === 1 ? '' : 's'} not set. Enter values below (press Enter to skip):\n`,
  )

  const skipped: string[] = []

  for (const varName of missing) {
    const graphNames = varToGraphs.get(varName)!
    const value = await ask(
      `  ${varName} (${graphNames.length} graph${graphNames.length === 1 ? '' : 's'}): `,
    )

    if (value.trim()) {
      const res = Bun.spawnSync(
        ['swirls', 'env', 'set', `${varName}=${value.trim()}`],
        { cwd: cookbookDir },
      )
      if (res.exitCode === 0) {
        console.log(`    set ${varName}`)
      } else {
        console.log(
          `    failed to set ${varName}: ${res.stderr.toString().trim()}`,
        )
      }
    } else {
      skipped.push(varName)
    }
  }

  if (skipped.length > 0) {
    const affectedGraphs = new Set<string>()
    for (const v of skipped) {
      for (const g of varToGraphs.get(v)!) affectedGraphs.add(g)
    }
    console.log(`\nSkipped: ${skipped.join(', ')}`)
    console.log(
      `Graphs that will be skipped in tests: ${[...affectedGraphs].sort().join(', ')}`,
    )
  }

  console.log('\nRun the tests:\n')
  console.log('  bun run tests/cookbook.test.ts\n')
  rl.close()
}

main()
