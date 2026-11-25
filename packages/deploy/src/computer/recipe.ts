import { sha256Hex } from '../sha256'
import { COMPUTER_HARNESS_RUNTIME, harnessRuntimePackages } from './harness-runtime'

export { COMPUTER_HARNESS_RUNTIME }

/**
 * Flox catalog packages that provide the promised PATH baseline.
 * Command names (`ls`, `grep`, …) are not package names.
 * `cacert` is the Mozilla CA bundle, not a command. Guest prep copies it
 * onto the standard certificate paths.
 */
export const COMPUTER_BASELINE_PACKAGES = [
  'bash',
  'cacert',
  'coreutils',
  'findutils',
  'gawk',
  'gnugrep',
  'gnused',
  'gnutar',
  'gzip',
] as const

/**
 * Where guest prep installs the `cacert` bundle. Nix store paths change
 * with the catalog, so TLS clients use this stable path. Go reads it
 * directly; Nix OpenSSL reads it through the image env below.
 * A runtime that prepares the guest must install it at the same path.
 */
export const COMPUTER_CA_CERT_PATH = '/etc/ssl/certs/ca-certificates.crt'

/** Second standard name for the same bundle (Red Hat-style path). */
export const COMPUTER_CA_BUNDLE_PATH = '/etc/ssl/certs/ca-bundle.crt'

/**
 * Image env for Nix OpenSSL (`git`, `curl`, Python). Set in the Flox
 * manifest, which applies on entrypoint activation, and again as OCI
 * `ENV`, because Daytona `executeCommand` does not activate the image.
 * `GIT_SSL_CAINFO` and `CURL_CA_BUNDLE` are unnecessary: those clients
 * use OpenSSL, which honors these two. Changing them requires a
 * `COMPUTER_BASELINE_KIT` bump — the manifest text is not hashed.
 */
export const COMPUTER_CA_ENV = {
  NIX_SSL_CERT_FILE: COMPUTER_CA_CERT_PATH,
  SSL_CERT_FILE: COMPUTER_CA_CERT_PATH,
} as const

/**
 * Added to the Flox recipe when `disks:` is non-empty or any agent in the
 * deployment binds this computer. The recipe hash covers the package set, so
 * the binding itself is not hashed.
 */
export const COMPUTER_MOUNT_PACKAGES = ['fuse', 'sudo'] as const

/**
 * Vendored mount tooling (Archil client and sudoers). Bump to re-bake those
 * snapshots. Hashed only when mount tooling is baked, so a shell-only
 * computer with no disks and no agent binding does not re-bake.
 * `COMPUTER_BASELINE_KIT` and `COMPUTER_GUEST_IMAGE` re-bake every computer.
 */
export const COMPUTER_MOUNT_KIT = 'v3'

/**
 * Bump when the baseline package set or the guest CA bundle changes so
 * existing snapshots re-bake. `v2` adds `cacert` and the TLS env.
 */
export const COMPUTER_BASELINE_KIT = 'v2'

/**
 * OS user and scratch dir the Flox closure does not contain. Part of the
 * recipe hash so a change re-bakes snapshots that would otherwise stay active.
 */
export const COMPUTER_GUEST_IMAGE = 'daytona-1001'

/**
 * Target systems locked into the Flox manifest. Part of the recipe hash so a
 * change re-bakes snapshots.
 */
export const COMPUTER_SYSTEMS = ['x86_64-linux'] as const

export const COMPUTER_RESOURCE_DEFAULTS = {
  cpus: 2,
  memoryMiB: 1024,
} as const

/** Vendor minimums for coding harnesses start at 4 GB. */
export const COMPUTER_HARNESS_RESOURCE_DEFAULTS = {
  cpus: 2,
  memoryMiB: 4096,
} as const

/** The authored `harness: { type, provider }` block. */
export type ComputerHarnessInput = {
  type: string
  provider: string
}

/** A compiled harness carries the runtime its base image was baked for. */
export type CompiledComputerHarness = ComputerHarnessInput & {
  runtime: string
}

export type ComputerRecipeInput = {
  name: string
  label?: string
  description?: string
  software?: ReadonlyArray<{ packageName: string; pin: string }>
  disks?: readonly string[]
  resources?: {
    cpus?: number
    memoryMiB?: number
    diskGiB?: number
  }
  harness?: ComputerHarnessInput
  /**
   * True when any agent in this deployment names the computer. A second agent
   * does not change the baked packages, and neither does this flag when
   * `disks:` is already non-empty.
   */
  boundByAgent?: boolean
}

export type CompiledComputerResources = {
  cpus: number
  memoryMiB: number
  diskGiB?: number
}

export type CompiledComputer = {
  name: string
  label: string
  description?: string
  /** Author pins only. Baseline packages are not listed here. */
  software: Record<string, string>
  disks: string[]
  resources: CompiledComputerResources
  needsMountTooling: boolean
  /** Present only when the computer declares a `harness` block. */
  harness?: CompiledComputerHarness
  recipeHash: string
}

type PackagePin = {
  name: string
  version: string | null
  /** Flox file-conflict priority. Only harness runtime packages set one. */
  priority?: number
}

