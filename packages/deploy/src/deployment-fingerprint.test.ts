import { describe, expect, test } from 'bun:test'

import type { DeploymentDefinition } from '@swirls/definition/deployment-definition'

import { computeDeploymentDefinitionFingerprint } from './deployment-fingerprint'

const id = {
  g: '10000000-0000-4000-8000-000000000001',
  g2: '20000000-0000-4000-8000-000000000002',
  n1: '30000000-0000-4000-8000-000000000001',
  n2: '30000000-0000-4000-8000-000000000002',
  e1: '40000000-0000-4000-8000-000000000001',
  f1: '50000000-0000-4000-8000-000000000001',
  w1: '60000000-0000-4000-8000-000000000001',
  t1: '70000000-0000-4000-8000-000000000001',
  c1: '80000000-0000-4000-8000-000000000001',
  c2: '80000000-0000-4000-8000-000000000002',
} as const

type WorkflowDef = NonNullable<DeploymentDefinition['workflows']>[number]

function minimalWorkflow(
  workflowId: string,
  nodeA: string,
  nodeB: string,
  edgeId: string,
): WorkflowDef {
  return {
    id: workflowId,
    name: 'main',
    label: 'Main',
    nodes: [
      {
        id: nodeA,
        name: 'alpha',
        type: 'code',
        label: 'Alpha',
        config: { type: 'code', code: 'return 1' },
      },
      {
        id: nodeB,
        name: 'bravo',
        type: 'code',
        label: 'Bravo',
        config: { type: 'code', code: 'return 2' },
      },
    ],
    edges: [
      {
        id: edgeId,
        sourceNodeId: nodeA,
        targetNodeId: nodeB,
      },
    ],
  }
}

