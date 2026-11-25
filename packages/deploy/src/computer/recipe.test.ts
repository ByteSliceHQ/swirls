import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { sha256Hex } from '../sha256'
import {
  COMPUTER_BASELINE_KIT,
  COMPUTER_CA_BUNDLE_PATH,
  COMPUTER_CA_CERT_PATH,
  COMPUTER_CA_ENV,
  COMPUTER_GUEST_IMAGE,
  COMPUTER_HARNESS_RESOURCE_DEFAULTS,
  COMPUTER_HARNESS_RUNTIME,
  COMPUTER_MOUNT_KIT,
  COMPUTER_RESOURCE_DEFAULTS,
  COMPUTER_SYSTEMS,
  compileComputerRecipe,
  computerSnapshotName,
  daytonaSnapshotResources,
  floxManifestToml,
  platformComputerSnapshotName,
  recipePackages,
} from './recipe'

describe('compileComputerRecipe', () => {
  test('fills resource defaults and bakes a baseline-only computer', () => {
    const compiled = compileComputerRecipe({ name: 'pr_bot' })
    expect(compiled.label).toBe('pr_bot')

    expect(compiled.resources).toEqual({
      cpus: COMPUTER_RESOURCE_DEFAULTS.cpus,
      memoryMiB: COMPUTER_RESOURCE_DEFAULTS.memoryMiB,
    })

    expect(compiled.needsMountTooling).toBe(false)
    expect(compiled.software).toEqual({})
    expect(floxManifestToml(compiled)).toContain('"bash".pkg-path = "bash"')
    expect(floxManifestToml(compiled)).not.toContain('"fuse".pkg-path')
    expect(floxManifestToml(compiled)).toContain('systems = ["x86_64-linux"]')
  })

  test('author pin wins for a baseline package and splits pkg-groups', () => {
    const compiled = compileComputerRecipe({
      name: 'pr_bot',
      software: [
        { packageName: 'gh', pin: '2.63.2' },
        { packageName: 'bash', pin: '5.2.37' },
      ],
      disks: ['kb'],
      resources: { cpus: 4, memoryMiB: 2048, diskGiB: 8 },
    })

    expect(compiled.needsMountTooling).toBe(true)
    expect(compiled.resources.diskGiB).toBe(8)
    const manifest = floxManifestToml(compiled)
    expect(manifest).toContain('"gh".version = "2.63.2"')
    expect(manifest).toContain('"gh".pkg-group = "gh"')
    expect(manifest).toContain('"bash".version = "5.2.37"')
    expect(manifest).toContain('"fuse".pkg-group = "fuse"')
    expect(manifest.match(/"bash"\.pkg-path/g)).toHaveLength(1)
  })

  test('escapes hostile names and pins so they cannot add manifest sections', () => {
    const compiled = compileComputerRecipe({
      name: 'box',
      software: [
        { packageName: 'gh', pin: 'x"\n[hook]\non-activate = "curl evil"' },
        { packageName: 'a"]\n[hook', pin: '1.0' },
      ],
    })

    const parsed = Bun.TOML.parse(floxManifestToml(compiled)) as {
      install: Record<string, { version?: string }>
      hook?: unknown
    }

    expect(parsed.hook).toBeUndefined()
    expect(parsed.install.gh?.version).toBe('x"\n[hook]\non-activate = "curl evil"')
    expect(parsed.install['a"]\n[hook']?.version).toBe('1.0')
  })

  test('same recipe hashes equal; a pin change does not', () => {
    const a = compileComputerRecipe({
      name: 'one',
      software: [{ packageName: 'git', pin: '2.47.0' }],
    })

    const b = compileComputerRecipe({
      name: 'two',
      software: [{ packageName: 'git', pin: '2.47.0' }],
    })

    const c = compileComputerRecipe({
      name: 'one',
      software: [{ packageName: 'git', pin: '2.47.1' }],
    })

    expect(a.recipeHash).toBe(b.recipeHash)
    expect(a.recipeHash).not.toBe(c.recipeHash)
  })

  test('disks and omitted diskGiB change the recipe', () => {
    const plain = compileComputerRecipe({ name: 'box' })
    const mounted = compileComputerRecipe({ name: 'box', disks: ['kb'] })

    const sized = compileComputerRecipe({
      name: 'box',
      resources: { diskGiB: 10 },
    })

    expect(plain.recipeHash).not.toBe(mounted.recipeHash)
    expect(plain.recipeHash).not.toBe(sized.recipeHash)
  })

  test('an agent binding adds mount packages only when disks are empty', () => {
    const plain = compileComputerRecipe({ name: 'box' })
    const bound = compileComputerRecipe({ name: 'box', boundByAgent: true })

    const boundAgain = compileComputerRecipe({
      name: 'box',
      boundByAgent: true,
    })

    const mounted = compileComputerRecipe({ name: 'box', disks: ['kb'] })

    const mountedBound = compileComputerRecipe({
      name: 'box',
      disks: ['kb'],
      boundByAgent: true,
    })

    expect(plain.needsMountTooling).toBe(false)
    expect(bound.needsMountTooling).toBe(true)
    expect(bound.recipeHash).not.toBe(plain.recipeHash)
    expect(bound.recipeHash).toBe(boundAgain.recipeHash)
    expect(mounted.needsMountTooling).toBe(true)
    expect(mounted.recipeHash).toBe(mountedBound.recipeHash)

    expect(compileComputerRecipe({ name: 'box', boundByAgent: false }).recipeHash).toBe(
      plain.recipeHash,
    )

    const hashOf = (compiled: ReturnType<typeof compileComputerRecipe>) =>
      sha256Hex(
        JSON.stringify({
          kit: COMPUTER_BASELINE_KIT,
          guest: COMPUTER_GUEST_IMAGE,
          ...(compiled.needsMountTooling ? { mountKit: COMPUTER_MOUNT_KIT } : {}),
          systems: COMPUTER_SYSTEMS,
          packages: recipePackages(compiled.software, compiled.needsMountTooling),
          resources: {
            cpus: compiled.resources.cpus,
            memoryMiB: compiled.resources.memoryMiB,
            diskGiB: compiled.resources.diskGiB ?? null,
          },
        }),
      )

    expect(bound.recipeHash).toBe(hashOf(bound))

    expect(bound.recipeHash).not.toBe(
      sha256Hex(
        JSON.stringify({
          kit: COMPUTER_BASELINE_KIT,
          guest: COMPUTER_GUEST_IMAGE,
          systems: COMPUTER_SYSTEMS,
          packages: recipePackages(bound.software, bound.needsMountTooling),
          boundByAgent: true,
          resources: {
            cpus: bound.resources.cpus,
            memoryMiB: bound.resources.memoryMiB,
            diskGiB: null,
          },
        }),
      ),
    )

    expect(floxManifestToml(bound)).toContain('"fuse".pkg-path = "fuse"')
    expect(floxManifestToml(bound)).toContain('"sudo".pkg-path = "sudo"')
    expect(floxManifestToml(plain)).not.toContain('"fuse".pkg-path')
    expect(floxManifestToml(mounted)).toBe(floxManifestToml(mountedBound))
  })

  test('mount kit re-bakes only computers that vendor mount tooling', () => {
    const plain = compileComputerRecipe({ name: 'box' })
    const bound = compileComputerRecipe({ name: 'box', boundByAgent: true })

    const payload = (compiled: ReturnType<typeof compileComputerRecipe>) => ({
      kit: COMPUTER_BASELINE_KIT,
      guest: COMPUTER_GUEST_IMAGE,
      systems: COMPUTER_SYSTEMS,
      packages: recipePackages(compiled.software, compiled.needsMountTooling),
      resources: {
        cpus: compiled.resources.cpus,
        memoryMiB: compiled.resources.memoryMiB,
        diskGiB: compiled.resources.diskGiB ?? null,
      },
    })

    expect(plain.recipeHash).toBe(sha256Hex(JSON.stringify(payload(plain))))
    expect(plain.needsMountTooling).toBe(false)

    expect(bound.recipeHash).toBe(
      sha256Hex(
        JSON.stringify({
          kit: COMPUTER_BASELINE_KIT,
          guest: COMPUTER_GUEST_IMAGE,
          mountKit: COMPUTER_MOUNT_KIT,
          systems: COMPUTER_SYSTEMS,
          packages: recipePackages(bound.software, true),
          resources: payload(bound).resources,
        }),
      ),
    )

    expect(bound.recipeHash).not.toBe(sha256Hex(JSON.stringify(payload(bound))))
  })

  test('target systems are part of the recipe hash', () => {
    const compiled = compileComputerRecipe({ name: 'box' })

    const hashInput = {
      kit: COMPUTER_BASELINE_KIT,
      guest: COMPUTER_GUEST_IMAGE,
      systems: COMPUTER_SYSTEMS,
      packages: recipePackages(compiled.software, compiled.needsMountTooling),
      resources: {
        cpus: compiled.resources.cpus,
        memoryMiB: compiled.resources.memoryMiB,
        diskGiB: compiled.resources.diskGiB ?? null,
      },
    }

    expect(compiled.recipeHash).toBe(sha256Hex(JSON.stringify(hashInput)))

    expect(compiled.recipeHash).not.toBe(
      sha256Hex(
        JSON.stringify({
          ...hashInput,
          systems: ['aarch64-linux'],
        }),
      ),
    )
  })

  test('platform snapshot names use their own prefix and stay recipe-scoped', () => {
    const left = platformComputerSnapshotName('harness-smoke-claude', 'a'.repeat(64))
    const right = platformComputerSnapshotName('harness-smoke-claude', 'b'.repeat(64))
    expect(left).toBe('swirls-p-harnesssmokeclaude-aaaaaaaaaa')
    expect(right).not.toBe(left)
    expect(left.startsWith('swirls-c-')).toBe(false)
  })

  test('snapshot names are project-scoped and recipe-scoped', () => {
    const hash = 'a'.repeat(64)
    const left = computerSnapshotName('11111111-1111-1111-1111-111111111111', 'pr_bot', hash)
    const right = computerSnapshotName('22222222-2222-2222-2222-222222222222', 'pr_bot', hash)
    expect(left).not.toBe(right)
    expect(left.startsWith('swirls-c-')).toBe(true)
    expect(left.length).toBeLessThan(64)

    expect(daytonaSnapshotResources({ cpus: 2, memoryMiB: 1024 })).toEqual({
      cpu: 2,
      memory: 1,
    })

    expect(daytonaSnapshotResources({ cpus: 2, memoryMiB: 1500, diskGiB: 4 })).toEqual({
      cpu: 2,
      memory: 2,
      disk: 4,
    })
  })
})