export function compileComputerRecipe(input: ComputerRecipeInput): CompiledComputer {
  const software: Record<string, string> = {}

  for (const pin of input.software ?? []) {
    software[pin.packageName] = pin.pin
  }

  const disks = [...(input.disks ?? [])]

  const harness: CompiledComputerHarness | undefined = input.harness
    ? {
        type: input.harness.type,
        provider: input.harness.provider,
        runtime: COMPUTER_HARNESS_RUNTIME,
      }
    : undefined

  const defaults = harness ? COMPUTER_HARNESS_RESOURCE_DEFAULTS : COMPUTER_RESOURCE_DEFAULTS

  const resources: CompiledComputerResources = {
    cpus: input.resources?.cpus ?? defaults.cpus,
    memoryMiB: input.resources?.memoryMiB ?? defaults.memoryMiB,
    ...(input.resources?.diskGiB != null ? { diskGiB: input.resources.diskGiB } : {}),
  }

  const needsMountTooling = disks.length > 0 || input.boundByAgent === true

  const recipeHash = sha256Hex(
    JSON.stringify({
      kit: COMPUTER_BASELINE_KIT,
      guest: COMPUTER_GUEST_IMAGE,
      ...(needsMountTooling ? { mountKit: COMPUTER_MOUNT_KIT } : {}),
      systems: COMPUTER_SYSTEMS,
      // Harness runtime packages are left out: the provider and runtime below
      // already name them, and leaving them out keeps this input unchanged.
      packages: recipePackages(software, needsMountTooling),
      resources: {
        cpus: resources.cpus,
        memoryMiB: resources.memoryMiB,
        diskGiB: resources.diskGiB ?? null,
      },
      // Omitted without a block, so a computer without a harness hashes
      // exactly as it did before harnesses existed.
      ...(harness
        ? {
            harness: {
              type: harness.type,
              provider: harness.provider,
              runtime: harness.runtime,
            },
          }
        : {}),
    }),
  )

  return {
    name: input.name,
    label: input.label?.trim() ? input.label : input.name,
    ...(input.description ? { description: input.description } : {}),
    software,
    disks,
    resources,
    needsMountTooling,
    ...(harness ? { harness } : {}),
    recipeHash,
  }
}

/**
 * Catalog packages in the image, author pin winning over the baseline and the
 * harness runtime. A pin replaces only the version; a runtime package keeps
 * its file-conflict priority.
 */
export function recipePackages(
  software: Record<string, string>,
  needsMountTooling: boolean,
  harness?: Pick<CompiledComputerHarness, 'provider'>,
): PackagePin[] {
  const packages = new Map<string, PackagePin>()

  for (const name of COMPUTER_BASELINE_PACKAGES) {
    packages.set(name, { name, version: null })
  }

  if (needsMountTooling) {
    for (const name of COMPUTER_MOUNT_PACKAGES) {
      packages.set(name, { name, version: null })
    }
  }

  if (harness) {
    for (const pkg of harnessRuntimePackages(harness.provider)) {
      packages.set(pkg.name, { ...pkg })
    }
  }

  for (const [name, pin] of Object.entries(software)) {
    const runtime = packages.get(name)

    packages.set(
      name,
      runtime?.priority != null
        ? { name, version: pin, priority: runtime.priority }
        : { name, version: pin },
    )
  }

  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Org-scoped Daytona snapshot name. Includes the project so two projects
 * cannot collide, and the recipe hash so a superseded snapshot can coexist
 * with the new one.
 */
export function computerSnapshotName(
  projectId: string,
  computerName: string,
  recipeHash: string,
): string {
  const project = projectId.replace(/-/g, '').slice(0, 8)
  const name = snapshotComputerSegment(computerName)
  return `swirls-c-${project}-${name}-${recipeHash.slice(0, 10)}`
}

/**
 * Daytona snapshot name for a computer the platform owns, such as the harness
 * release smoke test's guests. It follows `computerSnapshotName`, but the
 * `swirls-p-` prefix replaces the customer `swirls-c-<project>` prefix, so a
 * platform snapshot can never collide with a project's or be collected by a
 * project's snapshot GC.
 */
export function platformComputerSnapshotName(computerName: string, recipeHash: string): string {
  return `swirls-p-${snapshotComputerSegment(computerName)}-${recipeHash.slice(0, 10)}`
}

function snapshotComputerSegment(computerName: string): string {
  return (
    computerName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20) || 'computer'
  )
}

/**
 * TOML basic string. JSON escapes quotes, backslashes, and C0 controls the
 * same way TOML does; DEL is the one control JSON leaves raw.
 */
function tomlString(value: string): string {
  return JSON.stringify(value).replace(/\u007f/g, '\\u007F')
}

/** Transient Flox manifest. One pkg-group per package so tight pins can lock. */
export function floxManifestToml(computer: CompiledComputer): string {
  const lines = [
    '# Generated from a computer recipe. Not authored in .swirls.',
    'schema-version = "1.15.0"',
    '',
    '[install]',
  ]

  for (const pkg of recipePackages(
    computer.software,
    computer.needsMountTooling,
    computer.harness,
  )) {
    const id = tomlString(pkg.name)
    lines.push(`${id}.pkg-path = ${id}`)

    if (pkg.version) {
      lines.push(`${id}.version = ${tomlString(pkg.version)}`)
    }

    if (pkg.priority != null) {
      lines.push(`${id}.priority = ${pkg.priority}`)
    }

    lines.push(`${id}.pkg-group = ${id}`)
    lines.push('')
  }

  lines.push('[vars]')

  for (const [name, value] of Object.entries(COMPUTER_CA_ENV)) {
    lines.push(`${name} = ${tomlString(value)}`)
  }

  lines.push('')
  lines.push('[options]')
  lines.push(`systems = ${JSON.stringify(COMPUTER_SYSTEMS)}`)
  lines.push('')
  return lines.join('\n')
}

/** Daytona snapshot resources. Memory is GiB; omitted disk stays omitted. */
export function daytonaSnapshotResources(resources: CompiledComputerResources): {
  cpu: number
  memory: number
  disk?: number
} {
  return {
    cpu: resources.cpus,
    memory: Math.max(1, Math.ceil(resources.memoryMiB / 1024)),
    ...(resources.diskGiB != null ? { disk: resources.diskGiB } : {}),
  }
}
