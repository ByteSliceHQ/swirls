/**
 * What the Release workflow's `npm` job runs on `main` when no changesets are waiting: publishes
 * `@swirls/deploy` to npm if this version is not on the registry yet, then creates the
 * `@swirls/deploy@<version>` tag and a GitHub release with the changelog entry and the tarball.
 *
 * The package is packed with `bun pm pack`, which turns its `catalog:` and `workspace:` versions
 * into real ones, and the tarball is published with npm, which signs in through GitHub OIDC
 * (trusted publishing) and records provenance. The packed manifest and contents are checked first.
 *
 * Safe to run again: a version npm already has is not published twice, and a tag that exists is
 * not created again. A run that published but failed before tagging creates the tag on its re-run.
 *
 * `--dry-run` builds, packs and checks the tarball, asks npm what it would upload, and prints the
 * tag and release notes. It needs no credentials and publishes, tags and releases nothing.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { capture, changelogSection, readVersion, run, tagExists } from './release-shared'

const root = resolve(import.meta.dirname, '..')
const packageDir = join(root, 'packages', 'deploy')
const packageName = '@swirls/deploy'
const dryRun = process.argv.includes('--dry-run')

/** Files the tarball must contain, as `tar` lists them. */
const requiredFiles = ['package/dist/index.js', 'package/dist/index.d.ts']

/** Whether npm already has this version. Anything but found or not found is an error. */
async function isPublished(version: string): Promise<boolean> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${version}`

  const { output } = await run(
    [
      'curl',
      '--silent',
      '--show-error',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}\n',
      url,
    ],
    root,
  )

  const status = output.trim()

  if (status === '200') {
    return true
  }

  if (status === '404') {
    return false
  }

  throw new Error(`${url} answered ${status}; cannot tell whether ${version} is published`)
}

/**
 * Fail unless the packed manifest is publishable and the tarball holds the build.
 *
 * `bun pm pack` resolves `catalog:` and `workspace:` versions; a stray one would install for nobody.
 */
export function checkPackedPackage(
  manifestText: string,
  files: readonly string[],
  version: string,
): readonly string[] {
  const problems: string[] = []

  for (const protocol of ['catalog:', 'workspace:']) {
    if (manifestText.includes(protocol)) {
      problems.push(`the packed package.json still contains "${protocol}"`)
    }
  }

  const manifest: unknown = JSON.parse(manifestText)

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('name' in manifest) ||
    !('version' in manifest) ||
    manifest.name !== packageName ||
    manifest.version !== version
  ) {
    problems.push(`the packed package.json is not ${packageName}@${version}`)
  }

  for (const file of requiredFiles) {
    if (!files.includes(file)) {
      problems.push(`the tarball has no ${file.replace(/^package\//, '')}`)
    }
  }

  return problems
}

/** Build, pack and check the package. Returns the tarball's path. */
async function packAndCheck(version: string, outDir: string): Promise<string> {
  console.log(`Building ${packageName}.`)
  await run(['bun', 'run', 'build'], packageDir)

  console.log(`Packing ${packageName} with bun.`)
  await run(['bun', 'pm', 'pack', '--destination', outDir], packageDir)

  const tarballs = (await readdir(outDir)).filter((name) => name.endsWith('.tgz'))
  const [file] = tarballs

  if (tarballs.length !== 1 || file === undefined) {
    throw new Error(`Expected one .tgz from bun pm pack, found ${tarballs.length}`)
  }

  const tarball = join(outDir, file)
  const list = await run(['tar', '-tzf', tarball], outDir)
  const manifest = await run(['tar', '-xzOf', tarball, 'package/package.json'], outDir)

  const files = list.output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const problems = checkPackedPackage(manifest.output, files, version)

  if (problems.length > 0) {
    throw new Error(`Refusing to publish ${file}:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  }

  console.log(`${file} checked: versions resolved, ${requiredFiles.join(' and ')} present.`)

  return tarball
}

/** Publish the tarball. npm having the version already means an earlier run got this far. */
async function publish(tarball: string, version: string, cwd: string): Promise<void> {
  const distTag = version.includes('-') ? ['--tag', 'next'] : []

  console.log(`Publishing ${packageName}@${version} to npm.`)

  const { exitCode, output } = await capture(
    ['npm', 'publish', tarball, '--provenance', '--access', 'public', ...distTag],
    cwd,
  )

  if (exitCode === 0) {
    return
  }

  if (/cannot publish over|previously published/i.test(output)) {
    console.log(`npm already has ${packageName}@${version}; continuing.`)

    return
  }

  throw new Error(`npm publish exited with ${exitCode}`)
}

async function main(): Promise<void> {
  const version = await readVersion(
    join(packageDir, 'package.json'),
    'packages/deploy/package.json',
  )

  const tag = `${packageName}@${version}`
  const published = await isPublished(version)
  const tagged = await tagExists(tag, root)

  console.log(
    `${tag}: ${published ? 'on npm' : 'not on npm'}, ${tagged ? 'tagged' : 'not tagged'}.`,
  )

  if (!dryRun && published && tagged) {
    console.log(`${tag} is already released; nothing to do.`)

    return
  }

  if (!dryRun) {
    if (!process.env.GH_TOKEN) {
      throw new Error(`Cannot release ${tag}: GH_TOKEN not set. See RELEASE.md, "npm".`)
    }

    // Trusted publishing exchanges this job's OIDC token for an npm one.
    if (!published && !process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
      throw new Error(
        `Cannot publish ${tag}: no GitHub OIDC token. The job needs "id-token: write"; see RELEASE.md, "npm".`,
      )
    }
  }

  const outDir = await mkdtemp(join(tmpdir(), 'swirls-deploy-release-'))

  try {
    const tarball = await packAndCheck(version, outDir)
    const changelog = await readFile(join(packageDir, 'CHANGELOG.md'), 'utf8')
    const notes = changelogSection(changelog, version) || `${packageName} ${version}.`

    if (dryRun) {
      // npm refuses even a dry run of a version it already has.
      if (!published) {
        console.log('\nWhat npm would upload:')
        await run(['npm', 'publish', tarball, '--dry-run', '--access', 'public'], outDir)
      }

      console.log(
        [
          '',
          `Dry run. ${published ? `npm already has ${version}; would not publish.` : `Would publish ${tarball} with provenance.`}`,
          tagged
            ? `${tag} already exists; would not tag.`
            : `Would create the tag ${tag} and a GitHub release with these notes:\n\n${notes}`,
        ].join('\n'),
      )

      return
    }

    if (!published) {
      await publish(tarball, version, outDir)
    }

    if (tagged) {
      console.log(`${tag} already exists.`)

      return
    }

    const notesPath = join(outDir, 'release-notes.md')
    await writeFile(notesPath, `${notes}\n`)

    await run(
      [
        'gh',
        'release',
        'create',
        tag,
        tarball,
        '--title',
        `${packageName} ${version}`,
        '--notes-file',
        notesPath,
        '--target',
        process.env.GITHUB_SHA ?? 'HEAD',
      ],
      root,
    )

    console.log(`Released ${tag}.`)
  } finally {
    await rm(outDir, { force: true, recursive: true })
  }
}

if (import.meta.main) {
  await main()
}