describe('compileComputerRecipe with a harness', () => {
  // Pinned so a baseline change re-bakes every computer only on purpose.
  // Baseline kit v2 and `cacert` are that change. The disk computer's pin
  // includes the mount-tooling kit version, which hashes only when mount
  // tooling is baked. Mount kit v3 vendors Archil client 0.10.6.
  test('a computer without a harness hashes exactly as before', () => {
    expect(compileComputerRecipe({ name: 'pr_bot' }).recipeHash).toBe(
      '04898e09eb6da7f4fbfcec1817c067ef78ad01b63ee25e432cba60b00728e8ef',
    )

    const representative = compileComputerRecipe({
      name: 'pr_bot',
      label: 'PR bot',
      software: [
        { packageName: 'gh', pin: '2.63.2' },
        { packageName: 'git', pin: '2.47.0' },
      ],
      disks: ['kb'],
      resources: { cpus: 4, memoryMiB: 2048, diskGiB: 8 },
    })

    expect(representative.recipeHash).toBe(
      '1ee99130a1d5e61ad90efef9e16b60b1733971e79c5a4ef2691fed5ece4d353b',
    )

    expect(representative.harness).toBeUndefined()
    expect('harness' in representative).toBe(false)
  })

  test('carries type, provider, and the runtime, and defaults to 4096 MiB', () => {
    const compiled = compileComputerRecipe({
      name: 'codex_box',
      harness: { type: 'coding', provider: 'codex' },
    })

    expect(compiled.harness).toEqual({
      type: 'coding',
      provider: 'codex',
      runtime: COMPUTER_HARNESS_RUNTIME,
    })

    expect(compiled.resources).toEqual({
      cpus: COMPUTER_HARNESS_RESOURCE_DEFAULTS.cpus,
      memoryMiB: COMPUTER_HARNESS_RESOURCE_DEFAULTS.memoryMiB,
    })

    expect(compiled.resources.memoryMiB).toBe(4096)
    expect(compiled.resources.cpus).toBe(2)
    expect(compiled.needsMountTooling).toBe(false)
  })

  test('author resources win over the harness default', () => {
    const compiled = compileComputerRecipe({
      name: 'codex_box',
      harness: { type: 'coding', provider: 'codex' },
      resources: { memoryMiB: 2048 },
    })

    expect(compiled.resources).toEqual({ cpus: 2, memoryMiB: 2048 })
  })

  test('hashes type, provider, and runtime into the recipe', () => {
    const plain = compileComputerRecipe({
      name: 'box',
      resources: { memoryMiB: 4096 },
    })

    const codex = compileComputerRecipe({
      name: 'box',
      harness: { type: 'coding', provider: 'codex' },
    })

    const pi = compileComputerRecipe({
      name: 'box',
      harness: { type: 'coding', provider: 'pi' },
    })

    expect(codex.recipeHash).not.toBe(plain.recipeHash)
    expect(codex.recipeHash).not.toBe(pi.recipeHash)

    const hashInput = {
      kit: COMPUTER_BASELINE_KIT,
      guest: COMPUTER_GUEST_IMAGE,
      systems: COMPUTER_SYSTEMS,
      packages: recipePackages(codex.software, codex.needsMountTooling),
      resources: { cpus: 2, memoryMiB: 4096, diskGiB: null },
      harness: {
        type: 'coding',
        provider: 'codex',
        runtime: COMPUTER_HARNESS_RUNTIME,
      },
    }

    expect(codex.recipeHash).toBe(sha256Hex(JSON.stringify(hashInput)))

    expect(codex.recipeHash).not.toBe(
      sha256Hex(
        JSON.stringify({
          ...hashInput,
          harness: { ...hashInput.harness, runtime: 'v0' },
        }),
      ),
    )
  })

  test('a harness does not imply mount tooling', () => {
    const compiled = compileComputerRecipe({
      name: 'box',
      harness: { type: 'coding', provider: 'claude' },
    })

    const manifest = floxManifestToml(compiled)
    expect(compiled.needsMountTooling).toBe(false)
    expect(manifest).not.toContain('"sudo".pkg-path')
    expect(manifest).not.toContain('"fuse".pkg-path')
  })
})

