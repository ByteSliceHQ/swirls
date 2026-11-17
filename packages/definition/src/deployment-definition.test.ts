import { describe, expect, test } from 'bun:test'

import { parseDeploymentDefinition } from './deployment-definition'

const workflowId = '11111111-1111-4111-8111-111111111111'
const agentNodeId = '22222222-2222-4222-8222-222222222222'
const agentBlockId = '33333333-3333-4333-8333-333333333333'

function makeAgentDefinition(config: Record<string, unknown>) {
  return {
    agentBlocks: [
      {
        id: agentBlockId,
        name: 'assistant',
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        tools: ['admin_tool', 'safe_tool'],
        roles: [
          {
            name: 'restricted',
            tools: ['safe_tool'],
          },
        ],
      },
    ],
    workflows: [
      {
        id: workflowId,
        name: 'profiled_agent',
        label: 'Profiled agent',
        nodes: [
          {
            id: agentNodeId,
            name: 'root',
            type: 'agent',
            label: 'Agent',
            isRoot: true,
            config,
          },
        ],
        edges: [],
      },
    ],
  }
}

describe('parseDeploymentDefinition', () => {
  test('preserves a bounded workflow execution token TTL', () => {
    const definition = makeAgentDefinition({
      type: 'agent',
      agent: 'assistant',
      prompt: 'return "hello"',
    })

    const workflow = definition.workflows[0]

    if (!workflow) {
      throw new Error('test fixture is missing its workflow')
    }

    const parsed = parseDeploymentDefinition({
      ...definition,
      workflows: [{ ...workflow, executionTokenTtlSeconds: 10_800 }],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.workflows?.[0]?.executionTokenTtlSeconds).toBe(10_800)
  })

  test('preserves agent node profile for runtime tool scoping', () => {
    const parsed = parseDeploymentDefinition(
      makeAgentDefinition({
        type: 'agent',
        agent: 'assistant',
        prompt: 'return "hello"',
        profile: 'restricted',
      }),
    )

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.workflows?.[0]?.nodes[0]?.config).toMatchObject({
      type: 'agent',
      agent: 'assistant',
      profile: 'restricted',
    })
  })

  test('continues accepting legacy agent node role snapshots', () => {
    const parsed = parseDeploymentDefinition(
      makeAgentDefinition({
        type: 'agent',
        agent: 'assistant',
        role: 'restricted',
      }),
    )

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.workflows?.[0]?.nodes[0]?.config).toMatchObject({
      type: 'agent',
      agent: 'assistant',
      role: 'restricted',
    })
  })
})

