import { describe, expect, test } from 'bun:test'

import { SWIRLS_HARNESSES } from '@swirls/language'

import {
  COMPUTER_HARNESS_RUNTIME,
  HARNESS_PROVIDERS,
  computerHarnessBake,
  HARNESS_DEBIAN_STAGE_DIR,
  harnessPrepScript,
} from './harness-runtime'

describe('HARNESS_PROVIDERS', () => {
  test('matches the harness catalog the language validates against', () => {
    expect<string[]>([...HARNESS_PROVIDERS]).toEqual(
      SWIRLS_HARNESSES.providers.map((entry) => entry.name),
    )
  })
})

describe('harnessPrepScript', () => {
  for (const provider of HARNESS_PROVIDERS) {
    test(`gives ${provider} /usr/bin/env and a writable harness dir on the login PATH`, () => {
      const script = harnessPrepScript(provider)
      expect(script.startsWith('#!/bin/sh\n')).toBe(true)
      expect(script).toContain('set -eu')
      expect(script).toContain(`runtime ${COMPUTER_HARNESS_RUNTIME}`)
      expect(script).toContain('ln -sf "$ENV_BIN" /usr/bin/env')
      expect(script).toContain('mkdir -p /opt/swirls/harness/bin')
      expect(script).toContain(`chown -R "\${UID_NUM}:\${GID_NUM}" /opt/swirls/harness`)
      expect(script).toContain('UID_NUM=1001')
      expect(script).toContain("cat >'/etc/profile.d/swirls-harness.sh' <<'SWIRLS_HARNESS_EOF'")
      expect(script).toContain(`PATH="/opt/swirls/harness/bin\${PATH:+:$PATH}"`)
      expect(script).toContain('for f in /etc/profile.d/*.sh')
      expect(script).not.toContain('sudo')
      expect(script).not.toContain('archil')
    })
  }

  test('the profile script prepends the harness bin exactly once', async () => {
    const script = harnessPrepScript('pi')
    const start = script.indexOf("<<'SWIRLS_HARNESS_EOF'\n")

    const body = script.slice(
      start + "<<'SWIRLS_HARNESS_EOF'\n".length,
      script.indexOf('\nSWIRLS_HARNESS_EOF', start),
    )

    const run = Bun.spawn(['bash', '-c', `${body}\n${body}\nprintf '%s' "$PATH"`], {
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
    })

    const stdout = await run.stdout.text()
    expect(await run.exited).toBe(0)
    expect(stdout).toBe('/opt/swirls/harness/bin:/usr/bin:/bin')
  })

  test('only claude installs the Debian glibc set and the standard loader', () => {
    const claude = harnessPrepScript('claude')

    expect(claude).toContain(
      `cp -a ${HARNESS_DEBIAN_STAGE_DIR}/lib/x86_64-linux-gnu/. /lib/x86_64-linux-gnu/`,
    )

    expect(claude).toContain(
      'ln -sf /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2',
    )

    expect(claude).toContain('libc6 2.36-9+deb12u14')
    // The binary is never patched or started through the loader.
    expect(claude).not.toContain('patchelf')
    expect(claude).not.toContain('--library-path')

    for (const provider of ['codex', 'pi', 'hermes'] as const) {
      expect(harnessPrepScript(provider)).not.toContain('x86_64-linux-gnu')
    }
  })

  test('codex gets its documented update and analytics settings in its default config', () => {
    const script = harnessPrepScript('codex')
    expect(script).toContain("cat >'/home/daytona/.codex/config.toml' <<'SWIRLS_HARNESS_EOF'")
    expect(script).toContain('check_for_update_on_startup = false')
    expect(script).toContain('[analytics]\nenabled = false')
    expect(script).toContain(`chown -R "\${UID_NUM}:\${GID_NUM}" /home/daytona`)
    expect(harnessPrepScript('pi')).not.toContain('.codex')
  })
})

describe('computerHarnessBake', () => {
  test('claude pins libc6 by version, size, and sha256 on immutable sources', () => {
    const bake = computerHarnessBake({
      provider: 'claude',
      runtime: COMPUTER_HARNESS_RUNTIME,
    })

    expect(bake.debianPackages).toEqual([
      {
        name: 'libc6',
        version: '2.36-9+deb12u14',
        sha256: 'ba4f88f73dbc3ae9055f3c20f4523bfdbaf1ad13ff95e258924f77d20b4fbedf',
        size: 2_759_320,
        urls: [
          'https://snapshot.debian.org/archive/debian/20260504T025922Z/pool/main/g/glibc/libc6_2.36-9%2Bdeb12u14_amd64.deb',
          'https://deb.debian.org/debian/pool/main/g/glibc/libc6_2.36-9%2Bdeb12u14_amd64.deb',
        ],
      },
    ])

    expect(bake.env).toEqual({
      DISABLE_ERROR_REPORTING: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_UPDATES: '1',
    })

    expect(bake.prepScript).toBe(harnessPrepScript('claude'))
  })

  test('pi turns off its version check and telemetry; codex and hermes set no env', () => {
    const env = (provider: 'pi' | 'codex' | 'hermes') =>
      computerHarnessBake({ provider, runtime: COMPUTER_HARNESS_RUNTIME }).env

    expect(env('pi')).toEqual({ PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' })
    expect(env('codex')).toEqual({})
    expect(env('hermes')).toEqual({})

    for (const provider of ['pi', 'codex', 'hermes'] as const) {
      expect(
        computerHarnessBake({ provider, runtime: COMPUTER_HARNESS_RUNTIME }).debianPackages,
      ).toEqual([])
    }
  })

  test('refuses to bake a runtime this server does not build', () => {
    expect(() => computerHarnessBake({ provider: 'codex', runtime: 'v0' })).toThrow(
      'harness runtime v0 cannot be baked by this server',
    )
  })
})