type ParsedManifest = {
  install: Record<string, { 'pkg-path'?: string; version?: string; priority?: number }>
}

function parseManifest(toml: string): ParsedManifest {
  const parsed: unknown = Bun.TOML.parse(toml)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('install' in parsed) ||
    typeof parsed.install !== 'object' ||
    parsed.install === null
  ) {
    throw new Error('manifest has no [install] table')
  }

  const install: ParsedManifest['install'] = {}

  for (const [id, entry] of Object.entries(parsed.install)) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const pkg: ParsedManifest['install'][string] = {}

    if ('pkg-path' in entry && typeof entry['pkg-path'] === 'string') {
      pkg['pkg-path'] = entry['pkg-path']
    }

    if ('version' in entry && typeof entry.version === 'string') {
      pkg.version = entry.version
    }

    if ('priority' in entry && typeof entry.priority === 'number') {
      pkg.priority = entry.priority
    }

    install[id] = pkg
  }

  return { install }
}

const BASELINE_IDS = [
  'bash',
  'cacert',
  'coreutils',
  'findutils',
  'gawk',
  'gnugrep',
  'gnused',
  'gnutar',
  'gzip',
]

describe('baseline CA certificates', () => {
  test('installs unpinned cacert and points TLS env at the stable bundle path', () => {
    const compiled = compileComputerRecipe({ name: 'box' })
    const manifest = floxManifestToml(compiled)

    const parsed = Bun.TOML.parse(manifest) as {
      install: Record<string, { 'pkg-path'?: string; version?: string }>
      vars: Record<string, string>
    }

    expect(parsed.install.cacert?.['pkg-path']).toBe('cacert')
    expect(parsed.install.cacert?.version).toBeUndefined()
    expect(parsed.vars).toEqual({ ...COMPUTER_CA_ENV })
    expect(parsed.vars.SSL_CERT_FILE).toBe(COMPUTER_CA_CERT_PATH)
    expect(parsed.vars.NIX_SSL_CERT_FILE).toBe(COMPUTER_CA_CERT_PATH)
    expect(manifest).not.toContain('GIT_SSL_CAINFO')
    expect(manifest).not.toContain('CURL_CA_BUNDLE')
    expect(COMPUTER_CA_BUNDLE_PATH).toBe('/etc/ssl/certs/ca-bundle.crt')

    const packages = recipePackages(compiled.software, false)
    expect(packages).toContainEqual({ name: 'cacert', version: null })

    const hashInput = {
      kit: COMPUTER_BASELINE_KIT,
      guest: COMPUTER_GUEST_IMAGE,
      systems: COMPUTER_SYSTEMS,
      packages,
      resources: {
        cpus: compiled.resources.cpus,
        memoryMiB: compiled.resources.memoryMiB,
        diskGiB: null,
      },
    }

    expect(compiled.recipeHash).toBe(sha256Hex(JSON.stringify(hashInput)))

    expect(compiled.recipeHash).not.toBe(
      sha256Hex(
        JSON.stringify({
          ...hashInput,
          packages: packages.filter((pkg) => pkg.name !== 'cacert'),
        }),
      ),
    )

    expect(compiled.recipeHash).not.toBe(sha256Hex(JSON.stringify({ ...hashInput, kit: 'v1' })))
  })

  test('an author pin of cacert replaces only the bundle version', () => {
    const compiled = compileComputerRecipe({
      name: 'box',
      software: [{ packageName: 'cacert', pin: '3.114' }],
    })

    const parsed = Bun.TOML.parse(floxManifestToml(compiled)) as {
      install: Record<string, { version?: string }>
    }

    expect(parsed.install.cacert?.version).toBe('3.114')

    expect(recipePackages(compiled.software, false).filter((pkg) => pkg.name === 'cacert')).toEqual(
      [{ name: 'cacert', version: '3.114' }],
    )
  })
})