describe('parseDeploymentDefinition managed database blocks', () => {
  const databaseId = '44444444-4444-4444-8444-444444444444'
  const migrationId = '55555555-5555-4555-8555-555555555555'

  test('parses a database block and a database migration', () => {
    const parsed = parseDeploymentDefinition({
      databaseBlocks: [
        {
          id: databaseId,
          name: 'my_db',
          schema: 'model User {\n  id Int @id\n}',
          schemaChecksum: 'a'.repeat(64),
        },
      ],
      databaseMigrations: [
        {
          id: migrationId,
          name: 'collapse_names',
          database: 'my_db',
          order: 1,
          operationCode: 'return 1',
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.databaseBlocks?.[0]).toMatchObject({
      name: 'my_db',
      schema: 'model User {\n  id Int @id\n}',
      schemaChecksum: 'a'.repeat(64),
    })

    expect(parsed.data.databaseMigrations?.[0]).toMatchObject({
      name: 'collapse_names',
      database: 'my_db',
      order: 1,
      operationCode: 'return 1',
    })
  })

  test('a database block alone satisfies the primitive-count requirement', () => {
    const parsed = parseDeploymentDefinition({
      databaseBlocks: [
        {
          id: databaseId,
          name: 'my_db',
          schema: 'model User {\n  id Int @id\n}',
          schemaChecksum: 'a'.repeat(64),
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  test('rejects a negative migration order', () => {
    const parsed = parseDeploymentDefinition({
      databaseMigrations: [
        {
          id: migrationId,
          name: 'bad',
          database: 'my_db',
          order: -1,
          operationCode: 'return 1',
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })
})

describe('parseDeploymentDefinition connector blocks and mcp channels', () => {
  const connectorId = '44444444-4444-4444-8444-444444444444'
  const channelId = '55555555-5555-4555-8555-555555555555'

  test('a connector block alone satisfies the primitive-count requirement', () => {
    const parsed = parseDeploymentDefinition({
      connectorBlocks: [
        {
          id: connectorId,
          name: 'client_portal',
          label: 'Client connector',
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  test('accepts an mcp channel with a connectorRef', () => {
    const parsed = parseDeploymentDefinition({
      connectorBlocks: [
        {
          id: connectorId,
          name: 'client_portal',
        },
      ],
      channelBlocks: [
        {
          id: channelId,
          name: 'finance',
          label: 'Finance',
          platform: 'mcp',
          agent: 'finance_guy',
          connectorRef: 'client_portal',
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })
})

describe('parseDeploymentDefinition app pages', () => {
  const appId = '77777777-7777-4777-8777-777777777777'

  test('preserves optional page icons', () => {
    const parsed = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          pages: [
            {
              name: 'dashboard',
              label: 'Dashboard',
              icon: 'layout-dashboard',
              openui: 'root = Markdown("Dashboard")',
            },
            {
              name: 'room',
              openui: 'root = Chat("crm_room")',
            },
          ],
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.apps?.[0]?.pages).toEqual([
      {
        name: 'dashboard',
        label: 'Dashboard',
        icon: 'layout-dashboard',
        openui: 'root = Markdown("Dashboard")',
      },
      {
        name: 'room',
        openui: 'root = Chat("crm_room")',
      },
    ])
  })

  test('accepts sparse app brand tokens', () => {
    const parsed = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: {
            accent: '#B33A2B',
            tokens: {
              light: {
                canvas: '#f7f5f1',
                viewport: '#ffffff',
                brand: '#B33A2B',
                brand_foreground: '#ffffff',
                warning: '#a66a1f',
                radius: '8px',
              },
              dark: { canvas: '#090807' },
            },
          },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.apps?.[0]?.brand).toMatchObject({
      accent: '#B33A2B',
      tokens: {
        light: {
          canvas: '#f7f5f1',
          viewport: '#ffffff',
          brand: '#B33A2B',
          brand_foreground: '#ffffff',
          warning: '#a66a1f',
          radius: '8px',
        },
        dark: { canvas: '#090807' },
      },
    })
  })

  test('accepts app brand avatar config', () => {
    const parsed = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: {
            avatar: {
              variant: 'marble',
              colors: ['#9e3b3b', '#8b7355'],
              shape: 'square',
            },
          },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.apps?.[0]?.brand?.avatar).toEqual({
      variant: 'marble',
      colors: ['#9e3b3b', '#8b7355'],
      shape: 'square',
    })
  })

  test('rejects unknown or invalid app brand tokens', () => {
    const unknown = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: { tokens: { light: { neon: '#ff00ff' } } },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(unknown.success).toBe(false)

    const invalid = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: { tokens: { light: { brand: 'brick' } } },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(invalid.success).toBe(false)
  })

  test('rejects invalid app brand avatar config', () => {
    const invalidVariant = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: { avatar: { variant: 'neon' } },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(invalidVariant.success).toBe(false)

    const emptyColors = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: { avatar: { colors: [] } },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(emptyColors.success).toBe(false)

    const invalidShape = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          brand: { avatar: { shape: 'rounded' } },
          pages: [{ name: 'dashboard', openui: 'root = Markdown("Hi")' }],
        },
      ],
    })

    expect(invalidShape.success).toBe(false)
  })

  test('accepts channel pages with resolved agent metadata', () => {
    const parsed = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          pages: [
            {
              name: 'room',
              icon: 'hash',
              channel: 'crm_room',
              agent: 'crm_assistant',
            },
          ],
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.apps?.[0]?.pages[0]).toEqual({
      name: 'room',
      icon: 'hash',
      channel: 'crm_room',
      agent: 'crm_assistant',
    })
  })

  test('accepts non-empty reviews pages as an exclusive page body', () => {
    const parsed = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'review_queue',
          label: 'Review queue',
          pages: [
            {
              name: 'pending',
              reviews: ['refund_request', 'escalate_request'],
            },
          ],
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.apps?.[0]?.pages[0]?.reviews).toEqual(['refund_request', 'escalate_request'])
  })

  test('requires exactly one page body and non-empty reviews', () => {
    const noBody = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'broken',
          label: 'Broken',
          pages: [{ name: 'pending' }],
        },
      ],
    })

    expect(noBody.success).toBe(false)

    const emptyReviews = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'broken',
          label: 'Broken',
          pages: [{ name: 'pending', reviews: [] }],
        },
      ],
    })

    expect(emptyReviews.success).toBe(false)
  })

  test('rejects pages that declare both openui and channel', () => {
    const parsed = parseDeploymentDefinition({
      apps: [
        {
          id: appId,
          name: 'crm_desk',
          label: 'CRM Desk',
          pages: [
            {
              name: 'room',
              openui: 'root = Chat("crm_room")',
              channel: 'crm_room',
            },
          ],
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })
})

describe('parseDeploymentDefinition back-compat', () => {
  test('strips unknown keys from a historical definition', () => {
    // Stored rows may carry retired keys. The definition object strips unknown
    // keys rather than rejecting them, so those rows still parse on every
    // runtime read path (agent turns, workflow runs, trigger dispatch).
    const parsed = parseDeploymentDefinition({
      agentBlocks: [
        {
          id: agentBlockId,
          name: 'triage',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
        },
      ],
      generativeApps: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          name: 'client_portal',
          description: 'Support portal for Acme customers.',
          expose: [{ kind: 'agent', name: 'triage' }],
          brand: { accent: '#B33A2B' },
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data).not.toHaveProperty('generativeApps')
  })
})

describe('agent suggestion schema limits', () => {
  test('rejects suggestion label or message over length limits', () => {
    const parsed = parseDeploymentDefinition({
      agentBlocks: [
        {
          id: agentBlockId,
          name: 'assistant',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          suggestions: [
            {
              label: 'a'.repeat(41),
              message: 'hello',
            },
          ],
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })
})

describe('agent context block schema', () => {
  const withContext = (context: unknown) => ({
    agentBlocks: [
      {
        id: agentBlockId,
        name: 'assistant',
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        context,
      },
    ],
  })

  test('accepts every knob', () => {
    const parsed = parseDeploymentDefinition(
      withContext({
        budget: 120000,
        compactAt: 0.8,
        keepRecentTurns: 3,
        pruneToolResultsAfter: 5,
        cacheRetention: 'long',
      }),
    )

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.agentBlocks?.[0]?.context).toEqual({
      budget: 120000,
      compactAt: 0.8,
      keepRecentTurns: 3,
      pruneToolResultsAfter: 5,
      cacheRetention: 'long',
    })
  })

  test('accepts an empty context object and an absent one', () => {
    expect(parseDeploymentDefinition(withContext({})).success).toBe(true)
    expect(parseDeploymentDefinition(withContext(undefined)).success).toBe(true)
  })

  test('rejects out-of-range knobs', () => {
    expect(parseDeploymentDefinition(withContext({ budget: 0 })).success).toBe(false)
    expect(parseDeploymentDefinition(withContext({ compactAt: 0 })).success).toBe(false)
    expect(parseDeploymentDefinition(withContext({ compactAt: 1.5 })).success).toBe(false)
    expect(parseDeploymentDefinition(withContext({ keepRecentTurns: -1 })).success).toBe(false)
    expect(parseDeploymentDefinition(withContext({ pruneToolResultsAfter: 0 })).success).toBe(false)
  })

  test('rejects a cache retention outside the tier list', () => {
    expect(parseDeploymentDefinition(withContext({ cacheRetention: 'forever' })).success).toBe(
      false,
    )
  })
})

describe('channel response policy schema', () => {
  const channelId = '77777777-7777-4777-8777-777777777777'

  const withPolicy = (policy: Record<string, unknown>) => ({
    channelBlocks: [
      {
        id: channelId,
        name: 'ops',
        label: 'Ops',
        platform: 'swirls',
        agent: 'triage',
        ...policy,
      },
    ],
  })

  test('accepts mode ambient alongside every knob', () => {
    const parsed = parseDeploymentDefinition(
      withPolicy({
        mode: 'ambient',
        engagementTimeoutSeconds: 1800,
        cooldownSeconds: 15,
        maxUnpromptedPerHour: 6,
      }),
    )

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    const block = parsed.data.channelBlocks?.[0]
    expect(block?.mode).toBe('ambient')
    expect(block?.engagementTimeoutSeconds).toBe(1800)
    expect(block?.cooldownSeconds).toBe(15)
    expect(block?.maxUnpromptedPerHour).toBe(6)
  })

  test('accepts a channel that declares no policy at all', () => {
    expect(parseDeploymentDefinition(withPolicy({})).success).toBe(true)
  })

  test('accepts the zero-valued ends of the ranges', () => {
    expect(
      parseDeploymentDefinition(withPolicy({ cooldownSeconds: 0, maxUnpromptedPerHour: 0 }))
        .success,
    ).toBe(true)
  })

  test('accepts the one-day duration ceilings and rejects a second past them', () => {
    expect(
      parseDeploymentDefinition(
        withPolicy({ engagementTimeoutSeconds: 86400, cooldownSeconds: 86400 }),
      ).success,
    ).toBe(true)

    expect(parseDeploymentDefinition(withPolicy({ engagementTimeoutSeconds: 86401 })).success).toBe(
      false,
    )

    expect(parseDeploymentDefinition(withPolicy({ cooldownSeconds: 86401 })).success).toBe(false)
  })

  test('rejects out-of-range and non-integer knobs', () => {
    expect(parseDeploymentDefinition(withPolicy({ engagementTimeoutSeconds: 0 })).success).toBe(
      false,
    )

    expect(parseDeploymentDefinition(withPolicy({ cooldownSeconds: -1 })).success).toBe(false)
    expect(parseDeploymentDefinition(withPolicy({ maxUnpromptedPerHour: -1 })).success).toBe(false)
    expect(parseDeploymentDefinition(withPolicy({ maxUnpromptedPerHour: 1.5 })).success).toBe(false)
    expect(parseDeploymentDefinition(withPolicy({ cooldownSeconds: '15s' })).success).toBe(false)
  })

  test('rejects a mode outside the list', () => {
    expect(parseDeploymentDefinition(withPolicy({ mode: 'whenever' })).success).toBe(false)
  })

  test('rewrites stored platform portal to swirls', () => {
    const parsed = parseDeploymentDefinition({
      channelBlocks: [
        {
          id: channelId,
          name: 'ops',
          label: 'Ops',
          platform: 'portal',
          agent: 'triage',
        },
      ],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    expect(parsed.data.channelBlocks?.[0]?.platform).toBe('swirls')
  })
})

describe('parseDeploymentDefinition computer blocks', () => {
  const computerBlock = {
    id: '74000000-0000-4000-8000-000000000001',
    name: 'codex_box',
    label: 'codex_box',
    software: {},
    disks: [],
    resources: { cpus: 2, memoryMiB: 4096 },
    needsMountTooling: false,
    recipeHash: 'a'.repeat(64),
  }

  test('keeps a harness block with its runtime', () => {
    const harness = { type: 'coding', provider: 'codex', runtime: 'v1' }

    const parsed = parseDeploymentDefinition({
      computerBlocks: [{ ...computerBlock, harness }],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.computerBlocks?.[0]?.harness).toEqual(harness)
  })

  test('a computer without a harness parses without one', () => {
    const parsed = parseDeploymentDefinition({
      computerBlocks: [computerBlock],
    })

    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.computerBlocks?.[0]).not.toHaveProperty('harness')
  })

  test('rejects a harness without a runtime', () => {
    const parsed = parseDeploymentDefinition({
      computerBlocks: [{ ...computerBlock, harness: { type: 'coding', provider: 'codex' } }],
    })

    expect(parsed.success).toBe(false)
  })
})
