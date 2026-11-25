/*
 * The base-image runtime every harness computer is baked with, keyed by
 * provider. Harness versions are never here: kits are delivered at boot.
 *
 * Bump COMPUTER_HARNESS_RUNTIME in the same change as any edit to this file
 * that alters the baked image (a package, a Debian pin, an env var, the prep
 * script). The runtime is in the recipe hash of every harness computer, so the
 * bump is what makes existing harness computers re-bake on their next deploy.
 * Without it they keep the old image under the same hash.
 */

/**
 * Version of the base-image runtime a harness computer is baked with (system
 * libraries, Node, the harness directory on PATH). Never a harness version:
 * those are delivered at boot. Bump when a provider's base image runtime
 * changes, so every harness computer re-bakes on its next deploy. Part of the
 * recipe hash only for computers with a `harness` block.
 */
export const COMPUTER_HARNESS_RUNTIME = 'v1'

/**
 * Harness providers this runtime can bake. The language checks authored names
 * against the host's harness catalog; this is the same list seen from the
 * image side, and a test holds the two together.
 */
export const HARNESS_PROVIDERS = ['claude', 'codex', 'pi', 'hermes'] as const

export type HarnessProvider = (typeof HARNESS_PROVIDERS)[number]

/** Narrow a stored or authored string to a provider this runtime bakes. */
export function isHarnessProvider(value: string): value is HarnessProvider {
  return HARNESS_PROVIDERS.some((provider) => provider === value)
}

/** A Flox catalog package the runtime adds to the image. */
export type HarnessRuntimePackage = {
  name: string
  /** A Flox version or semver range; null takes the catalog's latest. */
  version: string | null
  /** Flox file-conflict priority; lower wins. Omitted means Flox's default 5. */
  priority?: number
}

/**
 * A Debian binary package fetched from an immutable source, checked against
 * its pinned size and sha256 before it is unpacked.
 */
export type HarnessDebianPackage = {
  name: string
  version: string
  sha256: string
  size: number
  /** Tried in order. The hash, not the host, is what is trusted. */
  urls: readonly string[]
}

/** A file written under the `daytona` user's home, owned by that user. */
export type HarnessHomeFile = {
  /** Relative to `/home/daytona`. */
  path: string
  content: string
}

type HarnessProviderRuntime = {
  packages: readonly HarnessRuntimePackage[]
  debianPackages: readonly HarnessDebianPackage[]
  /** Image environment, for documented update-check and telemetry settings. */
  env: Readonly<Record<string, string>>
  homeFiles: readonly HarnessHomeFile[]
}

/**
 * Every provider gets these. `procps` also ships `kill` and `uptime`, which
 * the baseline `coreutils` provides too, so it yields those files to it (the
 * same priority nixpkgs gives it, relative to coreutils).
 */
const HARNESS_BASE_PACKAGES: readonly HarnessRuntimePackage[] = [
  { name: 'curl', version: null },
  { name: 'git', version: null },
  { name: 'procps', version: null, priority: 6 },
  { name: 'ripgrep', version: null },
]

/**
 * Debian bookworm `libc6` for Claude Code's glibc binary. The spike found it
 * needs only libc, libm, libpthread, libdl, librt and the loader (highest
 * symbol GLIBC_2.26), all in `libc6`. The first URL is snapshot.debian.org,
 * which never changes a published file; the second is the bookworm pool.
 */
const DEBIAN_BOOKWORM_LIBC6: HarnessDebianPackage = {
  name: 'libc6',
  version: '2.36-9+deb12u14',
  sha256: 'ba4f88f73dbc3ae9055f3c20f4523bfdbaf1ad13ff95e258924f77d20b4fbedf',
  size: 2_759_320,
  urls: [
    'https://snapshot.debian.org/archive/debian/20260504T025922Z/pool/main/g/glibc/libc6_2.36-9%2Bdeb12u14_amd64.deb',
    'https://deb.debian.org/debian/pool/main/g/glibc/libc6_2.36-9%2Bdeb12u14_amd64.deb',
  ],
}

