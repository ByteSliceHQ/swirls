/** Helpers the release scripts share: running commands, reading versions, tags and changelogs. */

import { readFile } from 'node:fs/promises'

interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

/** Run a command, echo what it prints, and return it. */
export async function capture(
  command: readonly string[],
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): Promise<CommandResult> {
  const child = Bun.spawn([...command], { cwd, env, stderr: 'pipe', stdout: 'pipe' })

  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ])

  const output = `${stdout}${stderr}`
  process.stdout.write(output)

  return { exitCode, output }
}

/** Run a command and fail when it exits non-zero. */
export async function run(command: readonly string[], cwd: string): Promise<CommandResult> {
  const result = await capture(command, cwd)

  if (result.exitCode !== 0) {
    throw new Error(`${command.join(' ')} exited with ${result.exitCode}`)
  }

  return result
}

/** The `version` field of a package.json. `label` names the file in the error. */
export async function readVersion(manifestPath: string, label: string): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`${label} has no version`)
  }

  return manifest.version
}

/** Whether `origin` already has this tag. */
export async function tagExists(tag: string, cwd: string): Promise<boolean> {
  const { exitCode, output } = await capture(
    ['git', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`],
    cwd,
  )

  if (exitCode !== 0) {
    throw new Error(`Could not list tags on origin (exit ${exitCode})`)
  }

  return output.trim().length > 0
}

/** The section of a Changesets changelog for one version, without its heading. */
export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${version}`)

  if (start < 0) {
    return ''
  }

  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))

  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim()
}
