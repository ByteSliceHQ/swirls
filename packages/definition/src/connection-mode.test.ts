import { describe, expect, test } from 'bun:test'
import {
  connectionModePairError,
  hasPartialSelfManagedFields,
  isSelfManagedConnectionBlock,
} from './connection-mode'
import { parseDeploymentDefinition } from './deployment-definition'

describe('connection mode helpers', () => {
  test('isSelfManagedConnectionBlock requires both fields', () => {
    expect(
      isSelfManagedConnectionBlock({
        baseUrl: 'https://api.example.com',
        authRef: 'my_auth',
      }),
    ).toBe(true)
    expect(
      isSelfManagedConnectionBlock({
        baseUrl: 'https://api.example.com',
        authRef: null,
      }),
    ).toBe(false)
    expect(isSelfManagedConnectionBlock({})).toBe(false)
  })

  test('connectionModePairError rejects partial self-managed fields', () => {
    expect(
      connectionModePairError('slack', 'https://api.example.com', undefined),
    ).toContain('both base_url and auth')
    expect(
      connectionModePairError('slack', undefined, undefined),
    ).toBeUndefined()
  })

  test('hasPartialSelfManagedFields detects mismatched pair', () => {
    expect(
      hasPartialSelfManagedFields({
        baseUrl: 'https://api.example.com',
        authRef: null,
      }),
    ).toBe(true)
    expect(
      hasPartialSelfManagedFields({
        baseUrl: 'https://api.example.com',
        authRef: 'token_auth',
      }),
    ).toBe(false)
  })
})

describe('deploymentDefinitionConnectionBlockSchema', () => {
  const connectionId = '77777777-7777-4777-8777-777777777777'

  test('rejects a connection with only baseUrl set', () => {
    const parsed = parseDeploymentDefinition({
      connectionBlocks: [
        {
          id: connectionId,
          name: 'custom',
          provider: 'custom',
          baseUrl: 'https://api.example.com',
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })
})