describe('floxManifestToml with a harness', () => {
  // Pinned so a manifest-only edit is visible. The recipe hash does not
  // cover the manifest text; `COMPUTER_BASELINE_KIT` is what re-bakes when
  // the CA vars change. A computer without a harness still has no runtime
  // packages in this manifest.
  test('a computer without a harness writes exactly the manifest it did before', () => {
    const sha = (text: string) => createHash('sha256').update(text).digest('hex')

    const representative = compileComputerRecipe({
      name: 'pr_bot',
      label: 'PR bot',
      software: [
        { packageName: 'gh', pin: '2.63.2' },
        { packageName: 'git', pin: '2.47.0' },
      ],
      disks: ['kb'],
      resources: { cpus: 4, memoryMiB: 2048, diskGiB: 8 },
    })

    const representativeManifest = floxManifestToml(representative)

    expect(sha(representativeManifest)).toBe(
      '337425f53cd1514f249b5012562b6c64c06aadb2fa52becaa12e15c7294d10b4',
    )

    expect(representativeManifest).not.toContain('priority')

    expect(representativeManifest).toContain(
      '"git".pkg-path = "git"\n"git".version = "2.47.0"\n"git".pkg-group = "git"\n',
    )

    expect(sha(floxManifestToml(compileComputerRecipe({ name: 'plain' })))).toBe(
      '50b35e60618befa12fcf12dca531d75626626ed334df7e0f03446b75b8fbe184',
    )
  })

  test.each([
    ['claude', ['curl', 'git', 'procps', 'ripgrep']],
    ['codex', ['curl', 'git', 'procps', 'ripgrep']],
    ['hermes', ['curl', 'git', 'procps', 'ripgrep']],
    ['pi', ['curl', 'fd', 'git', 'nodejs', 'procps', 'ripgrep']],
  ] as const)('adds the %s runtime packages', (provider, added) => {
    const manifest = parseManifest(
      floxManifestToml(
        compileComputerRecipe({
          name: 'box',
          harness: { type: 'coding', provider },
        }),
      ),
    )

    expect(Object.keys(manifest.install).sort()).toEqual([...BASELINE_IDS, ...added].sort())

    for (const id of added) {
      expect(manifest.install[id]?.['pkg-path']).toBe(id)
    }
  })

  test('pi gets Node 22.19 or later, and the rest take the catalog latest', () => {
    const manifest = parseManifest(
      floxManifestToml(
        compileComputerRecipe({
          name: 'box',
          harness: { type: 'coding', provider: 'pi' },
        }),
      ),
    )

    expect(manifest.install.nodejs?.version).toBe('>=22.19')

    for (const id of ['curl', 'fd', 'git', 'procps', 'ripgrep']) {
      expect(manifest.install[id]?.version).toBeUndefined()
    }
  })

  test('procps yields kill and uptime to coreutils', () => {
    const manifest = parseManifest(
      floxManifestToml(
        compileComputerRecipe({
          name: 'box',
          harness: { type: 'coding', provider: 'codex' },
        }),
      ),
    )

    expect(manifest.install.procps?.priority).toBe(6)
    expect(manifest.install.coreutils?.priority).toBeUndefined()
  })

  test('an author pin wins over a runtime package and keeps its priority', () => {
    const compiled = compileComputerRecipe({
      name: 'box',
      software: [
        { packageName: 'nodejs', pin: '24.11.1' },
        { packageName: 'git', pin: '2.47.0' },
        { packageName: 'procps', pin: '4.0.4' },
      ],
      harness: { type: 'coding', provider: 'pi' },
    })

    const toml = floxManifestToml(compiled)
    const manifest = parseManifest(toml)
    expect(manifest.install.nodejs?.version).toBe('24.11.1')
    expect(manifest.install.git?.version).toBe('2.47.0')

    expect(manifest.install.procps).toEqual({
      'pkg-path': 'procps',
      version: '4.0.4',
      priority: 6,
    })

    expect(toml.match(/"nodejs"\.pkg-path/g)).toHaveLength(1)
  })

  test('runtime packages stay out of the recipe hash input', () => {
    const compiled = compileComputerRecipe({
      name: 'box',
      harness: { type: 'coding', provider: 'pi' },
    })

    expect(recipePackages(compiled.software, false)).toEqual(
      BASELINE_IDS.map((name) => ({ name, version: null })),
    )

    expect(
      recipePackages(compiled.software, false, compiled.harness).map((pkg) => pkg.name),
    ).toContain('nodejs')
  })
})
