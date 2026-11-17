import { describe, expect, test } from 'bun:test'

import {
  hostedAppOrigin,
  LOCAL_HOSTED_BASE,
  PRODUCTION_HOSTED_BASE,
  parseHostedSlugFromHost,
  resolveSurfaceHostedBase,
} from './app-audience'

describe('hosted app base resolution', () => {
  test('uses explicit configuration before runtime defaults', () => {
    expect(
      resolveSurfaceHostedBase({
        envBase: 'apps.example.test',
        nodeEnv: 'production',
      }),
    ).toBe('apps.example.test')
  })

  test('uses the local base outside production and the public base in production', () => {
    expect(resolveSurfaceHostedBase({ nodeEnv: 'development' })).toBe(LOCAL_HOSTED_BASE)
    expect(resolveSurfaceHostedBase({ nodeEnv: 'production' })).toBe(PRODUCTION_HOSTED_BASE)
  })

  test('supports browser-safe explicit origin and host parsing', () => {
    expect(hostedAppOrigin('inventory', 'apps.example.test')).toBe(
      'https://inventory.apps.example.test',
    )

    expect(parseHostedSlugFromHost('inventory.apps.example.test:443', 'apps.example.test')).toBe(
      'inventory',
    )

    expect(parseHostedSlugFromHost('surface.apps.example.test', 'apps.example.test')).toBeNull()
  })
})
