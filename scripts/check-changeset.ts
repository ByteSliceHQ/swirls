/**
 * Fail pull requests that change what a released unit ships without a changeset naming it.
 *
 * - The VS Code extension, `vscode-swirls`, ships its own source and the language server,
 *   language and definition it bundles.
 * - The npm package `@swirls/deploy` ships its own source and the language and definition it
 *   compiles in.
 *
 * Skip when:
 * - the PR title starts with `chore(release)`
 * - the PR has the label `skip-changeset`
 * - the diff does not touch source that ends up in a released unit
 */

import { resolve } from 'node:path'

function usage(): never {
  console.error(
    'Usage: bun run scripts/check-changeset.ts --base <sha> --head <sha> [--title <pr title>] [--labels <csv>]',
  )

  process.exit(2)
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)

  if (index < 0) {
    return undefined
  }

  return argv[index + 1]
}

interface ReleasedUnit {
  /** The package name a changeset must name. */
  readonly name: string
  /** What to call it in messages. */
  readonly label: string
  /** Matches the directories whose source ends up in it. */
  readonly source: RegExp
}

const releasedUnits: readonly ReleasedUnit[] = [
  {
    name: 'vscode-swirls',
    label: 'the VS Code extension',
    source: /^(packages\/(definition|language|lsp)|editors\/vscode)\//,
  },
  {
    name: '@swirls/deploy',
    label: 'the @swirls/deploy npm package',
    source: /^packages\/(definition|language|deploy)\//,
  },
]

/** Source under one of a unit's directories that changes what it ships: not docs, tests or tooling. */
function isShippedSource(path: string, unit: ReleasedUnit): boolean {
  if (!unit.source.test(path)) {
    return false
  }

  if (path.endsWith('.md')) {
    return false
  }

  if (
    /\.(test|spec)\./.test(path) ||
    path.includes('/__fixtures__/') ||
    path.includes('/examples/') ||
    path.includes('/scripts/')
  ) {
    return false
  }

  return true
}

/** The package names in a changeset's front matter. */
function changesetPackages(text: string): readonly string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)

  if (!match?.[1]) {
    return []
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => /^\s*['"]?([^'":]+)['"]?\s*:/.exec(line)?.[1]?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0)
}

function isChangesetPath(path: string): boolean {
  return path.startsWith('.changeset/') && path.endsWith('.md') && path !== '.changeset/README.md'
}

const repoRoot = resolve(import.meta.dirname, '..')

async function git(args: readonly string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd: repoRoot, stderr: 'inherit', stdout: 'pipe' })
  const output = await child.stdout.text()
  const exitCode = await child.exited

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} exited with ${exitCode}`)
  }

  return output
}

/** Files changed between the merge base and `head`; `filter` is a `git diff --diff-filter`. */
async function changedFiles(
  base: string,
  head: string,
  filter = 'ACDMRT',
): Promise<readonly string[]> {
  const output = await git(['diff', '--name-only', `--diff-filter=${filter}`, `${base}...${head}`])

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const argv = process.argv.slice(2)
const base = argValue(argv, '--base')
const head = argValue(argv, '--head')
const title = argValue(argv, '--title') ?? ''
const labelsCsv = argValue(argv, '--labels') ?? ''

if (!base || !head) {
  usage()
}

const labels = new Set(
  labelsCsv
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0),
)

if (title.startsWith('chore(release)')) {
  console.log('Skipping changeset check for release PR.')
  process.exit(0)
}

if (labels.has('skip-changeset')) {
  console.log('Skipping changeset check because label skip-changeset is present.')
  process.exit(0)
}

const files = await changedFiles(base, head)
// Changesets the PR adds or edits; one it deletes names nothing.
const changesets = (await changedFiles(base, head, 'ACMR')).filter(isChangesetPath)
const named = new Set<string>()

for (const path of changesets) {
  for (const name of changesetPackages(await git(['show', `${head}:${path}`]))) {
    named.add(name)
  }
}

if (changesets.length > 0) {
  console.log(
    `Found changeset(s): ${changesets.join(', ')} naming ${[...named].join(', ') || 'nothing'}`,
  )
}

const failures: string[] = []

for (const unit of releasedUnits) {
  const shipped = files.filter((path) => isShippedSource(path, unit))

  if (shipped.length === 0) {
    console.log(`${unit.name}: nothing it ships changed.`)
    continue
  }

  if (named.has(unit.name)) {
    console.log(`${unit.name}: changed, and a changeset names it.`)
    continue
  }

  failures.push(
    [
      `This PR changes source ${unit.label} ships but no changeset names \`${unit.name}\`.`,
      '',
      `Changed paths (${shipped.length}):`,
      ...shipped.slice(0, 20).map((path) => `  - ${path}`),
      ...(shipped.length > 20 ? [`  … and ${shipped.length - 20} more`] : []),
      '',
    ].join('\n'),
  )
}

if (failures.length === 0) {
  process.exit(0)
}

console.error(
  [
    ...failures,
    'Add one with `bun run changeset` (a patch or minor for each package named above),',
    'or apply the `skip-changeset` label when nobody using them will notice the change.',
  ].join('\n'),
)

process.exit(1)
