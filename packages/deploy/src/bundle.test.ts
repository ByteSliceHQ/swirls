import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { parseDeploymentDefinition } from '@swirls/definition/deployment-definition'
import { parse, type SwirlsFile } from '@swirls/language'

import { buildDeploymentDefinitionPayload, mergeProjectSwirlsFiles } from './bundle'
import { COMPUTER_HARNESS_RUNTIME, compileComputerRecipe } from './computer/recipe'
import { createMemoryRepoFs, virtualRepoCwd } from './memory-repo-fs'
import { operationScriptSha256 } from './operation'

/** RFC 9562: version digit is the first hex of UUID third group (string index 14). */
function expectUuidVersion7(id: string) {
  expect(id[14]).toBe('7')
}

function mergeParsedFiles(...files: SwirlsFile[]): SwirlsFile {
  const [first, ...rest] = files

  if (!first) {
    throw new Error('mergeParsedFiles requires at least one file')
  }

  return {
    ...first,
    schemas: files.flatMap((f) => f.schemas),
    forms: files.flatMap((f) => f.forms),
    webhooks: files.flatMap((f) => f.webhooks),
    schedules: files.flatMap((f) => f.schedules),
    workflows: files.flatMap((f) => f.workflows),
    streams: files.flatMap((f) => f.streams ?? []),
    views: files.flatMap((f) => f.views ?? []),
    triggers: files.flatMap((f) => f.triggers),
    secrets: files.flatMap((f) => f.secrets ?? []),
    auths: files.flatMap((f) => f.auths ?? []),
    postgres: files.flatMap((f) => f.postgres ?? []),
    disk: files.flatMap((f) => f.disk ?? []),
    agent: files.flatMap((f) => f.agent ?? []),
    channels: files.flatMap((f) => f.channels ?? []),
    connections: files.flatMap((f) => f.connections ?? []),
    roles: files.flatMap((f) => f.roles ?? []),
    policies: files.flatMap((f) => f.policies ?? []),
    version: first.version ?? rest.find((f) => f.version !== undefined)?.version,
  }
}

describe('buildDeploymentDefinitionPayload', () => {
  test('normalizes workflow execution token TTL to seconds', () => {
    const result = parse(`
workflow long_running {
  label: "Long running"
  executionTokenTtl: "3h"
  root {
    type: code
    code: @ts { return {} }
  }
}`)

    expect(result.errors).toEqual([])

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const workflows = definition.workflows as Array<{
      executionTokenTtlSeconds?: number
    }>

    expect(workflows[0]?.executionTokenTtlSeconds).toBe(10_800)
  })

  test('rejects an invalid workflow execution token TTL without a validator pass', () => {
    const result = parse(`
workflow invalid_ttl {
  label: "Invalid TTL"
  executionTokenTtl: "2.5h"
  root {
    type: code
    code: @ts { return {} }
  }
}`)

    expect(result.errors).toEqual([])

    expect(() => buildDeploymentDefinitionPayload(result.ast)).toThrow(
      'executionTokenTtl must be a quoted whole-number duration between 5m and 24h',
    )
  })

  test('maps stream blocks into deployment definition streams', () => {
    const source = `
graph foo {
  label: "Foo"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}

stream my_stream {
  label: "My stream"
  graph: foo
  version: v1
  versions: {
    v1 {
      schema: @json {
        { "type": "object", "properties": { "a": { "type": "number" } } }
      }
      condition: @ts { return true }
      prepare: @ts { return { a: 1 } }
    }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const streams = definition.streams as Array<{
      id: string
      name: string
      workflowName: string
      version: string
      versions: Record<string, { prepareCode: string; conditionCode?: string }>
    }>

    expect(streams).toBeDefined()
    expect(streams.length).toBe(1)
    const stream = streams[0]
    expect(stream).toBeDefined()

    if (!stream) {
      return
    }

    expect(stream.name).toBe('my_stream')
    expect(stream.workflowName).toBe('foo')
    expect(stream.version).toBe('v1')
    expect(stream.versions?.v1?.prepareCode).toContain('return')
    expect(stream.versions?.v1?.conditionCode).toContain('true')
    expectUuidVersion7(stream.id)

    const workflows = definition.workflows as Array<{
      id: string
      nodes: Array<{ id: string }>
    }>

    expect(workflows?.length).toBe(1)
    const workflow = workflows?.[0]
    expect(workflow).toBeDefined()

    if (!workflow) {
      return
    }

    expectUuidVersion7(workflow.id)
    const rootNode = workflow.nodes[0]
    expect(rootNode).toBeDefined()

    if (!rootNode) {
      return
    }

    expectUuidVersion7(rootNode.id)
  })

  test('rejects view execution cycles after cross-file merge', () => {
    const fileA = parse(`
workflow ga {
  label: "GA"
  root { type: code code: @ts { return { a: 1 } } }
}

stream sa {
  label: "SA"
  workflow: ga
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return {} }
    }
  }
}

view va {
  streams: [sa]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c { graph: gb input: @ts { return {} } }
  }
}
`)

    const fileB = parse(`
workflow gb {
  label: "GB"
  root { type: code code: @ts { return { b: 1 } } }
}

stream sb {
  label: "SB"
  workflow: gb
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return {} }
    }
  }
}