/**
 * Runtime additions per provider. Sources for the settings:
 * - Claude Code: https://code.claude.com/docs/en/env-vars (`DISABLE_UPDATES`
 *   blocks every update path, for Claude Code distributed through your own
 *   channel; `DISABLE_TELEMETRY`; `DISABLE_ERROR_REPORTING`).
 * - Pi: `docs/environment-variables.md` in `@earendil-works/pi-coding-agent`
 *   (`PI_SKIP_VERSION_CHECK`, `PI_TELEMETRY`). Node floor from its
 *   `engines.node` (`>=22.19.0`).
 * - Codex: the config reference (`check_for_update_on_startup`,
 *   `analytics.enabled`). Codex has no environment variable for either, so
 *   they go in the default `~/.codex/config.toml`.
 * - Hermes: no additions until its kit passes the spike.
 */
const HARNESS_PROVIDER_RUNTIMES: Readonly<Record<HarnessProvider, HarnessProviderRuntime>> = {
  claude: {
    packages: [],
    debianPackages: [DEBIAN_BOOKWORM_LIBC6],
    env: {
      DISABLE_ERROR_REPORTING: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_UPDATES: '1',
    },
    homeFiles: [],
  },
  codex: {
    packages: [],
    debianPackages: [],
    env: {},
    homeFiles: [
      {
        path: '.codex/config.toml',
        content: [
          '# Written by the Swirls computer bake. Codex versions are delivered by Swirls.',
          'check_for_update_on_startup = false',
          '',
          '[analytics]',
          'enabled = false',
          '',
        ].join('\n'),
      },
    ],
  },
  pi: {
    packages: [
      { name: 'fd', version: null },
      { name: 'nodejs', version: '>=22.19' },
    ],
    debianPackages: [],
    env: {
      PI_SKIP_VERSION_CHECK: '1',
      PI_TELEMETRY: '0',
    },
    homeFiles: [],
  },
  hermes: {
    packages: [],
    debianPackages: [],
    env: {},
    homeFiles: [],
  },
}

/**
 * A provider's runtime. Stored definitions reach the bake as JSON, so an
 * unknown provider fails here by name instead of as an undefined lookup.
 */
function providerRuntime(provider: string): HarnessProviderRuntime {
  if (!isHarnessProvider(provider)) {
    throw new Error(`unknown harness provider ${provider}`)
  }

  return HARNESS_PROVIDER_RUNTIMES[provider]
}

/** Where the bake worker mounts the unpacked Debian packages, read-only. */
export const HARNESS_DEBIAN_STAGE_DIR = '/opt/stage/harness-root'

/** Writable by the guest user; boot delivery unpacks kits here. */
export const HARNESS_ROOT_DIR = '/opt/swirls/harness'

/** Flox packages the runtime adds for a provider, before author pins. */
export function harnessRuntimePackages(provider: string): readonly HarnessRuntimePackage[] {
  return [...HARNESS_BASE_PACKAGES, ...providerRuntime(provider).packages]
}

/** What the bake worker needs to add a provider's runtime to the image. */
export type ComputerHarnessBake = {
  provider: HarnessProvider
  runtime: string
  /** Fetched, verified, and unpacked at `HARNESS_DEBIAN_STAGE_DIR`. */
  debianPackages: HarnessDebianPackage[]
  /** Set as image `ENV` when the guest image is committed. */
  env: Record<string, string>
  /** Run as root in the guest image after the user and mount tooling steps. */
  prepScript: string
}

/** A quoted heredoc delimiter no generated file contains. */
const HEREDOC_END = 'SWIRLS_HARNESS_EOF'

