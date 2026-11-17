import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

/**
 * Run in a subprocess so we observe real stdout/stderr routing rather than
 * test-runner console internals.
 */
async function runWithGuard(code: string) {
  const guardPath = join(import.meta.dir, 'stdio-guard.ts')

  const proc = Bun.spawn(['bun', '-e', `await import(${JSON.stringify(guardPath)})\n${code}`], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr] = await Promise.all([proc.stdout.text(), proc.stderr.text()])

  await proc.exited
  return { stdout, stderr }
}

describe('stdio-guard', () => {
  test('console.log/info/debug are rerouted off stdout (the LSP protocol channel)', async () => {
    const { stdout, stderr } = await runWithGuard(
      `console.log('from log'); console.info('from info'); console.debug('from debug')`,
    )

    expect(stdout).toBe('')
    expect(stderr).toContain('from log')
    expect(stderr).toContain('from info')
    expect(stderr).toContain('from debug')
  })

  test('process.stdout writes are untouched so JSON-RPC frames still flow', async () => {
    const { stdout } = await runWithGuard(`process.stdout.write('Content-Length: 2\\r\\n\\r\\n{}')`)
    expect(stdout).toBe('Content-Length: 2\r\n\r\n{}')
  })
})
