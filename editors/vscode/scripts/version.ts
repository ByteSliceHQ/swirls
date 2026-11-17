/**
 * Bump the VS Code extension's version, commit, and create a vscode-v* tag.
 *
 * The extension bundles the language server, so its version is its own: the
 * `@swirls/*` packages are versioned separately. Nothing publishes on a tag
 * yet; after pushing, run `bun run publish` in editors/vscode.
 *
 * Usage: bun run scripts/version.ts [patch|minor|major] [--dry-run]
 * Default: patch
 */

import { join } from 'node:path'

type Bump = 'patch' | 'minor' | 'major'

/** First matching patch | minor | major in argv; default patch. */
function parseBump(argv: string[]): Bump {
  for (const arg of argv) {
    if (arg === 'patch' || arg === 'minor' || arg === 'major') {
      return arg
    }
  }
  return 'patch'
}

/** `bun pm pkg get version` prints a JSON-encoded string; validate before use. */
function parsePkgVersionOutput(output: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(output.trim())
  } catch {
    throw new Error('bun pm pkg get version did not return valid JSON')
  }
  if (typeof parsed !== 'string') {
    throw new Error(`Expected a JSON string for version, got ${typeof parsed}`)
  }
  return parsed
}

/** Next X.Y.Z for major | minor | patch (no prerelease). */
function bumpSemver(version: string, kind: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`)
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])

  if (kind === 'major') {
    return `${major + 1}.0.0`
  }
  if (kind === 'minor') {
    return `${major}.${minor + 1}.0`
  }
  return `${major}.${minor}.${patch + 1}`
}

/** Read `version` from package.json at packageRoot via bun pm. */
async function readPackageVersion(packageRoot: string): Promise<string> {
  const output = await Bun.$`bun pm pkg get version`.cwd(packageRoot).text()
  return parsePkgVersionOutput(output)
}

/** Refuse to version off main (release commits belong on main after merge). */
async function requireOnMain(repoRoot: string): Promise<void> {
  const branch = (
    await Bun.$`git branch --show-current`.cwd(repoRoot).text()
  ).trim()
  if (branch !== 'main') {
    console.error(
      `Must be on main to version (current branch: ${branch || 'detached HEAD'}).`,
    )
    process.exit(1)
  }
}

/** Refuse to run with uncommitted changes (avoids mixing release with local edits). */
async function requireCleanWorkingTree(repoRoot: string): Promise<void> {
  const output = await Bun.$`git status --porcelain`.cwd(repoRoot).text()
  if (output.trim().length > 0) {
    console.error('Working tree is not clean. Commit or stash changes first.')
    process.exit(1)
  }
}

/** Avoid overwriting an existing release tag. */
async function requireTagMissing(repoRoot: string, tag: string): Promise<void> {
  const output = await Bun.$`git tag -l ${tag}`.cwd(repoRoot).text()
  if (output.trim() === tag) {
    console.error(`Tag already exists: ${tag}`)
    process.exit(1)
  }
}

const SCRIPT_DIR = import.meta.dir
// editors/vscode (extension package root)
const EXTENSION_ROOT = join(SCRIPT_DIR, '..')
// Repository root (three levels up from scripts/)
const REPO_ROOT = join(SCRIPT_DIR, '..', '..', '..')

const EXTENSION_PKG = 'editors/vscode/package.json'
const LOCKFILE = 'bun.lock'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const bump = parseBump(argv)

await requireOnMain(REPO_ROOT)
await requireCleanWorkingTree(REPO_ROOT)

// Compute next semver from the extension package (canonical published version).
const currentVersion = await readPackageVersion(EXTENSION_ROOT)
const nextVersion = bumpSemver(currentVersion, bump)
const tag = `vscode-v${nextVersion}`
const commitMessage = `chore(vscode): bump version to ${nextVersion}`

// Preview only: no file changes, commit, or tag.
if (dryRun) {
  console.log(`Current version\t${currentVersion}`)
  console.log(`Next version\t${nextVersion}`)
  console.log(`Tag\t\t${tag}`)
  console.log('Dry run only: no files changed and no commit/tag created.')
  process.exit(0)
}

await requireTagMissing(REPO_ROOT, tag)

await Bun.$`bun pm version ${bump} --no-git-tag-version --ignore-scripts`.cwd(
  EXTENSION_ROOT,
)

// Refresh the root lockfile after the package.json edit.
await Bun.$`bun install`.cwd(REPO_ROOT)

const extensionVersion = await readPackageVersion(EXTENSION_ROOT)
if (extensionVersion !== nextVersion) {
  throw new Error(
    `Version mismatch after bump: got ${extensionVersion}, expected ${nextVersion}`,
  )
}

await Bun.$`git add ${LOCKFILE} ${EXTENSION_PKG}`.cwd(REPO_ROOT)
await Bun.$`git commit -m ${commitMessage}`.cwd(REPO_ROOT)
await Bun.$`git tag -m ${commitMessage} ${tag}`.cwd(REPO_ROOT)

// Print instructions for pushing changes
console.log(`Version\t${nextVersion}`)
console.log(`Tag\t${tag}`)
console.log(`To push these changes:\n\tgit push && git push origin ${tag}`)