function heredoc(target: string, content: string): string {
  if (content.split('\n').includes(HEREDOC_END)) {
    throw new Error(`harness file ${target} contains the heredoc delimiter`)
  }

  const body = content.endsWith('\n') ? content : `${content}\n`
  return `cat >${shellQuote(target)} <<'${HEREDOC_END}'\n${body}${HEREDOC_END}`
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** Login shells (`bash -lc`, as the shell node runs) put kits on PATH. */
const PROFILE_SCRIPT = `case ":\${PATH:-}:" in
  *:${HARNESS_ROOT_DIR}/bin:*) ;;
  *) PATH="${HARNESS_ROOT_DIR}/bin\${PATH:+:$PATH}" ;;
esac
export PATH
`

function homeFileLines(files: readonly HarnessHomeFile[]): string[] {
  const lines: string[] = []

  for (const file of files) {
    if (file.path.startsWith('/') || file.path.split('/').includes('..')) {
      throw new Error(`harness home file path ${file.path} leaves the home`)
    }

    const target = `/home/daytona/${file.path}`
    const parent = target.slice(0, target.lastIndexOf('/'))
    lines.push(`mkdir -p ${shellQuote(parent)}`)
    lines.push(heredoc(target, file.content))
    lines.push(`chmod 644 ${shellQuote(target)}`)
  }

  if (files.length > 0) {
    lines.push(`chown -R "\${UID_NUM}:\${GID_NUM}" /home/daytona`)
  }

  return lines
}

/**
 * Root script that adds the runtime to the guest image. It runs after the
 * mount tooling install, because that install copies its own loader to
 * `/lib64`; running last leaves one consistent glibc set from the pinned deb.
 * The Claude binary is never patched or started through the loader.
 */
export function harnessPrepScript(provider: string): string {
  const runtime = providerRuntime(provider)

  const lines = [
    '#!/bin/sh',
    `# Harness runtime ${COMPUTER_HARNESS_RUNTIME} for provider ${provider}. Generated by @swirls/deploy.`,
    'set -eu',
    'UID_NUM=1001',
    'GID_NUM=1001',
    '',
    '# Nix images have no /usr/bin/env, and harness launchers start with it.',
    '# Resolve the directory into the store but keep the name `env`, since',
    '# coreutils may be one multicall binary that dispatches on its name.',
    'if [ ! -e /usr/bin/env ]; then',
    '  ENV_BIN=$(command -v env)',
    '  ENV_DIR=$(dirname "$ENV_BIN")',
    '  ENV_BIN="$(cd "$ENV_DIR" && pwd -P)/env"',
    '  mkdir -p /usr/bin',
    '  ln -sf "$ENV_BIN" /usr/bin/env',
    'fi',
    '',
    `mkdir -p ${HARNESS_ROOT_DIR}/bin`,
    `chown -R "\${UID_NUM}:\${GID_NUM}" ${HARNESS_ROOT_DIR}`,
    `chmod 755 /opt/swirls ${HARNESS_ROOT_DIR} ${HARNESS_ROOT_DIR}/bin`,
    '',
    'mkdir -p /etc/profile.d',
    heredoc('/etc/profile.d/swirls-harness.sh', PROFILE_SCRIPT),
    'chmod 644 /etc/profile.d/swirls-harness.sh',
    '',
    '# /etc/profile may be a symlink into the Nix store, or missing.',
    'if [ -L /etc/profile ]; then',
    '  cp -L /etc/profile /tmp/etc-profile 2>/dev/null || : >/tmp/etc-profile',
    '  rm -f /etc/profile',
    '  cp /tmp/etc-profile /etc/profile',
    '  rm -f /tmp/etc-profile',
    'fi',
    'if [ ! -f /etc/profile ]; then',
    '  : >/etc/profile',
    'fi',
    "if ! grep -q '/etc/profile.d' /etc/profile; then",
    "  printf '%s\\n' 'for f in /etc/profile.d/*.sh; do [ -r \"$f\" ] && . \"$f\"; done' 'unset f' >>/etc/profile",
    'fi',
    'chmod 644 /etc/profile',
  ]

  if (runtime.debianPackages.length > 0) {
    lines.push(
      '',
      `# Debian bookworm ${runtime.debianPackages.map((deb) => `${deb.name} ${deb.version}`).join(', ')}, unpacked by the bake worker after its sha256 check.`,
      'mkdir -p /lib/x86_64-linux-gnu /lib64',
      `cp -a ${HARNESS_DEBIAN_STAGE_DIR}/lib/x86_64-linux-gnu/. /lib/x86_64-linux-gnu/`,
      'ln -sf /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2',
    )
  }

  const home = homeFileLines(runtime.homeFiles)

  if (home.length > 0) {
    lines.push('', ...home)
  }

  lines.push('')
  return lines.join('\n')
}

/** The bake request's harness part, from the provider and runtime alone. */
export function computerHarnessBake(harness: {
  provider: HarnessProvider
  runtime: string
}): ComputerHarnessBake {
  if (harness.runtime !== COMPUTER_HARNESS_RUNTIME) {
    throw new Error(
      `harness runtime ${harness.runtime} cannot be baked by this server, which bakes runtime ${COMPUTER_HARNESS_RUNTIME}`,
    )
  }

  const runtime = providerRuntime(harness.provider)
  return {
    provider: harness.provider,
    runtime: harness.runtime,
    debianPackages: runtime.debianPackages.map((deb) => ({
      ...deb,
      urls: [...deb.urls],
    })),
    env: { ...runtime.env },
    prepScript: harnessPrepScript(harness.provider),
  }
}
