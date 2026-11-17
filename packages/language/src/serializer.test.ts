import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ConfigValue, SwirlsFile } from './ast'
import { parse } from './parser'
import { serialize } from './serializer'

const EXAMPLES_DIR = path.join(import.meta.dir, '../examples')

/** Compare config fields ignoring source ranges (which differ across parses). */
function normalizeConfigValue(cv: ConfigValue): unknown {
  switch (cv.kind) {
    case 'string':
    case 'number':
    case 'null':
    case 'boolean':
      return { kind: cv.kind, value: cv.value }
    case 'object': {
      const keys = Object.keys(cv.value).sort()
      const value: Record<string, unknown> = {}
      for (const k of keys) {
        value[k] = normalizeConfigValue(cv.value[k]!)
      }
      return { kind: 'object', value }
    }
    case 'array':
      return {
        kind: 'array',
        value: cv.value.map(normalizeConfigValue),
      }
    case 'ts_block':
    case 'sql_block':
      return { kind: cv.kind, code: cv.code }
    case 'ts_file_ref':
      return { kind: 'ts_file_ref', path: cv.path }
    default:
      return cv
  }
}

function configFieldsEqual(
  a: Record<string, ConfigValue>,
  b: Record<string, ConfigValue>,
): boolean {
  const keysA = Object.keys(a).sort()
  const keysB = Object.keys(b).sort()
  if (keysA.length !== keysB.length) {
    return false
  }
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) {
      return false
    }
  }
  for (const k of keysA) {
    if (
      JSON.stringify(normalizeConfigValue(a[k]!)) !==
      JSON.stringify(normalizeConfigValue(b[k]!))
    ) {
      return false
    }
  }
  return true
}

function loadSource(file: string): string {
  const p = path.join(EXAMPLES_DIR, file)
  return fs.readFileSync(p, 'utf8')
}

function structuralEqual(a: SwirlsFile, b: SwirlsFile): boolean {
  if ((a.schemas?.length ?? 0) !== (b.schemas?.length ?? 0)) {
    return false
  }
  if (a.forms.length !== b.forms.length) {
    return false
  }
  if (a.webhooks.length !== b.webhooks.length) {
    return false
  }
  if (a.schedules.length !== b.schedules.length) {
    return false
  }
  if (a.workflows.length !== b.workflows.length) {
    return false
  }
  if ((a.streams?.length ?? 0) !== (b.streams?.length ?? 0)) {
    return false
  }
  if (a.triggers.length !== b.triggers.length) {
    return false
  }
  if ((a.secrets?.length ?? 0) !== (b.secrets?.length ?? 0)) {
    return false
  }
  if ((a.auths?.length ?? 0) !== (b.auths?.length ?? 0)) {
    return false
  }
  for (let i = 0; i < a.forms.length; i++) {
    if (a.forms[i]?.name !== b.forms[i]?.name) {
      return false
    }
  }
  for (let i = 0; i < a.workflows.length; i++) {
    const ga = a.workflows[i]!
    const gb = b.workflows[i]!
    if (ga.name !== gb.name) {
      return false
    }
    if (ga.nodes.length !== gb.nodes.length) {
      return false
    }
    if (ga.edges.length !== gb.edges.length) {
      return false
    }
    for (let j = 0; j < ga.nodes.length; j++) {
      if (
        ga.nodes[j]?.name !== gb.nodes[j]?.name ||
        ga.nodes[j]?.type !== gb.nodes[j]?.type
      ) {
        return false
      }
    }
    for (let j = 0; j < ga.edges.length; j++) {
      if (
        ga.edges[j]?.source !== gb.edges[j]?.source ||
        ga.edges[j]?.target !== gb.edges[j]?.target
      ) {
        return false
      }
    }
  }
  const aStreams = a.streams ?? []
  const bStreams = b.streams ?? []
  for (let i = 0; i < aStreams.length; i++) {
    if (aStreams[i]?.name !== bStreams[i]?.name) {
      return false
    }
  }
  for (let i = 0; i < a.triggers.length; i++) {
    if (
      a.triggers[i]?.name !== b.triggers[i]?.name ||
      a.triggers[i]?.workflowName !== b.triggers[i]?.workflowName
    ) {
      return false
    }
  }
  const aSecrets = a.secrets ?? []
  const bSecrets = b.secrets ?? []
  for (let i = 0; i < aSecrets.length; i++) {
    const sa = aSecrets[i]!
    const sb = bSecrets[i]!
    if (sa.name !== sb.name) {
      return false
    }
    if (sa.label !== sb.label) {
      return false
    }
    if (sa.description !== sb.description) {
      return false
    }
    if (sa.vars.length !== sb.vars.length) {
      return false
    }
    for (let j = 0; j < sa.vars.length; j++) {
      if (sa.vars[j] !== sb.vars[j]) {
        return false
      }
    }
  }
  const aAuths = a.auths ?? []
  const bAuths = b.auths ?? []
  for (let i = 0; i < aAuths.length; i++) {
    const aa = aAuths[i]!
    const ba = bAuths[i]!
    if (aa.name !== ba.name) {
      return false
    }
    if (aa.label !== ba.label) {
      return false
    }
    if (aa.description !== ba.description) {
      return false
    }
    if (aa.authType !== ba.authType) {
      return false
    }
    if (aa.secretsRef !== ba.secretsRef) {
      return false
    }
    if (!configFieldsEqual(aa.configFields, ba.configFields)) {
      return false
    }
  }
  return true
}