view vb {
  streams: [sb]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c { graph: ga input: @ts { return {} } }
  }
}
`)

    expect(fileA.errors.length).toBe(0)
    expect(fileB.errors.length).toBe(0)

    const merged = mergeParsedFiles(fileA.ast, fileB.ast)

    expect(() => buildDeploymentDefinitionPayload(merged)).toThrow(
      'Deployment contains view execution cycle(s)',
    )
  })

  test('preserves roles and policies in the deployment definition', () => {
    const source = `
role finance {
  description: "Finance"
  match {
    department: "finance"
    org_role: [ "ceo", "cfo" ]
  }
}

policy {
  allow finance -> agent accountant {
    workflows: [ foo ]
  }
  allow finance -> agent *
}

graph foo {
  label: "Foo"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    // Re-validate to assert the persisted shape keeps the RBAC fields rather
    // than silently stripping them (the strip-on-deploy class).
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.roles?.[0]?.name).toBe('finance')

    expect(parsed.data.roles?.[0]?.match).toEqual([
      { claim: 'department', op: 'eq', values: ['finance'] },
      { claim: 'org_role', op: 'in', values: ['ceo', 'cfo'] },
    ])

    expect(parsed.data.policies?.[0]?.grants).toEqual([
      {
        effect: 'allow',
        role: 'finance',
        agent: 'accountant',
        workflows: ['foo'],
      },
      { effect: 'allow', role: 'finance', agent: '*' },
    ])
  })

  test('maps connection blocks and connection refs into the definition', () => {
    const source = `
connection slack_sales {
  label: "Sales Slack"
  provider: slack
}

graph foo {
  label: "Foo"
  root {
    type: http
    label: "post"
    url: "https://slack.com/api/chat.postMessage"
    connection: slack_sales
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const connectionBlocks = definition.connectionBlocks as Array<{
      id: string
      name: string
      provider: string
    }>

    expect(connectionBlocks?.length).toBe(1)
    const firstConnection = connectionBlocks[0]
    expect(firstConnection?.name).toBe('slack_sales')
    expect(firstConnection?.provider).toBe('slack')

    if (!firstConnection) {
      return
    }

    expectUuidVersion7(firstConnection.id)

    const workflows = definition.workflows as Array<{
      nodes: Array<{ connectionRef?: string; config: Record<string, unknown> }>
    }>

    const rootNode = workflows[0]?.nodes[0]
    expect(rootNode?.connectionRef).toBe('slack_sales')
    // The credential ref must not leak into the persisted node config.
    expect(rootNode?.config.connection).toBeUndefined()
  })

  test('carries project network requirements and consumer refs into the definition', () => {
    const source = `
secret internal_api_secret { vars: [TOKEN] }
auth internal_api_auth {
  type: bearer
  secrets: internal_api_secret
  token: TOKEN
}
connection internal_api {
  provider: internal_api
  base_url: "https://api.example.ts.net"
  auth: internal_api_auth
  network: corporate
}
mcp internal_tools {
  url: "https://tools.example.ts.net/mcp"
  auth: static
  network: corporate
}
postgres warehouse {
  connection: "postgresql://warehouse.example.ts.net/data"
  network: corporate
  table events { schema: @json { { "type": "object" } } }
}
form intake { label: "Intake" }
database crm {
  schema: @prisma { model Lead { id Int @id } }
  connection application { }
}
network corporate {
  label: "Corporate"
  expose: {
    forms: [intake]
    databases: [{ database: crm, connections: [application] }]
  }
}
workflow call_internal {
  label: "Call internal"
  root {
    type: http
    url: "https://inventory.example.ts.net/v1/stock"
    network: corporate
  }
}
`

    const result = parse(source)
    expect(result.errors).toEqual([])

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.networkBlocks?.[0]).toMatchObject({
      name: 'corporate',
      label: 'Corporate',
      expose: {
        forms: ['intake'],
        databases: [{ database: 'crm', connections: ['application'] }],
      },
    })

    expect(parsed.data.connectionBlocks?.[0]?.networkRef).toBe('corporate')
    expect(parsed.data.mcpBlocks?.[0]?.networkRef).toBe('corporate')
    expect(parsed.data.postgresBlocks?.[0]?.networkRef).toBe('corporate')
    const networkNode = parsed.data.workflows?.[0]?.nodes[0]
    expect(networkNode?.config.type).toBe('http')

    if (!networkNode || networkNode.config.type !== 'http') {
      throw new Error('Expected an HTTP network consumer')
    }

    expect(networkNode.config.network).toBe('corporate')
  })

  test('maps action blocks and inlines transport into integration node config', () => {
    const source = `
action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  input: @json {
    {
      "type": "object",
      "required": ["channel", "text"],
      "properties": {
        "channel": { "type": "string" },
        "text": { "type": "string" }
      }
    }
  }
  output: @json {
    {
      "type": "object",
      "required": ["ok"],
      "properties": { "ok": { "type": "boolean" } }
    }
  }
}

connection team_slack { provider: slack }

workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    params: @ts { return { channel: "C1", text: "hi" } }
  }
  flow { root -> post_slack }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const actionBlocks = definition.actionBlocks as Array<{
      name: string
      method: string
      path: string
    }>

    expect(actionBlocks?.length).toBe(1)
    expect(actionBlocks[0]?.name).toBe('slack_post_message')

    const workflows = definition.workflows as Array<{
      nodes: Array<{ actionRef?: string; config: Record<string, unknown> }>
    }>

    const integrationNode = workflows[0]?.nodes.find((n) => n.config.type === 'integration')
    expect(integrationNode?.actionRef).toBe('slack_post_message')
    expect(integrationNode?.config.method).toBe('POST')
    expect(integrationNode?.config.path).toBe('/chat.postMessage')
    expect(integrationNode?.config.encoding).toBe('form')
    expect(integrationNode?.config.action).toBe('slack_post_message')
    expect(integrationNode?.config.actionInputSchema).toBeDefined()
    expect(integrationNode?.config.actionOutputSchema).toBeDefined()
  })

  test('persists actionGraphqlDocument through parseDeploymentDefinition for graphql actions', () => {
    const source = `
action linear_list_issues {
  provider: linear
  method: POST
  path: "/graphql"
  encoding: json
  document: "query issues($first: Int) { issues(first: $first) { edges { cursor node { id } } nodes { id } pageInfo { hasNextPage hasPreviousPage } } }"
}

connection team_linear { provider: linear }

workflow list_issues {
  label: "List issues"
  root { type: code code: @ts { return {} } }
  node fetch_issues {
    type: integration
    connection: team_linear
    action: linear_list_issues
    params: @ts { return { first: 10 } }
  }
  flow { root -> fetch_issues }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw new Error(parsed.error.message)
    }

    const integrationNode = parsed.data.workflows?.[0]?.nodes.find(
      (n) => n.config.type === 'integration',
    )

    expect(integrationNode?.config.type).toBe('integration')

    if (integrationNode?.config.type !== 'integration') {
      throw new Error('expected integration node')
    }

    expect(integrationNode.config.actionGraphqlDocument).toContain('query issues')
    expect(integrationNode.config.actionInputSchema).toBeUndefined()
    expect(integrationNode.config.actionOutputSchema).toBeUndefined()
  })

  test('throws when stream block has no schema', () => {
    const source = `
graph foo {
  label: "Foo"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}

stream my_stream {
  label: "My stream"
  graph: foo
  version: v1
  versions: {
    v1 { prepare: @ts { return { a: 1 } } }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)
    expect(() => buildDeploymentDefinitionPayload(result.ast)).toThrow('must define a schema')
  })

  test('flattens map inline subgraph into synthetic workflow and graph config', () => {
    const source = `
workflow loop_smoke {
  label: "Smoke"
  concurrency: 12
  root {
    type: code
    label: "Entry"
    code: @ts { return { values: [1, 2] } }
  }
  node map_each {
    type: map
    label: "Map"
    items: @ts { return [{ value: 1 }] }
    maxItems: 10
    subgraph {
      root {
        type: code
        label: "Double"
        code: @ts { return { value: context.iteration.item.value * 2 } }
      }
    }
  }
  flow {
    root -> map_each
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)
    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const workflows = definition.workflows as Array<{
      name: string
      synthetic?: boolean
      concurrency?: number
      nodes: Array<{ name: string; type: string; config: { graph?: string } }>
    }>

    expect(workflows.length).toBe(2)
    const parent = workflows.find((w) => w.name === 'loop_smoke')
    const child = workflows.find((w) => w.name === 'loop_smoke__map_each__iter')
    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    // Parent stays a real workflow; the flattened subgraph is marked synthetic
    // so deploy never persists it as a workflow snapshot.
    expect(parent?.synthetic).toBeUndefined()
    expect(parent?.concurrency).toBe(12)
    expect(child?.synthetic).toBe(true)
    const mapNode = parent?.nodes.find((n) => n.name === 'map_each')
    expect(mapNode?.config.graph).toBe('loop_smoke__map_each__iter')
    expect(child?.nodes.some((n) => n.name === 'root')).toBe(true)
  })

  test('inlines named schema refs into forms and nodes', () => {
    const source = `
schema shared {
  label: "S"
  schema: @json {
    { "type": "object", "properties": { "x": { "type": "string" } } }
  }
}

graph foo {
  label: "Foo"
  root {
    type: code
    label: "r"
    outputSchema: shared
    code: @ts { return { x: "a" } }
  }
}

form f {
  label: "F"
  schema: shared
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const forms = definition.forms as Array<{
      schema?: Record<string, unknown>
    }>

    expect(forms?.[0]?.schema?.properties).toBeDefined()

    const workflows = definition.workflows as Array<{
      nodes: Array<{ outputSchema?: Record<string, unknown> }>
    }>

    expect(workflows?.[0]?.nodes?.[0]?.outputSchema?.properties).toBeDefined()

    const schemasOut = definition.schemas as Array<{
      name: string
      label: string
    }>

    expect(schemasOut).toHaveLength(1)
    expect(schemasOut?.[0]?.name).toBe('shared')
  })

  test('maps webhook secret ref and header into webhook rows with lowercased header', () => {
    const source = `
secret my_sec {
  vars: [PAYMENTS]
}

webhook payments_hook {
  label: "Payments"
  secret: my_sec.PAYMENTS
  header: "Payments-Security"
}

graph g {
  label: "G"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const webhooksOut = definition.webhooks as Array<{
      id: string
      name: string
      secretRefBlock?: string
      secretRefVar?: string
      headerName?: string
    }>

    expect(webhooksOut).toBeDefined()
    expect(webhooksOut.length).toBe(1)
    const w = webhooksOut[0]

    if (!w) {
      return
    }

    expect(w.name).toBe('payments_hook')
    expect(w.secretRefBlock).toBe('my_sec')
    expect(w.secretRefVar).toBe('PAYMENTS')
    expect(w.headerName).toBe('payments-security')
    expectUuidVersion7(w.id)
  })

  test('emits form visibility on the deployment definition', () => {
    const source = `
form public_form {
  label: "Public"
  visibility: public
}

form internal_form {
  label: "Internal"
  visibility: internal
}

form default_form {
  label: "Default"
}

graph g {
  label: "G"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const formsOut = definition.forms as Array<{
      name: string
      visibility: 'public' | 'internal'
    }>

    expect(formsOut).toHaveLength(3)
    const byName = new Map(formsOut.map((f) => [f.name, f.visibility]))
    expect(byName.get('public_form')).toBe('public')
    expect(byName.get('internal_form')).toBe('internal')
    // No `visibility` keyword in the source → AST default `'internal'` flows
    // through to the deployment definition payload.
    expect(byName.get('default_form')).toBe('internal')
  })

  test('deployment definition reader defaults visibility to internal for old snapshots', async () => {
    const legacyDefinition = {
      forms: [
        {
          id: '11111111-1111-7111-8111-111111111111',
          name: 'legacy',
          label: 'Legacy',
          enabled: true,
        },
      ],
      workflows: [
        {
          id: '22222222-2222-7222-8222-222222222222',
          name: 'g',
          label: 'G',
          nodes: [
            {
              id: '33333333-3333-7333-8333-333333333333',
              name: 'root',
              type: 'code',
              label: 'r',
              isRoot: true,
              config: { type: 'code', code: 'return 1' },
            },
          ],
          edges: [],
        },
      ],
    }

    const parsed = parseDeploymentDefinition(legacyDefinition)

    if (!parsed.success) {
      throw new Error(`parseDeploymentDefinition failed: ${parsed.error.toString()}`)
    }

    expect(parsed.data.forms?.[0]?.visibility).toBe('internal')
  })

  test('emits form auth ref on the deployment definition', () => {
    const source = `
form gated {
  label: "Gated"
  visibility: public
  auth: portal
}

form open {
  label: "Open"
  visibility: public
}

graph g {
  label: "G"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const formsOut = definition.forms as Array<{
      name: string
      authName?: string
    }>

    const gated = formsOut.find((f) => f.name === 'gated')
    expect(gated?.authName).toBe('portal')

    const open = formsOut.find((f) => f.name === 'open')
    expect(open).toBeDefined()
    expect(open?.authName).toBeUndefined()
  })

  test('webhooks without secret/header carry undefined fields', () => {
    const source = `
webhook anon {
  label: "Anon"
}

graph g {
  label: "G"
  root {
    type: code
    label: "r"
    code: @ts { return 1 }
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition } = buildDeploymentDefinitionPayload(result.ast)

    const webhooksOut = definition.webhooks as Array<{
      secretRefBlock?: string
      secretRefVar?: string
      headerName?: string
    }>

    expect(webhooksOut[0]?.secretRefBlock).toBeUndefined()
    expect(webhooksOut[0]?.secretRefVar).toBeUndefined()
    expect(webhooksOut[0]?.headerName).toBeUndefined()
  })

  test('includes configValueKinds for email string literals', () => {
    const source = `
secret resend_creds {
  type: managed
  vars: [RESEND_API_KEY]
}

workflow notify {
  label: "Notify"
  root {
    label: "Start"
    inputSchema: @json { { "type": "object" } }
  }
  node send {
    type: email
    label: "Send"
    from: "Swirls <noreply@example.com>"
    to: "user@example.com"
    subject: "Hello"
    text: "Body"
  }
  flow {
    root -> send
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    const send = parsed.data.workflows?.[0]?.nodes.find((n) => n.name === 'send')

    expect(send?.config).toMatchObject({
      type: 'email',
      from: 'Swirls <noreply@example.com>',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
    })

    expect(send?.configValueKinds).toEqual({
      from: 'literal',
      to: 'literal',
      subject: 'literal',
      text: 'literal',
    })
  })

  test('includes configValueKinds for plain string disk command', () => {
    const source = `
disk proj {}

workflow g {
  label: "G"
  root {
    type: disk
    label: "List"
    disk: proj
    command: "find poems -type f"
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    const wf = parsed.data.workflows?.[0]
    const diskNode = wf?.nodes.find((n) => n.type === 'disk')

    expect(diskNode?.config).toMatchObject({
      command: 'find poems -type f',
    })

    expect(diskNode?.configValueKinds).toEqual({ command: 'literal' })
  })

  test('maps mcp blocks and agent/profile mcp lists into the definition', () => {
    const source = `
mcp axiom_observability {
  label: "Axiom"
  description: "Query Swirls traces, logs, and metrics via MCP"
  url: "https://mcp.example.com/mcp"
  auth: interactive
}

mcp linear_workspace {
  label: "Linear"
  url: "https://mcp.linear.app/mcp"
  auth: static
}

secret creds { vars: [ OPENROUTER_API_KEY ] }

agent sre_assistant {
  provider: openrouter
  model: "gpt-4o"
  secrets: creds
  mcp: [ axiom_observability ]

  profile oncall {
    mcp: [ axiom_observability ]
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    const mcpBlocks = parsed.data.mcpBlocks
    expect(mcpBlocks?.length).toBe(2)
    const interactive = mcpBlocks?.find((m) => m.name === 'axiom_observability')

    expect(interactive).toMatchObject({
      name: 'axiom_observability',
      label: 'Axiom',
      description: 'Query Swirls traces, logs, and metrics via MCP',
      url: 'https://mcp.example.com/mcp',
      auth: 'interactive',
    })

    if (interactive) {
      expectUuidVersion7(interactive.id)
    }

    const staticSlot = mcpBlocks?.find((m) => m.name === 'linear_workspace')

    expect(staticSlot).toMatchObject({
      name: 'linear_workspace',
      url: 'https://mcp.linear.app/mcp',
      auth: 'static',
    })

    const agentBlock = parsed.data.agentBlocks?.[0]
    expect(agentBlock?.mcp).toEqual(['axiom_observability'])
    expect(agentBlock?.roles?.[0]?.mcp).toEqual(['axiom_observability'])
  })

  test('keeps a computer block through merge and into the deployment definition', () => {
    const files = new Map([
      [
        'prove.swirls',
        `computer prove_box {
  label: "Disposable prove box"
}
`,
      ],
    ])

    const fs = createMemoryRepoFs(files, '/repo')
    const merged = mergeProjectSwirlsFiles(fs, virtualRepoCwd('/repo'))
    expect(merged.computer.map((computer) => computer.name)).toEqual(['prove_box'])

    const { definition, parseError } = buildDeploymentDefinitionPayload(merged)
    expect(parseError).toBeNull()
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.computerBlocks).toMatchObject([
      {
        name: 'prove_box',
        label: 'Disposable prove box',
        software: {},
        disks: [],
        resources: { cpus: 2, memoryMiB: 1024 },
        needsMountTooling: false,
      },
    ])

    expect(parsed.data.computerBlocks?.[0]?.recipeHash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('carries an operation and the hash of its script into the deployment', () => {
    const files = new Map([
      [
        'ops.swirls',
        `operation restart_spooler {
  label: "Restart the print spooler"
  platform: windows
  timeout: 90
  command: @ps {
    Restart-Service -Name Spooler -Force
  }
}
`,
      ],
    ])

    const merged = mergeProjectSwirlsFiles(
      createMemoryRepoFs(files, '/repo'),
      virtualRepoCwd('/repo'),
    )

    const { definition, parseError } = buildDeploymentDefinitionPayload(merged)
    const parsed = parseDeploymentDefinition(definition)
    const script = 'Restart-Service -Name Spooler -Force\n'

    expect({
      parseError,
      operations: parsed.success ? parsed.data.operationBlocks : null,
    }).toMatchObject({
      parseError: null,
      operations: [
        {
          name: 'restart_spooler',
          label: 'Restart the print spooler',
          interpreter: 'powershell',
          platform: 'windows',
          runAs: 'system',
          timeoutSeconds: 90,
          script,
          scriptSha256: operationScriptSha256(script),
        },
      ],
    })
  })

  test('reads an operation script file byte for byte', () => {
    const files = new Map([
      ['ops.swirls', 'operation uptime {\n  command: @sh "scripts/uptime.sh"\n}\n'],
      ['scripts/uptime.sh', '#!/bin/sh\r\nuptime\r\n'],
    ])

    const merged = mergeProjectSwirlsFiles(
      createMemoryRepoFs(files, '/repo'),
      virtualRepoCwd('/repo'),
    )

    const { definition } = buildDeploymentDefinitionPayload(merged)
    const parsed = parseDeploymentDefinition(definition)

    expect(parsed.success && parsed.data.operationBlocks?.[0]).toMatchObject({
      interpreter: 'sh',
      script: '#!/bin/sh\r\nuptime\r\n',
      timeoutSeconds: 300,
    })
  })

  test('deploys a device node that runs an operation declared in another file', () => {
    const files = new Map([
      ['ops.swirls', 'operation uptime {\n  command: @sh { uptime }\n}\n'],
      [
        'flows.swirls',
        `workflow check_uptime {
  label: "Check uptime"
  root {
    label: "Start"
    type: code
    code: @ts { return { deviceId: "0199f6a0-0000-7000-8000-000000000001" } }
  }
  node run {
    type: device
    operation: uptime
    device: @ts { return context.nodes.root.output.deviceId }
    input: { verbose: true }
    waitSeconds: 120
  }
  flow { root -> run }
}
`,
      ],
    ])

    const merged = mergeProjectSwirlsFiles(
      createMemoryRepoFs(files, '/repo'),
      virtualRepoCwd('/repo'),
    )

    const { definition, parseError } = buildDeploymentDefinitionPayload(merged)
    const parsed = parseDeploymentDefinition(definition)

    const node = parsed.success
      ? parsed.data.workflows?.[0]?.nodes.find((item) => item.name === 'run')
      : undefined

    expect({
      parseError,
      config: node?.config,
      kinds: node?.configValueKinds,
    }).toEqual({
      parseError: null,
      config: {
        type: 'device',
        operation: 'uptime',
        device: ' return context.nodes.root.output.deviceId ',
        input: { verbose: true },
        waitSeconds: 120,
      },
      kinds: { device: 'ts' },
    })
  })

  test('refuses a duplicate operation name across files', () => {
    const files = new Map([
      ['a.swirls', 'operation uptime {\n  command: @sh { uptime }\n}\n'],
      ['b.swirls', 'operation uptime {\n  command: @sh { uptime }\n}\n'],
    ])

    expect(() =>
      mergeProjectSwirlsFiles(createMemoryRepoFs(files, '/repo'), virtualRepoCwd('/repo')),
    ).toThrow('Duplicate operation name "uptime"')
  })

  test('compiles a harness computer with its runtime and the harness memory default', () => {
    const files = new Map([
      [
        'codex.swirls',
        `computer codex_box {
  harness: {
    type: coding
    provider: codex
  }
}
`,
      ],
    ])

    const fs = createMemoryRepoFs(files, '/repo')
    const merged = mergeProjectSwirlsFiles(fs, virtualRepoCwd('/repo'))
    const { definition, parseError } = buildDeploymentDefinitionPayload(merged)
    expect(parseError).toBeNull()
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.computerBlocks).toMatchObject([
      {
        name: 'codex_box',
        resources: { cpus: 2, memoryMiB: 4096 },
        harness: {
          type: 'coding',
          provider: 'codex',
          runtime: COMPUTER_HARNESS_RUNTIME,
        },
      },
    ])
  })

  test('an agent binding adds mount tooling only when the computer has no disks', () => {
    const source = `
disk kb {}

computer spare {}

computer box {}

computer mounted {
  disks: [kb]
}

agent first {
  provider: openrouter
  model: "gpt-4o"
  computer: box
}

agent second {
  label: "Second"
  provider: openrouter
  model: "gpt-4o"
  computer: box
}

agent mounter {
  provider: openrouter
  model: "gpt-4o"
  computer: mounted
}
`

    const { definition, parseError } = buildDeploymentDefinitionPayload(parse(source).ast)
    expect(parseError).toBeNull()
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    const byName = new Map(
      (parsed.data.computerBlocks ?? []).map((computer) => [computer.name, computer]),
    )

    const spare = byName.get('spare')
    const box = byName.get('box')
    const mounted = byName.get('mounted')
    expect(spare?.needsMountTooling).toBe(false)
    expect(box?.needsMountTooling).toBe(true)
    expect(box?.disks).toEqual([])
    expect(mounted?.needsMountTooling).toBe(true)

    const oneAgent = buildDeploymentDefinitionPayload(
      parse(`
computer box {}
agent first {
  provider: openrouter
  model: "gpt-4o"
  computer: box
}
`).ast,
    )

    const oneParsed = parseDeploymentDefinition(oneAgent.definition)
    expect(oneParsed.success).toBe(true)

    if (!oneParsed.success) {
      return
    }

    expect(oneParsed.data.computerBlocks?.[0]?.recipeHash).toBe(box?.recipeHash)

    expect(mounted?.recipeHash).toBe(
      compileComputerRecipe({
        name: 'mounted',
        disks: ['kb'],
      }).recipeHash,
    )

    expect(box?.recipeHash).not.toBe(compileComputerRecipe({ name: 'box' }).recipeHash)
  })

  test('rejects duplicate mcp block names across files', () => {
    const files = new Map([
      [
        'a.swirls',
        'mcp axiom { label: "Axiom" url: "https://mcp.example.com/mcp" auth: static }\n',
      ],
      [
        'b.swirls',
        'mcp axiom { label: "Axiom 2" url: "https://mcp.example.com/mcp2" auth: static }\n',
      ],
    ])

    const fs = createMemoryRepoFs(files, '/repo')

    expect(() => mergeProjectSwirlsFiles(fs, virtualRepoCwd('/repo'))).toThrow(
      /Duplicate mcp name "axiom"/,
    )
  })

  test('maps connector blocks and mcp channel connector refs into the definition', () => {
    const source = `
connector client_portal {
  label: "Client connector"
  description: "Inbound OAuth application for MSP end clients"
}

agent finance_guy {
  provider: openrouter
  model: "gpt-4o"
}

channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    const connectorBlocks = parsed.data.connectorBlocks
    expect(connectorBlocks?.length).toBe(1)
    const firstConnector = connectorBlocks?.[0]
    expect(firstConnector?.name).toBe('client_portal')
    expect(firstConnector?.label).toBe('Client connector')
    expect(firstConnector?.description).toBe('Inbound OAuth application for MSP end clients')

    if (firstConnector) {
      expectUuidVersion7(firstConnector.id)
    }

    const channelBlock = parsed.data.channelBlocks?.[0]
    expect(channelBlock?.platform).toBe('mcp')
    expect(channelBlock?.connectorRef).toBe('client_portal')
  })

  test('rejects duplicate connector block names across files', () => {
    const files = new Map([
      ['a.swirls', 'connector client_portal { label: "One" }\n'],
      ['b.swirls', 'connector client_portal { label: "Two" }\n'],
    ])

    const fs = createMemoryRepoFs(files, '/repo')

    expect(() => mergeProjectSwirlsFiles(fs, virtualRepoCwd('/repo'))).toThrow(
      /Duplicate connector name "client_portal"/,
    )
  })

  test('throws when a scanned .swirls file cannot be read', () => {
    const files = new Map([
      [
        'a.swirls',
        'mcp axiom { label: "Axiom" url: "https://mcp.example.com/mcp" auth: static }\n',
      ],
      [
        'b.swirls',
        'mcp other { label: "Other" url: "https://mcp.example.com/other" auth: static }\n',
      ],
    ])

    const inner = createMemoryRepoFs(files, '/repo')

    const fs: typeof inner = {
      readdirSync: (dir, options) => inner.readdirSync(dir, options),
      readFileSync: (path, encoding) => {
        if (path.endsWith('b.swirls')) {
          throw new Error('EIO: i/o error')
        }

        return inner.readFileSync(path, encoding)
      },
    }

    expect(() => mergeProjectSwirlsFiles(fs, virtualRepoCwd('/repo'))).toThrow(
      /Failed to read "b\.swirls" while bundling/,
    )
  })
})

describe('buildDeploymentDefinitionPayload managed database blocks', () => {
  const databaseSource = `
database my_db {
  id: "my_db"
  schema: @prisma {
    model User {
      id        Int      @id @default(autoincrement())
      createdAt DateTime @default(now())
      email     String   @unique
      role      Role     @default(USER)
      posts     Post[]
    }
    model Post {
      id       Int    @id @default(autoincrement())
      title    String @db.VarChar(255)
      author   User   @relation(fields: [authorId], references: [id])
      authorId Int
    }
  }
}

migration collapse_names {
  database: my_db
  order: 1
  operation: @ts {
    for await (const user of context.db.my_db.user.stream()) {
      await context.db.my_db.user.update({
        where: { id: user.id },
        data: { name: \`\${user.firstName} \${user.lastName}\` },
      })
    }
  }
}
`

  test('maps database + migration blocks into the deployment definition', () => {
    const result = parse(databaseSource)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    const db = parsed.data.databaseBlocks?.[0]
    expect(db).toBeDefined()

    if (!db) {
      return
    }

    expect(db.name).toBe('my_db')
    expectUuidVersion7(db.id)
    // schema is stored verbatim: identical to the parsed @prisma island source.
    expect(db.schema).toBe(result.ast.databases[0]?.schemaSource ?? '')
    expect(db.schema).toContain('model User {')
    expect(db.schema).toContain('model Post {')
    // checksum is the sha256 hex of the schema text.
    expect(db.schemaChecksum).toBe(createHash('sha256').update(db.schema, 'utf8').digest('hex'))
    expect(db.schemaChecksum).toMatch(/^[a-f0-9]{64}$/)

    const migration = parsed.data.databaseMigrations?.[0]
    expect(migration).toBeDefined()

    if (!migration) {
      return
    }

    expect(migration.name).toBe('collapse_names')
    expect(migration.database).toBe('my_db')
    expect(migration.order).toBe(1)
    expect(migration.operationCode).toContain('context.db.my_db.user.update')
    expectUuidVersion7(migration.id)
  })

  test('maps nested database connection blocks without credentials', () => {
    const source = `
database my_db {
  schema: @prisma { model User { id Int @id } }
  connection app {
    label: "Application connection"
    description: "Used by the app runtime"
  }
}
`

    const result = parse(source)
    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    const db = parsed.data.databaseBlocks?.[0]

    expect(db?.connections).toEqual([
      expect.objectContaining({
        name: 'app',
        label: 'Application connection',
        description: 'Used by the app runtime',
      }),
    ])

    expect(db?.connections?.[0]).not.toHaveProperty('directUrl')
    expect(db?.connections?.[0]).not.toHaveProperty('password')
  })

  test('schema checksum is stable across repeated bundles', () => {
    const first = buildDeploymentDefinitionPayload(parse(databaseSource).ast)
    const second = buildDeploymentDefinitionPayload(parse(databaseSource).ast)

    const firstParsed = parseDeploymentDefinition(first.definition)
    const secondParsed = parseDeploymentDefinition(second.definition)
    expect(firstParsed.success).toBe(true)
    expect(secondParsed.success).toBe(true)

    if (!firstParsed.success || !secondParsed.success) {
      return
    }

    expect(secondParsed.data.databaseBlocks?.[0]?.schemaChecksum).toBe(
      firstParsed.data.databaseBlocks?.[0]?.schemaChecksum,
    )
  })

  test('throws when a database schema is empty', () => {
    const result = parse(`
database empty_db {
  schema: @prisma {
  }
}
`)

    expect(result.errors.length).toBe(0)

    expect(() => buildDeploymentDefinitionPayload(result.ast)).toThrow(
      /must define a non-empty schema/,
    )
  })

  test('throws when a migration references an undeclared database', () => {
    const result = parse(`
migration orphan {
  database: not_declared
  order: 0
  operation: @ts { return 1 }
}
`)

    expect(result.errors.length).toBe(0)

    expect(() => buildDeploymentDefinitionPayload(result.ast)).toThrow(
      /references undeclared database "not_declared"/,
    )
  })

  test('throws on duplicate (database, order) migration pairs', () => {
    const result = parse(`
database my_db {
  schema: @prisma {
    model User { id Int @id }
  }
}

migration first {
  database: my_db
  order: 1
  operation: @ts { return 1 }
}

migration second {
  database: my_db
  order: 1
  operation: @ts { return 2 }
}
`)

    expect(result.errors.length).toBe(0)

    expect(() => buildDeploymentDefinitionPayload(result.ast)).toThrow(
      /reuses order 1 for database "my_db"/,
    )
  })
})

describe('buildDeploymentDefinitionPayload channel response policy', () => {
  test('normalizes duration literals to seconds and carries mode ambient', () => {
    const result = parse(`
agent triage {
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel ops {
  label: "Ops"
  platform: swirls
  agent: triage
  mode: ambient
  engagement_timeout: "30m"
  cooldown: "15s"
  max_unprompted_per_hour: 6
}
`)

    expect(result.errors.length).toBe(0)

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()

    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    const channelBlock = parsed.data.channelBlocks?.[0]
    expect(channelBlock?.mode).toBe('ambient')
    expect(channelBlock?.engagementTimeoutSeconds).toBe(1800)
    expect(channelBlock?.cooldownSeconds).toBe(15)
    expect(channelBlock?.maxUnpromptedPerHour).toBe(6)
  })

  test('omits the policy keys when the channel declares none', () => {
    const result = parse(`
agent triage {
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel ops {
  label: "Ops"
  platform: swirls
  agent: triage
}
`)

    expect(result.errors.length).toBe(0)

    const { definition } = buildDeploymentDefinitionPayload(result.ast)
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      throw parsed.error
    }

    const channelBlock = parsed.data.channelBlocks?.[0]
    expect(channelBlock?.engagementTimeoutSeconds).toBeUndefined()
    expect(channelBlock?.cooldownSeconds).toBeUndefined()
    expect(channelBlock?.maxUnpromptedPerHour).toBeUndefined()
  })

  test('reduces equivalent duration spellings to the same seconds', () => {
    const definitionFor = (literal: string) => {
      const result = parse(`
agent triage {
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel ops {
  label: "Ops"
  platform: swirls
  agent: triage
  engagement_timeout: "${literal}"
}
`)

      expect(result.errors.length).toBe(0)

      const parsed = parseDeploymentDefinition(
        buildDeploymentDefinitionPayload(result.ast).definition,
      )

      if (!parsed.success) {
        throw parsed.error
      }

      return parsed.data.channelBlocks?.[0]?.engagementTimeoutSeconds
    }

    expect(definitionFor('1h')).toBe(3600)
    expect(definitionFor('60m')).toBe(3600)
    expect(definitionFor('3600s')).toBe(3600)
  })
})

test('bundles workflow-only MCP channels and direct grants with resolved input schemas', () => {
  const { ast, errors } = parse(`
    schema quote_input { schema: @json { { "type": "object", "properties": { "customer": { "type": "string" } }, "required": ["customer"] } } }
    workflow quote {
      label: "Quote"
      description: "Create a quote"
      root { type: code inputSchema: quote_input code: @ts { return {} } }
    }
    connector customers {}
    channel sales { platform: mcp connector: customers workflows: [quote] }
    role salesperson { match { department: "sales" } }
    policy { allow salesperson -> workflow quote }
  `)

  expect(errors).toEqual([])
  const { definition, parseError } = buildDeploymentDefinitionPayload(ast)
  expect(parseError).toBeNull()
  const result = parseDeploymentDefinition(definition)
  expect(result.success).toBe(true)

  if (!result.success) {
    return
  }

  expect(result.data.channelBlocks?.[0]?.workflows).toEqual(['quote'])
  expect(result.data.channelBlocks?.[0]?.agent).toBeUndefined()

  expect(result.data.policies?.[0]?.grants[0]).toEqual({
    effect: 'allow',
    role: 'salesperson',
    workflow: 'quote',
  })

  expect(result.data.workflows?.[0]?.nodes[0]?.inputSchema).toMatchObject({
    type: 'object',
    required: ['customer'],
  })
})

describe('buildDeploymentDefinitionPayload agent provider', () => {
  test('omitted provider deploys as openrouter', () => {
    const result = parse(`
secret ai_creds { vars: [ OPENROUTER_API_KEY ] }

agent operator {
  model: "anthropic/claude-sonnet-4.5"
  secrets: ai_creds
}
`)

    expect(result.errors).toEqual([])
    expect(result.ast.agent?.[0]?.provider).toBe('openrouter')

    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.agentBlocks?.[0]?.provider).toBe('openrouter')
  })

  test('an explicit provider is unchanged in the deployment definition', () => {
    const result = parse(`
secret ai_creds { vars: [ OPENAI_API_KEY ] }

agent operator {
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
}
`)

    expect(result.errors).toEqual([])
    const { definition, parseError } = buildDeploymentDefinitionPayload(result.ast)
    expect(parseError).toBeNull()
    const parsed = parseDeploymentDefinition(definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    expect(parsed.data.agentBlocks?.[0]?.provider).toBe('openai')
  })
})