describe('computeDeploymentDefinitionFingerprint', () => {
  test('same semantics with different UUIDs produce identical fingerprints', () => {
    const alt = {
      g: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      n1: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      n2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      e1: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    }

    const a: DeploymentDefinition = {
      workflows: [minimalWorkflow(id.g, id.n1, id.n2, id.e1)],
    }

    const b: DeploymentDefinition = {
      workflows: [minimalWorkflow(alt.g, alt.n1, alt.n2, alt.e1)],
    }

    expect(computeDeploymentDefinitionFingerprint(a)).toBe(
      computeDeploymentDefinitionFingerprint(b),
    )
  })

  test('different node config changes fingerprint', () => {
    const base = minimalWorkflow(id.g, id.n1, id.n2, id.e1)
    const a: DeploymentDefinition = { workflows: [structuredClone(base)] }

    const b: DeploymentDefinition = {
      workflows: [
        {
          ...structuredClone(base),
          nodes: base.nodes.map((n: WorkflowDef['nodes'][number], i: number) =>
            i === 0
              ? {
                  ...n,
                  config: { type: 'code' as const, code: 'changed' },
                }
              : n,
          ),
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(a)).not.toBe(
      computeDeploymentDefinitionFingerprint(b),
    )
  })

  test('workflow and node declaration order does not change fingerprint', () => {
    const g = minimalWorkflow(id.g2, id.n1, id.n2, id.e1)
    const nodesForward = g.nodes
    // oxlint-disable-next-line unicorn/no-array-reverse -- reverses a copy; toReversed is not in the ES2022 lib
    const nodesReverse = [...g.nodes].reverse()

    const a: DeploymentDefinition = {
      workflows: [{ ...g, nodes: nodesForward }],
    }

    const b: DeploymentDefinition = {
      workflows: [{ ...g, nodes: nodesReverse }],
    }

    expect(computeDeploymentDefinitionFingerprint(a)).toBe(
      computeDeploymentDefinitionFingerprint(b),
    )
  })

  test('resolves trigger resource and workflow ids to names', () => {
    const workflow = minimalWorkflow(id.g, id.n1, id.n2, id.e1)
    const formId = id.f1
    const webhookId = id.w1
    const triggerId = id.t1

    const withResources: DeploymentDefinition = {
      workflows: [workflow],
      forms: [
        {
          id: formId,
          name: 'my_form',
          label: 'Form',
          enabled: true,
          visibility: 'public',
        },
      ],
      webhooks: [
        {
          id: webhookId,
          name: 'my_hook',
          label: 'Hook',
          enabled: true,
        },
      ],
      triggers: [
        {
          id: triggerId,
          name: 'trig',
          resourceType: 'form',
          resourceId: formId,
          workflowId: id.g,
        },
      ],
    }

    const altIds = {
      formId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
      webhookId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
      triggerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
      workflowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
      n1: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      n2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      e1: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    }

    const sameNames: DeploymentDefinition = {
      workflows: [minimalWorkflow(altIds.workflowId, altIds.n1, altIds.n2, altIds.e1)],
      forms: [
        {
          id: altIds.formId,
          name: 'my_form',
          label: 'Form',
          enabled: true,
          visibility: 'public',
        },
      ],
      webhooks: [
        {
          id: altIds.webhookId,
          name: 'my_hook',
          label: 'Hook',
          enabled: true,
        },
      ],
      triggers: [
        {
          id: altIds.triggerId,
          name: 'trig',
          resourceType: 'form',
          resourceId: altIds.formId,
          workflowId: altIds.workflowId,
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(withResources)).toBe(
      computeDeploymentDefinitionFingerprint(sameNames),
    )
  })

  test('adding a connection block changes the fingerprint', () => {
    const base: DeploymentDefinition = {
      workflows: [minimalWorkflow(id.g, id.n1, id.n2, id.e1)],
    }

    const withConnection: DeploymentDefinition = {
      ...base,
      connectionBlocks: [
        {
          id: id.c1,
          name: 'slack_conn',
          label: 'Slack',
          provider: 'slack',
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(base)).not.toBe(
      computeDeploymentDefinitionFingerprint(withConnection),
    )
  })

  test('renaming a connection block changes the fingerprint', () => {
    const a: DeploymentDefinition = {
      workflows: [minimalWorkflow(id.g, id.n1, id.n2, id.e1)],
      connectionBlocks: [
        {
          id: id.c1,
          name: 'slack_conn',
          label: 'Slack',
          provider: 'slack',
        },
      ],
    }

    const b: DeploymentDefinition = {
      ...a,
      connectionBlocks: [
        {
          id: id.c1,
          name: 'slack_renamed',
          label: 'Slack',
          provider: 'slack',
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(a)).not.toBe(
      computeDeploymentDefinitionFingerprint(b),
    )
  })

  test('repointing a connection block provider changes the fingerprint', () => {
    const a: DeploymentDefinition = {
      workflows: [minimalWorkflow(id.g, id.n1, id.n2, id.e1)],
      connectionBlocks: [
        {
          id: id.c1,
          name: 'conn',
          label: 'Conn',
          provider: 'slack',
        },
      ],
    }

    const b: DeploymentDefinition = {
      ...a,
      connectionBlocks: [
        {
          id: id.c1,
          name: 'conn',
          label: 'Conn',
          provider: 'linear',
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(a)).not.toBe(
      computeDeploymentDefinitionFingerprint(b),
    )
  })

  test('repointing a node connectionRef changes the fingerprint', () => {
    const base = minimalWorkflow(id.g, id.n1, id.n2, id.e1)

    const withRef = (ref: string): DeploymentDefinition => ({
      workflows: [
        {
          ...structuredClone(base),
          nodes: base.nodes.map((n: WorkflowDef['nodes'][number], i: number) =>
            i === 0 ? { ...n, connectionRef: ref } : n,
          ),
        },
      ],
    })

    expect(computeDeploymentDefinitionFingerprint(withRef('conn_a'))).not.toBe(
      computeDeploymentDefinitionFingerprint(withRef('conn_b')),
    )
  })

  test('repointing a node actionRef changes the fingerprint', () => {
    const base = minimalWorkflow(id.g, id.n1, id.n2, id.e1)

    const withRef = (ref: string): DeploymentDefinition => ({
      workflows: [
        {
          ...structuredClone(base),
          nodes: base.nodes.map((n: WorkflowDef['nodes'][number], i: number) =>
            i === 0 ? { ...n, actionRef: ref } : n,
          ),
        },
      ],
    })

    expect(computeDeploymentDefinitionFingerprint(withRef('act_a'))).not.toBe(
      computeDeploymentDefinitionFingerprint(withRef('act_b')),
    )
  })

  test('connection block declaration order does not change the fingerprint', () => {
    const blocks: NonNullable<DeploymentDefinition['connectionBlocks']> = [
      { id: id.c1, name: 'alpha_conn', label: 'Alpha', provider: 'slack' },
      { id: id.c2, name: 'bravo_conn', label: 'Bravo', provider: 'linear' },
    ]

    const a: DeploymentDefinition = {
      workflows: [minimalWorkflow(id.g, id.n1, id.n2, id.e1)],
      connectionBlocks: blocks,
    }

    const b: DeploymentDefinition = {
      workflows: [minimalWorkflow(id.g, id.n1, id.n2, id.e1)],
      // oxlint-disable-next-line unicorn/no-array-reverse -- reverses a copy; toReversed is not in the ES2022 lib
      connectionBlocks: [...blocks].reverse(),
    }

    expect(computeDeploymentDefinitionFingerprint(a)).toBe(
      computeDeploymentDefinitionFingerprint(b),
    )
  })

  test('network exposure order does not change the fingerprint', () => {
    const network: NonNullable<DeploymentDefinition['networkBlocks']>[number] = {
      id: id.c1,
      name: 'corporate',
      expose: {
        apps: ['operations', 'support'],
        channels: [],
        forms: [],
        webhooks: [],
        services: [],
        databases: [
          {
            database: 'crm',
            connections: ['analytics', 'application'],
          },
        ],
      },
    }

    const reordered = structuredClone(network)
    reordered.expose.apps.reverse()
    reordered.expose.databases[0]?.connections.reverse()

    expect(computeDeploymentDefinitionFingerprint({ networkBlocks: [network] })).toBe(
      computeDeploymentDefinitionFingerprint({ networkBlocks: [reordered] }),
    )
  })

  test('changing a private consumer network changes the fingerprint', () => {
    const definitionFor = (networkRef: string): DeploymentDefinition => ({
      connectionBlocks: [
        {
          id: id.c1,
          name: 'private_api',
          provider: 'internal',
          baseUrl: 'https://api.internal',
          authRef: 'internal_bearer',
          networkRef,
        },
      ],
    })

    expect(computeDeploymentDefinitionFingerprint(definitionFor('corporate'))).not.toBe(
      computeDeploymentDefinitionFingerprint(definitionFor('customer_acme')),
    )
  })

  test('managed database blocks: same semantics, different UUIDs match', () => {
    const base: DeploymentDefinition = {
      databaseBlocks: [
        {
          id: id.g,
          name: 'my_db',
          schema: 'model User { id Int @id }',
          schemaChecksum: 'checksum-a',
          connections: [],
        },
      ],
      databaseMigrations: [
        {
          id: id.g2,
          name: 'm1',
          database: 'my_db',
          order: 1,
          operationCode: 'return 1',
        },
      ],
    }

    const alt: DeploymentDefinition = {
      databaseBlocks: [
        {
          id: id.n1,
          name: 'my_db',
          schema: 'model User { id Int @id }',
          schemaChecksum: 'checksum-a',
          connections: [],
        },
      ],
      databaseMigrations: [
        {
          id: id.n2,
          name: 'm1',
          database: 'my_db',
          order: 1,
          operationCode: 'return 1',
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(base)).toBe(
      computeDeploymentDefinitionFingerprint(alt),
    )
  })

  test('managed database schema text change changes the fingerprint', () => {
    const base: DeploymentDefinition = {
      databaseBlocks: [
        {
          id: id.g,
          name: 'my_db',
          schema: 'model User { id Int @id }',
          schemaChecksum: 'checksum-a',
          connections: [],
        },
      ],
    }

    const changed: DeploymentDefinition = {
      databaseBlocks: [
        {
          id: id.g,
          name: 'my_db',
          schema: 'model User { id Int @id\n  email String }',
          schemaChecksum: 'checksum-b',
          connections: [],
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(base)).not.toBe(
      computeDeploymentDefinitionFingerprint(changed),
    )
  })

  test('managed migration order is significant to the fingerprint', () => {
    const base: DeploymentDefinition = {
      databaseMigrations: [
        {
          id: id.g,
          name: 'm1',
          database: 'my_db',
          order: 1,
          operationCode: 'return 1',
        },
      ],
    }

    const changed: DeploymentDefinition = {
      databaseMigrations: [
        {
          id: id.g,
          name: 'm1',
          database: 'my_db',
          order: 2,
          operationCode: 'return 1',
        },
      ],
    }

    expect(computeDeploymentDefinitionFingerprint(base)).not.toBe(
      computeDeploymentDefinitionFingerprint(changed),
    )
  })

  test('channel response-policy knobs change the fingerprint', () => {
    const channel = {
      id: id.c1,
      name: 'ops',
      label: 'Ops',
      platform: 'swirls',
      agent: 'triage',
      mode: 'ambient',
      engagementTimeoutSeconds: 1800,
      cooldownSeconds: 15,
      maxUnpromptedPerHour: 6,
    } as const

    const base: DeploymentDefinition = { channelBlocks: [channel] }

    const variants: DeploymentDefinition[] = [
      { channelBlocks: [{ ...channel, mode: 'all' }] },
      { channelBlocks: [{ ...channel, engagementTimeoutSeconds: 900 }] },
      { channelBlocks: [{ ...channel, cooldownSeconds: 30 }] },
      { channelBlocks: [{ ...channel, maxUnpromptedPerHour: 0 }] },
      {
        channelBlocks: [
          {
            id: channel.id,
            name: channel.name,
            label: channel.label,
            platform: channel.platform,
            agent: channel.agent,
            mode: channel.mode,
          },
        ],
      },
    ]

    for (const variant of variants) {
      expect(computeDeploymentDefinitionFingerprint(variant)).not.toBe(
        computeDeploymentDefinitionFingerprint(base),
      )
    }
  })

  test('a channel response policy is identical under a different block UUID', () => {
    const channel = {
      name: 'ops',
      label: 'Ops',
      platform: 'swirls',
      agent: 'triage',
      mode: 'ambient',
      engagementTimeoutSeconds: 1800,
      cooldownSeconds: 15,
      maxUnpromptedPerHour: 6,
    } as const

    expect(
      computeDeploymentDefinitionFingerprint({
        channelBlocks: [{ id: id.c1, ...channel }],
      }),
    ).toBe(
      computeDeploymentDefinitionFingerprint({
        channelBlocks: [{ id: id.c2, ...channel }],
      }),
    )
  })

  test('a harness runtime change changes the fingerprint; a plain computer does not', () => {
    type ComputerBlock = NonNullable<DeploymentDefinition['computerBlocks']>[number]

    const computer: ComputerBlock = {
      id: id.c1,
      name: 'codex_box',
      label: 'codex_box',
      software: {},
      disks: [],
      resources: { cpus: 2, memoryMiB: 4096 },
      needsMountTooling: false,
      recipeHash: 'a'.repeat(64),
    }

    const workflows = [minimalWorkflow(id.g, id.n1, id.n2, id.e1)]
    const bare: DeploymentDefinition = { workflows }

    const plain: DeploymentDefinition = {
      workflows,
      computerBlocks: [computer],
    }

    const withHarness = (runtime: string): DeploymentDefinition => ({
      workflows,
      computerBlocks: [
        {
          ...computer,
          harness: { type: 'coding', provider: 'codex', runtime },
        },
      ],
    })

    expect(computeDeploymentDefinitionFingerprint(plain)).toBe(
      computeDeploymentDefinitionFingerprint(bare),
    )

    expect(computeDeploymentDefinitionFingerprint(withHarness('v1'))).not.toBe(
      computeDeploymentDefinitionFingerprint(plain),
    )

    expect(computeDeploymentDefinitionFingerprint(withHarness('v1'))).not.toBe(
      computeDeploymentDefinitionFingerprint(withHarness('v2')),
    )

    expect(computeDeploymentDefinitionFingerprint(withHarness('v1'))).toBe(
      computeDeploymentDefinitionFingerprint({
        ...withHarness('v1'),
        computerBlocks: withHarness('v1').computerBlocks?.map((block) => ({
          ...block,
          id: id.c2,
        })),
      }),
    )
  })
})