describe('serialize', () => {
  test('round-trips workflow execution token TTL and concurrency', () => {
    const first = parse(`
workflow concurrent {
  label: "Concurrent"
  executionTokenTtl: "150m"
  concurrency: 12
  root {
    type: code
    code: @ts { return {} }
  }
}`)
    expect(first.errors).toEqual([])
    const output = serialize(first.ast)
    expect(output).toContain('executionTokenTtl: "150m"')
    expect(output).toContain('concurrency: 12')
    const second = parse(output)
    expect(second.errors).toEqual([])
    expect(second.ast.workflows[0]?.executionTokenTtl).toBe('150m')
    expect(second.ast.workflows[0]?.concurrency).toBe(12)
  })

  describe('round-trip parse -> serialize -> parse', () => {
    const exampleFiles = [
      'minimal.swirls',
      'contact-form-workflow.swirls',
      'webhook-and-schedule.swirls',
      'review-workflow.swirls',
      'ai-tasks.swirls',
      'switch-routing.swirls',
      'subgraph-workflow.swirls',
      'loop-batch-pipeline.swirls',
    ]

    test('valid-auth.swirls fixture produces structurally equivalent AST', () => {
      const fixturesDir = path.join(import.meta.dir, '__fixtures__')
      const source = fs.readFileSync(
        path.join(fixturesDir, 'valid-auth.swirls'),
        'utf8',
      )
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      const serialized = serialize(first.ast)
      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(structuralEqual(first.ast, second.ast)).toBe(true)
    })

    test('loop-inline-subgraph.swirls fixture produces structurally equivalent AST', () => {
      const fixturesDir = path.join(import.meta.dir, '__fixtures__')
      const source = fs.readFileSync(
        path.join(fixturesDir, 'loop-inline-subgraph.swirls'),
        'utf8',
      )
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      const serialized = serialize(first.ast)
      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(structuralEqual(first.ast, second.ast)).toBe(true)
    })

    for (const file of exampleFiles) {
      test(`${file} produces structurally equivalent AST`, () => {
        const source = loadSource(file)
        const first = parse(source)
        expect(first.errors.length).toBe(0)
        const serialized = serialize(first.ast)
        const second = parse(serialized)
        expect(second.errors.length).toBe(0)
        expect(structuralEqual(first.ast, second.ast)).toBe(true)
      })
    }
  })

  describe('output contains expected syntax', () => {
    test('form, graph, trigger appear in serialized output', () => {
      const source = loadSource('minimal.swirls')
      const { ast } = parse(source)
      const out = serialize(ast)
      expect(out).toContain('form minimal_contact')
      expect(out).toContain('workflow process_contact')
      expect(out).toContain('trigger on_minimal_contact')
      expect(out).toContain('form:minimal_contact -> process_contact')
    })

    test('agent computer: round-trips next to disks', () => {
      const source = `computer pr_bot {}

secret creds { vars: [ OPENAI_API_KEY ] }

agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: creds
  computer: pr_bot
}
`
      const first = parse(source)
      expect(first.errors).toEqual([])
      const out = serialize(first.ast)
      expect(out).toContain('computer: pr_bot')
      const computerAt = out.indexOf('computer: pr_bot')
      const agentAt = out.indexOf('agent worker')
      expect(computerAt).toBeGreaterThan(agentAt)
      const second = parse(out)
      expect(second.errors).toEqual([])
      expect(second.ast.agent?.[0]?.computer).toBe('pr_bot')
      expect(serialize(second.ast)).toBe(out)
    })

    test('mcp block and agent mcp list round-trip', () => {
      const source = `mcp axiom_observability {
  label: "Axiom"
  description: "Query Swirls traces, logs, and metrics via MCP"
  url: "https://mcp.example.com/mcp"
}

agent sre_assistant {
  provider: openrouter
  model: "gpt4o"
  secrets: creds
  mcp: [ axiom_observability ]

  profile oncall {
    mcp: [ axiom_observability ]
  }
}

secret creds { vars: [ OPENROUTER_API_KEY ] }
`
      const first = parse(source)
      expect(first.errors).toEqual([])
      const out = serialize(first.ast)
      expect(out).toContain('mcp axiom_observability {')
      expect(out).toContain('label: "Axiom"')
      expect(out).toContain('url: "https://mcp.example.com/mcp"')
      expect(out).toContain('mcp: [ axiom_observability ]')
      const second = parse(out)
      expect(second.errors).toEqual([])
      expect(second.ast.mcp?.[0]?.name).toBe('axiom_observability')
      expect(second.ast.agent?.[0]?.mcp).toEqual(['axiom_observability'])
      expect(second.ast.agent?.[0]?.profiles?.[0]?.mcp).toEqual([
        'axiom_observability',
      ])
    })

    test('omitted agent provider stays omitted and re-parses as openrouter', () => {
      const source = `secret ai_creds { vars: [ OPENROUTER_API_KEY ] }

agent operator {
  model: "gpt4o"
  secrets: ai_creds
}
`
      const first = parse(source)
      expect(first.errors).toEqual([])
      expect(first.ast.agent?.[0]?.provider).toBe('openrouter')
      const out = serialize(first.ast)
      expect(out).not.toContain('provider:')
      const second = parse(out)
      expect(second.errors).toEqual([])
      expect(second.ast.agent?.[0]?.provider).toBe('openrouter')
      expect(serialize(second.ast)).toBe(out)
    })

    test('explicit agent provider round-trips, including the openrouter default', () => {
      const source = `secret ai_creds { vars: [ OPENROUTER_API_KEY, OPENAI_API_KEY ] }

agent routed {
  provider: openrouter
  model: "gpt4o"
  secrets: ai_creds
}

agent direct {
  provider: openai
  model: "gpt4o"
  secrets: ai_creds
}
`
      const first = parse(source)
      expect(first.errors).toEqual([])
      const out = serialize(first.ast)
      expect(out).toContain('provider: openrouter')
      expect(out).toContain('provider: openai')
      const second = parse(out)
      expect(second.errors).toEqual([])
      expect(second.ast.agent?.map((agent) => agent.provider)).toEqual([
        'openrouter',
        'openai',
      ])
      expect(serialize(second.ast)).toBe(out)
    })

    test('ambient channel and its response policy round-trip', () => {
      const source = `channel ops {
  label: "Ops"
  platform: swirls
  agent: triage
  mode: ambient
  engagement_timeout: "30m"
  cooldown: "15s"
  max_unprompted_per_hour: 6
}
`
      const first = parse(source)
      expect(first.errors).toEqual([])
      const out = serialize(first.ast)
      expect(out).toContain('mode: ambient')
      expect(out).toContain('engagement_timeout: "30m"')
      expect(out).toContain('cooldown: "15s"')
      expect(out).toContain('max_unprompted_per_hour: 6')
      const second = parse(out)
      expect(second.errors).toEqual([])
      const ch = second.ast.channels?.[0]
      expect(ch?.mode).toBe('ambient')
      expect(ch?.engagementTimeout).toBe('30m')
      expect(ch?.cooldown).toBe('15s')
      expect(ch?.maxUnpromptedPerHour).toBe(6)
      // Second pass is a fixed point: the formatter neither adds defaults nor
      // rewrites the literals the author chose.
      expect(serialize(second.ast)).toBe(out)
    })

    test('a channel without a response policy serializes none of its keys', () => {
      const source = `channel ops {
  platform: swirls
  agent: triage
  mode: all
}
`
      const { ast, errors } = parse(source)
      expect(errors).toEqual([])
      const out = serialize(ast)
      expect(out).not.toContain('engagement_timeout')
      expect(out).not.toContain('cooldown')
      expect(out).not.toContain('max_unprompted_per_hour')
    })

    test('connector block and mcp channel round-trip', () => {
      const source = `connector client_portal {
  label: "Client connector"
  description: "Inbound OAuth application"
}

channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
}
`
      const first = parse(source)
      expect(first.errors).toEqual([])
      const out = serialize(first.ast)
      expect(out).toContain('connector client_portal {')
      expect(out).toContain('connector: client_portal')
      // `mode:` must be omitted for MCP channels so the form stays valid.
      expect(out).not.toContain('mode:')
      const second = parse(out)
      expect(second.errors).toEqual([])
      expect(second.ast.connector?.[0]?.name).toBe('client_portal')
      expect(second.ast.channels?.[0]?.connector).toBe('client_portal')
      expect(second.ast.channels?.[0]?.platform).toBe('mcp')
      expect(second.ast.channels?.[0]?.modeRange).toBeUndefined()
    })

    test('labeled edge appears in serialized output', () => {
      const source = loadSource('switch-routing.swirls')
      const { ast } = parse(source)
      const out = serialize(ast)
      expect(out).toContain('-["urgent"]->')
    })
  })

  describe('config value serialization', () => {
    test('string, number, boolean in node config', () => {
      const source = `
workflow g {
  label: "G"
  node n {
    type: ai
    label: "AI"
    kind: text
    model: "gpt-4"
    prompt: @ts {
      return "x"
    }  }
  flow { }
}
`
      const { ast } = parse(source)
      const out = serialize(ast)
      expect(out).toContain('kind:')
      expect(out).toContain('model: "gpt-4"')
    })
  })

  describe('ts_file_ref', () => {
    test('serializes as @ts string', () => {
      const source = `
workflow g {
  node n {
    type: code
    label: "N"
    code: @ts "./a.ts.swirls"
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const out = serialize(ast)
      expect(out).toContain('@ts "./a.ts.swirls"')
    })
  })

  describe('review config', () => {
    test('review: true shorthand is serialized', () => {
      const source = loadSource('minimal.swirls')
      const { ast } = parse(source)
      const out = serialize(ast)
      expect(out).toContain('review:')
      const nodeWithReview = ast.workflows[0]?.nodes.find(
        (n) => n.reviewConfig != null,
      )
      expect(nodeWithReview).toBeDefined()
    })
  })

  describe('stream block', () => {
    test('round-trip preserves stream name, label, graph, prepare', () => {
      const source = `
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
}
stream out {
  label: "Out"
  workflow: g
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      condition: @ts { return true }
      prepare: @ts { return {} }
    }
  }
}
`
      const { ast: a1, errors: e1 } = parse(source)
      expect(e1.length).toBe(0)
      const ser = serialize(a1)
      const { ast: a2, errors: e2 } = parse(ser)
      expect(e2.length).toBe(0)
      expect(a2.streams.length).toBe(1)
      const s = a2.streams[0]!
      expect(s.name).toBe('out')
      expect(s.label).toBe('Out')
      expect(s.workflowName).toBe('g')
      expect(s.version).toBe('v1')
      const v1 = s.versions.find((v) => v.key === 'v1')
      expect(v1).toBeDefined()
      expect(v1?.prepare?.kind).toBe('ts_block')
      expect(v1?.condition?.kind).toBe('ts_block')
    })
  })

  describe('postgres blocks', () => {
    test('round-trip: valid-postgres.swirls parses → serializes → re-parses with matching AST', () => {
      const source = fs.readFileSync(
        path.join(import.meta.dir, '__fixtures__', 'valid-postgres.swirls'),
        'utf8',
      )
      const { ast: ast1, errors: e1 } = parse(source)
      expect(e1).toEqual([])

      const serialized = serialize(ast1)
      const { ast: ast2, errors: e2 } = parse(serialized)
      expect(e2).toEqual([])

      expect(ast2.postgres.length).toBe(ast1.postgres.length)
      const r1 = ast1.postgres[0]!
      const r2 = ast2.postgres[0]!
      expect(r2.name).toBe(r1.name)
      expect(r2.secretsRef).toBe(r1.secretsRef)
      expect(r2.connection).toBe(r1.connection)
      expect(r2.connectionIsLiteral).toBe(r1.connectionIsLiteral)
      expect(r2.tables.length).toBe(r1.tables.length)
      for (let i = 0; i < r1.tables.length; i++) {
        expect(r2.tables[i]?.name).toBe(r1.tables[i]?.name)
      }
    })

    test('serialized output contains expected postgres syntax', () => {
      const source = fs.readFileSync(
        path.join(import.meta.dir, '__fixtures__', 'valid-postgres.swirls'),
        'utf8',
      )
      const { ast } = parse(source)
      const out = serialize(ast)
      expect(out).toContain('postgres my_db {')
      expect(out).not.toContain('resource my_db')
      expect(out).toContain('secrets: db_credentials')
      expect(out).toContain('connection: PG_CONNECTION_STRING')
      expect(out).toContain('table leads {')
      expect(out).toContain('table audit_log {')
    })

    test('literal connection string serialized with quotes', () => {
      const source = `
postgres db {
  connection: "postgres://localhost/mydb"
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
`
      const { ast } = parse(source)
      const out = serialize(ast)
      expect(out).toContain('connection: "postgres://localhost/mydb"')
    })
  })

  describe('form visibility round-trip', () => {
    test('serializes `visibility: public` and re-parses', () => {
      const source = `
form pub {
  label: "Public"
  visibility: public
  schema: @json { {} }
}
`
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      expect(first.ast.forms[0]?.visibility).toBe('public')

      const serialized = serialize(first.ast)
      expect(serialized).toContain('visibility: public')

      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(second.ast.forms[0]?.visibility).toBe('public')
    })

    test('explicit `visibility: internal` round-trips identically', () => {
      const source = `
form internal_form {
  label: "Internal"
  visibility: internal
  schema: @json { {} }
}
`
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      expect(first.ast.forms[0]?.visibility).toBe('internal')

      // The default is suppressed on emit (cleaner round-trip), but the AST
      // value is identical when re-parsed because absence also defaults to
      // `'internal'`.
      const serialized = serialize(first.ast)
      expect(serialized).not.toContain('visibility: internal')

      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(second.ast.forms[0]?.visibility).toBe('internal')
    })

    test('absent visibility round-trips with default `internal`', () => {
      const source = `
form legacy {
  label: "Legacy"
  schema: @json { {} }
}
`
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      expect(first.ast.forms[0]?.visibility).toBe('internal')

      const serialized = serialize(first.ast)
      expect(serialized).not.toContain('visibility')

      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(second.ast.forms[0]?.visibility).toBe('internal')
    })
  })

  describe('form auth round-trip', () => {
    test('serializes auth ref and re-parses identically', () => {
      const source = `
form gated {
  label: "Gated"
  visibility: public
  auth: portal
  schema: @json { {} }
}
`
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      expect(first.ast.forms[0]?.authRef).toBeDefined()
      expect(first.ast.forms[0]?.authRef?.name).toBe('portal')

      const serialized = serialize(first.ast)
      expect(serialized).toContain('auth: portal')

      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(second.ast.forms[0]?.authRef?.name).toBe('portal')
    })

    test('absent auth ref round-trips without the field', () => {
      const source = `
form open {
  label: "Open"
  visibility: public
  schema: @json { {} }
}
`
      const first = parse(source)
      expect(first.errors.length).toBe(0)

      const serialized = serialize(first.ast)
      expect(serialized).not.toContain('auth:')

      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(second.ast.forms[0]?.authRef).toBeUndefined()
    })
  })

  describe('webhook secret and header round-trip', () => {
    test('serializes secret: block.VAR and header: "Name" and re-parses', () => {
      const source = `
secret my_secret {
  label: "Secrets"
  vars: [STRIPE]
}

webhook stripe_hook {
  label: "Stripe"
  secret: my_secret.STRIPE
  header: "Stripe-Security"
}
`
      const first = parse(source)
      expect(first.errors.length).toBe(0)
      const serialized = serialize(first.ast)
      expect(serialized).toContain('secret: my_secret.STRIPE')
      expect(serialized).toContain('header: "Stripe-Security"')
      const second = parse(serialized)
      expect(second.errors.length).toBe(0)
      expect(second.ast.webhooks[0]?.secretRef?.blockName).toBe('my_secret')
      expect(second.ast.webhooks[0]?.secretRef?.varName).toBe('STRIPE')
      expect(second.ast.webhooks[0]?.header?.value).toBe('Stripe-Security')
    })
  })
})
