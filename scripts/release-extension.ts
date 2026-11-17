/**
 * What the Release workflow runs on `main` when no changesets are waiting: publishes the VS Code
 * extension to the Visual Studio Marketplace and Open VSX if this version has not been released,
 * then creates the `vscode-v<version>` tag and a GitHub release with the VSIX attached.
 *
 * The tag is the record of a finished release. It is created last, so a run that failed part way
 * is safe to run again: a registry that already has the version is skipped.
 *
 * `--dry-run` builds and packages the extension and prints what would be published. It needs no
 * tokens and changes nothing outside the working tree.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const extensionDir = join(root, 'editors', 'vscode')
const dryRun = process.argv.includes('--dry-run')

interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

/** Run a command, echo what it prints, and return it. */
async function capture(
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

async function run(command: readonly string[], cwd: string): Promise<void> {
  const { exitCode } = await capture(command, cwd)

  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} exited with ${exitCode}`)
  }
}

async function readVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(join(extensionDir, 'package.json'), 'utf8'))

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error('editors/vscode/package.json has no version')
  }

  return manifest.version
}

async function tagExists(tag: string): Promise<boolean> {
  const { exitCode, output } = await capture(
    ['git', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`],
    root,
  )

  if (exitCode !== 0) {
    throw new Error(`Could not list tags on origin (exit ${exitCode})`)
  }

  return output.trim().length > 0
}

/** The section of the extension's changelog for one version, without its heading. */
export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split('\n')
  const start = lines.findIndex((line) => line.startsWith('## ') && line.includes(version))

  if (start < 0) {
    return ''
  }

  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))

  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim()
}

/**
 * Publish to one registry. A registry that already has this version is not an error: it means an
 * earlier run got this far.
 */
async function publish(registry: string, command: readonly string[]): Promise<void> {
  console.log(`Publishing to ${registry}.`)
  const { exitCode, output } = await capture(command, extensionDir)

  if (exitCode === 0) {
    return
  }

  if (/already exists|already published/i.test(output)) {
    console.log(`${registry} already has this version; continuing.`)

    return
  }

  throw new Error(`Publishing to ${registry} failed (exit ${exitCode})`)
}

async function main(): Promise<void> {
  const version = await readVersion()
  const tag = `vscode-v${version}`

  if (!dryRun && (await tagExists(tag))) {
    console.log(`${tag} is already released; nothing to do.`)

    return
  }

  const missing = ['VSCE_PAT', 'OVSX_PAT', 'GH_TOKEN'].filter((name) => !process.env[name])

  if (!dryRun && missing.length > 0) {
    throw new Error(
      `Cannot release ${tag}: ${missing.join(', ')} not set. See RELEASE.md, "Credentials".`,
    )
  }

  console.log(`Building and packaging ${tag}.`)
  await run(['bun', 'run', 'build'], root)
  await run(['bun', 'run', 'package:vsix'], extensionDir)

  const vsix = (await readdir(join(extensionDir, 'dist'))).filter((name) => name.endsWith('.vsix'))
  const [file] = vsix

  if (vsix.length !== 1 || file === undefined) {
    throw new Error(`Expected one .vsix in editors/vscode/dist, found ${vsix.length}`)
  }

  const vsixPath = join(extensionDir, 'dist', file)
  const changelog = await readFile(join(extensionDir, 'CHANGELOG.md'), 'utf8')
  const notes = changelogSection(changelog, version) || `Swirls VS Code extension ${version}.`

  if (dryRun) {
    console.log(`\nDry run. Would publish ${file} as ${tag} with these release notes:\n\n${notes}`)

    return
  }

  await publish('the Visual Studio Marketplace', ['bun', 'run', 'publish:vsce'])
  await publish('Open VSX', ['bun', 'run', 'publish:ovsx'])

  const notesPath = join(extensionDir, 'dist', 'release-notes.md')
  await writeFile(notesPath, `${notes}\n`)

  const target = process.env.GITHUB_SHA ?? 'HEAD'

  await run(
    [
      'gh',
      'release',
      'create',
      tag,
      vsixPath,
      '--title',
      `Swirls VS Code extension ${version}`,
      '--notes-file',
      notesPath,
      '--target',
      target,
    ],
    root,
  )

  console.log(`Released ${tag}.`)
}

if (import.meta.main) {
  await main()
}
