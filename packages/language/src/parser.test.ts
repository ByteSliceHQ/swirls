import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from './parser'

const EXAMPLES_DIR = path.join(import.meta.dir, '../examples')
const FIXTURES_DIR = path.join(import.meta.dir, '__fixtures__')

function loadSource(dir: string, file: string): string {
  const p = path.join(dir, file)

  if (!fs.existsSync(p)) {
    throw new Error(`File not found: ${p}`)
  }

  return fs.readFileSync(p, 'utf8')
}

describe('parse', () => {
  test('parses workflow execution token TTL, concurrency, and fanout nodes', () => {
    const source = `
workflow child {
  label: "Child"
  root {
    type: code
    inputSchema: @json { { "type": "object" } }
    code: @ts { return context.nodes.root.input }
  }
}

workflow parent {
  label: "Parent"
  executionTokenTtl: "3h"
  concurrency: 16
  root {
    type: code
    code: @ts { return { items: [] } }
  }
  node explore {
    type: fanout
    items: @ts { return context.nodes.root.output.items }
    maxItems: 20
    concurrency: 8
    workflow: child
  }
  flow {
    root -> explore
  }
}`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.workflows[1]?.executionTokenTtl).toBe('3h')
    expect(ast.workflows[1]?.concurrency).toBe(16)
    expect(ast.workflows[1]?.nodes[1]?.type).toBe('fanout')
  })

  describe('structural correctness against example files', () => {
    test('minimal.swirls has 1 form, 1 graph, 1 trigger', () => {
      const source = loadSource(EXAMPLES_DIR, 'minimal.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms.length).toBe(1)
      expect(ast.forms[0]?.name).toBe('minimal_contact')
      expect(ast.workflows.length).toBe(1)
      expect(ast.workflows[0]?.name).toBe('process_contact')
      expect(ast.workflows[0]?.nodes.length).toBe(1)
      expect(ast.workflows[0]?.nodes[0]?.name).toBe('root')
      expect(ast.triggers.length).toBe(1)
      expect(ast.triggers[0]?.name).toBe('on_minimal_contact')
      expect(ast.triggers[0]?.resourceType).toBe('form')
      expect(ast.triggers[0]?.resourceName).toBe('minimal_contact')
      expect(ast.triggers[0]?.workflowName).toBe('process_contact')
    })

    test('switch-routing.swirls has form, graph with switch node and labeled edges', () => {
      const source = loadSource(EXAMPLES_DIR, 'switch-routing.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms.length).toBe(1)
      expect(ast.workflows.length).toBe(1)
      const g = ast.workflows[0]!
      expect(g.nodes.length).toBe(5)
      expect(g.edges.length).toBe(4)
      const labeled = g.edges.filter((e) => e.label != null)
      expect(labeled.length).toBe(3)
      expect(labeled.some((e) => e.label === 'urgent')).toBe(true)
      const switchNode = g.nodes.find((n) => n.type === 'switch')
      expect(switchNode?.name).toBe('classify')
    })

    test('webhook-and-schedule.swirls has webhooks and schedules', () => {
      const source = loadSource(EXAMPLES_DIR, 'webhook-and-schedule.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.webhooks.length).toBeGreaterThan(0)
      expect(ast.schedules.length).toBeGreaterThan(0)
    })

    test('graph with type: stream node parses both nodes', () => {
      const source = `
workflow g {
  label: "G"
  root {
    type: code
    code: @ts { return {} }
  }
  node a {
    type: stream
    label: "A"
    stream: my_stream
    version: v1
    filter: @ts { return {} }
  }
  node b {
    type: code
    label: "B"
    code: @ts { return 1 }
  }
  flow { root -> a -> b }
}

stream my_stream {
  enabled: true
  label: "M"
  workflow: g
  version: v1
  versions: {
    v1 {
      schema: @json {
        { "type": "object" }
      }
      condition: @ts { return true }
      prepare: @ts { return context.output }
    }
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const graph = ast.workflows[0]
      expect(graph?.nodes.map((n) => n.name)).toEqual(['root', 'a', 'b'])
    })

    test('ai-tasks.swirls has AI nodes with kind and options', () => {
      const source = loadSource(EXAMPLES_DIR, 'ai-tasks.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const aiNodes = ast.workflows[0]!.nodes.filter((n) => n.type === 'ai')
      expect(aiNodes.length).toBeGreaterThan(0)
      const imageNode = aiNodes.find(
        (n) =>
          n.configFields.kind?.kind === 'string' &&
          n.configFields.kind?.value === 'image',
      )
      expect(imageNode).toBeDefined()
      expect(imageNode?.configFields.options).toBeDefined()
    })

    test('standalone-ts-ref.swirls uses ts_file_ref for root code', () => {
      const source = loadSource(EXAMPLES_DIR, 'standalone-ts-ref.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.workflows.length).toBe(1)
      const root = ast.workflows[0]!.nodes[0]!
      expect(root.name).toBe('root')
      expect(root.configFields.code?.kind).toBe('ts_file_ref')
      if (root.configFields.code?.kind === 'ts_file_ref') {
        expect(root.configFields.code.path).toBe('./normalize-email.ts.swirls')
      }
    })

    test('subgraph-workflow.swirls has two graphs and a graph node referencing the child', () => {
      const source = loadSource(EXAMPLES_DIR, 'subgraph-workflow.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.workflows.length).toBe(2)
      const helperGraph = ast.workflows.find((g) => g.name === 'helper_graph')
      const mainGraph = ast.workflows.find((g) => g.name === 'main_graph')
      expect(helperGraph).toBeDefined()
      expect(mainGraph).toBeDefined()
      const workflowNode = mainGraph?.nodes.find((n) => n.type === 'workflow')
      expect(workflowNode).toBeDefined()
      expect(workflowNode?.name).toBe('run_helper')
      const workflowConfig = workflowNode?.configFields.workflow
      expect(workflowConfig).toBeDefined()
      expect(workflowConfig?.kind).toBe('string')
      expect((workflowConfig as { value: string }).value).toBe('helper_graph')
    })
  })

  describe('form parsing', () => {
    test('name, label, description, enabled, schema, schemaBlock', () => {
      const source = `
form my_form {
  label: "My Form"
  description: "A form"
  enabled: true
  schema: @json {
    { "type": "object", "properties": { "x": { "type": "string" } } }
  }}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms.length).toBe(1)
      const f = ast.forms[0]!
      expect(f.name).toBe('my_form')
      expect(f.label).toBe('My Form')
      expect(f.description).toBe('A form')
      expect(f.enabled).toBe(true)
      expect(f.schema).toBeDefined()
      expect(typeof f.schema).toBe('object')
      expect(f.schemaBlock).toBeDefined()
      expect(f.schemaBlock?.code).toContain('"type": "object"')
      expect(f.range.start.line).toBeGreaterThanOrEqual(1)
    })
  })

  describe('form visibility', () => {
    test('`visibility: public` parses to `public`', () => {
      const source = `
form public_form {
  label: "Public"
  visibility: public
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms[0]?.visibility).toBe('public')
      expect(ast.forms[0]?.visibilityRange).toBeDefined()
    })

    test('`visibility: internal` parses to `internal`', () => {
      const source = `
form internal_form {
  label: "Internal"
  visibility: internal
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms[0]?.visibility).toBe('internal')
      expect(ast.forms[0]?.visibilityRange).toBeDefined()
    })

    test('no `visibility` field defaults to `internal`', () => {
      const source = `
form legacy {
  label: "Legacy"
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms[0]?.visibility).toBe('internal')
      expect(ast.forms[0]?.visibilityRange).toBeUndefined()
    })

    test('invalid value `visibility: foo` reports parser error with range', () => {
      const source = `
form bad {
  label: "Bad"
  visibility: foo
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
      const visErr = errors.find((e) => e.message.includes('visibility'))
      expect(visErr).toBeDefined()
      expect(visErr?.range.start.line).toBeGreaterThan(0)
      // Despite the error, the AST falls back to the default so downstream
      // consumers still see a valid FormVisibility value.
      expect(ast.forms[0]?.visibility).toBe('internal')
    })

    test('quoted value `visibility: "public"` reports parser error', () => {
      const source = `
form bad {
  label: "Bad"
  visibility: "public"
  schema: @json { {} }
}
`
      const { errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
      expect(
        errors.some(
          (e) =>
            e.message.includes('public') || e.message.includes('visibility'),
        ),
      ).toBe(true)
    })

    test('missing colon `visibility public` reports parser error', () => {
      const source = `
form bad {
  label: "Bad"
  visibility public
  schema: @json { {} }
}
`
      const { errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.some((e) => e.message.includes('visibility'))).toBe(true)
    })
  })

  describe('form auth', () => {
    test('parses `auth: name` reference', () => {
      const source = `
form gated {
  label: "Gated"
  visibility: public
  auth: portal
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const ref = ast.forms[0]?.authRef
      expect(ref).toBeDefined()
      expect(ref?.name).toBe('portal')
      expect(ref?.range.start.line).toBeGreaterThan(0)
    })

    test('absent auth leaves field undefined', () => {
      const source = `
form open {
  label: "Open"
  visibility: public
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms[0]?.authRef).toBeUndefined()
    })

    test('quoted auth value reports parser error', () => {
      const source = `
form bad {
  label: "Bad"
  auth: "portal"
  schema: @json { {} }
}
`
      const { ast, errors } = parse(source)
      expect(errors.some((e) => e.message.includes('auth block name'))).toBe(
        true,
      )
      expect(ast.forms[0]?.authRef).toBeUndefined()
    })

    test('legacy `basic_auth { ... }` block is no longer recognized', () => {
      const source = `
form bad {
  label: "Bad"
  basic_auth {
    user: portal.AUTH_USER
    password: portal.AUTH_PASS
  }
  schema: @json { {} }
}
`
      const { errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  describe('schedule parsing', () => {
    test('name, label, cron, timezone, enabled', () => {
      const source = `
schedule daily {
  label: "Daily"
  cron: "0 9 * * *"
  timezone: "America/New_York"
  enabled: true
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.schedules.length).toBe(1)
      const s = ast.schedules[0]!
      expect(s.name).toBe('daily')
      expect(s.label).toBe('Daily')
      expect(s.cron).toBe('0 9 * * *')
      expect(s.timezone).toBe('America/New_York')
      expect(s.enabled).toBe(true)
    })
  })

  describe('root and node schema', () => {
    test('root { } is parsed with name root and isRoot true', () => {
      const source = `
workflow g {
  label: "G"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }    outputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }    code: @ts {
      return context.nodes.root.input
    }  }
  flow { root -> b }
  node b {
    type: code
    label: "B"
    code: @ts {
      return {}
    }  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const rootNode = ast.workflows[0]?.nodes.find((n) => n.name === 'root')
      expect(rootNode).toBeDefined()
      expect(rootNode?.isRoot).toBe(true)
      expect(rootNode?.inputSchema).toBeDefined()
      expect(rootNode?.outputSchema).toBeDefined()
    })

    test('node with schema maps to outputSchema in AST', () => {
      const source = `
workflow g {
  label: "G"
  root {
    type: code
    code: @ts {
      return {}
    }  }
  node n {
    type: code
    label: "N"
    schema: @json {
      { "type": "object", "properties": { "y": { "type": "number" } } }
    }    code: @ts {
      return { y: 1 }
    }  }
  flow { root -> n }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const n = ast.workflows[0]?.nodes.find((node) => node.name === 'n')
      expect(n).toBeDefined()
      expect(n?.outputSchema).toBeDefined()
      expect((n?.outputSchema as Record<string, unknown>).properties).toEqual({
        y: { type: 'number' },
      })
    })

    test('node with inputSchema reports parse error', () => {
      const source = `
workflow g {
  label: "G"
  root {
    type: code
    code: @ts {
      return {}
    }  }
  node bad {
    type: code
    inputSchema: @json {
      {}
    }    code: @ts {
      return {}
    }  }
  flow { root -> bad }
}
`
      const { errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.some((e) => e.message.includes('inputSchema'))).toBe(true)
    })

    test('node with outputSchema reports parse error', () => {
      const source = `
workflow g {
  label: "G"
  root {
    type: code
    code: @ts {
      return {}
    }  }
  node bad {
    type: code
    outputSchema: @json {
      {}
    }    code: @ts {
      return {}
    }  }
  flow { root -> bad }
}
`
      const { errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
      expect(
        errors.some(
          (e) =>
            e.message.includes('schema') && e.message.includes('outputSchema'),
        ),
      ).toBe(true)
    })
  })

  describe('graph and node parsing', () => {
    test('graph with label, description, nodes, edges, flowRange', () => {
      const source = `
workflow g {
  label: "Graph"
  description: "Desc"
  node a {
    type: code
    label: "A"
    code: @ts {
      return {}
    }  }
  node b {
    type: code
    label: "B"
    code: @ts {
      return {}
    }  }
  flow {
    a -> b
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.workflows.length).toBe(1)
      const g = ast.workflows[0]!
      expect(g.name).toBe('g')
      expect(g.label).toBe('Graph')
      expect(g.description).toBe('Desc')
      expect(g.nodes.length).toBe(2)
      expect(g.edges.length).toBe(1)
      expect(g.edges[0]?.source).toBe('a')
      expect(g.edges[0]?.target).toBe('b')
      expect(g.flowRange).toBeDefined()
    })

    test('node with configFields: string, number, boolean, ts_block', () => {
      const source = `
workflow g {
  node n {
    type: code
    label: "N"
    code: @ts {
      return {}
    }  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const n = ast.workflows[0]!.nodes[0]!
      expect(n.type).toBe('code')
      const codeConfig = n.configFields.code
      expect(codeConfig?.kind).toBe('ts_block')
      expect(
        typeof (codeConfig?.kind === 'ts_block' ? codeConfig.code : undefined),
      ).toBe('string')
    })

    test('node with ts_file_ref', () => {
      const source = `
workflow g {
  node n {
    type: code
    label: "N"
    code: @ts "./x.ts.swirls"
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const n = ast.workflows[0]!.nodes[0]!
      const codeConfig = n.configFields.code
      expect(codeConfig?.kind).toBe('ts_file_ref')
      if (codeConfig?.kind === 'ts_file_ref') {
        expect(codeConfig.path).toBe('./x.ts.swirls')
      }
    })

    test('root and node secrets map (block → vars)', () => {
      const source = `
secret svc {
  vars: [MY_KEY, OPENROUTER_API_KEY]
}
secret pay {
  vars: [STRIPE_SECRET]
}
workflow g {
  root {
    type: http
    label: "Entry"
    secrets: {
      svc: [MY_KEY, OPENROUTER_API_KEY]
    }
    inputSchema: @json {
      { "type": "object", "properties": {} }
    }
    url: "https://example.com"
  }
  node n {
    type: code
    label: "N"
    secrets: {
      pay: [STRIPE_SECRET]
    }
    code: @ts {
      return {}
    }
  }
  flow {
    root -> n
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const g = ast.workflows[0]!
      const root = g.nodes.find((x) => x.isRoot)
      expect(root?.secretsMap).toEqual({
        svc: ['MY_KEY', 'OPENROUTER_API_KEY'],
      })
      const n = g.nodes.find((x) => x.name === 'n')
      expect(n?.secretsMap).toEqual({ pay: ['STRIPE_SECRET'] })
    })
  })

  describe('edge parsing', () => {
    test('simple arrow and labeled arrow', () => {
      const source = `
workflow g {
  node a {
    type: code
    label: "A"
    code: @ts {
      return {}
    }  }
  node b {
    type: code
    label: "B"
    code: @ts {
      return {}
    }  }
  node c {
    type: code
    label: "C"
    code: @ts {
      return {}
    }  }
  flow {
    a -> b
    b -["x"]-> c
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const edges = ast.workflows[0]!.edges
      expect(edges.length).toBe(2)
      expect(edges[0]?.label).toBeUndefined()
      expect(edges[1]?.label).toBe('x')
    })
  })

  describe('secrets and auth blocks', () => {
    test('parses secrets block and auth blocks', () => {
      const source = loadSource(FIXTURES_DIR, 'valid-auth.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.secrets.length).toBe(4)
      expect(ast.secrets.map((s) => s.name)).toEqual([
        'gh',
        'api_k',
        'basic_s',
        'tok',
      ])
      const ghSecret = ast.secrets.find((s) => s.name === 'gh')
      expect(ghSecret?.label).toBe('GitHub OAuth client')
      expect(ghSecret?.description).toBe(
        'Client credentials for the example integration',
      )
      expect(ast.auths.length).toBe(4)
      const oauth = ast.auths.find((a) => a.name === 'oauth_ex')
      expect(oauth?.label).toBe('Example OAuth')
      expect(oauth?.authType).toBe('oauth')
      expect(oauth?.secretsRef).toBe('gh')
      expect(oauth?.configFields.grant_type?.kind).toBe('string')
    })

    test('parses secret type: managed', () => {
      const source = `
secret llm_keys {
  type: managed
  vars: [OPENROUTER_API_KEY, RESEND_API_KEY]
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.secrets).toHaveLength(1)
      expect(ast.secrets[0]?.type).toBe('managed')
      expect(ast.secrets[0]?.vars).toEqual([
        'OPENROUTER_API_KEY',
        'RESEND_API_KEY',
      ])
    })

    test('errors on unknown secret type', () => {
      const source = `
secret llm_keys {
  type: bogus
  vars: [OPENROUTER_API_KEY]
}
`
      const { errors } = parse(source)
      expect(
        errors.some((e) => e.message.includes('Unknown secret type')),
      ).toBe(true)
    })

    test('node secrets map and http auth ref', () => {
      const source = `
secret sblock {
  vars: [K1]
}
auth a1 {
  type: bearer
  secrets: sblock
  token: K1
}
workflow g {
  label: "G"
  root {
    type: code
    label: "R"
    secrets: {
      sblock: [K1]
    }
    code: @ts { return {} }
  }
  node h {
    type: http
    label: "H"
    auth: a1
    url: @ts { return "https://x" }
  }
  flow { root -> h }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const root = ast.workflows[0]?.nodes.find((n) => n.isRoot)
      expect(root?.secretsMap).toEqual({ sblock: ['K1'] })
      const h = ast.workflows[0]?.nodes.find((n) => n.name === 'h')
      expect(h?.configFields.auth?.kind).toBe('string')
      expect((h?.configFields.auth as { value: string }).value).toBe('a1')
    })
  })

  describe('trigger parsing', () => {
    test('form, webhook, schedule bindings and enabled', () => {
      const source = `
form f {
  label: "F"
  enabled: true
  schema: @json {
    {}
  }}
webhook w {
  label: "W"
  enabled: true
  schema: @json {
    {}
  }}
schedule s { label: "S" cron: "0 0 * * *" }
workflow g {
  label: "G"
  node n {
    type: code
    label: "N"
    code: @ts {
      return {}
    }  }
  node n2 {
    type: code
    label: "N2"
    code: @ts {
      return {}
    }  }
  flow { n -> n2 }
}
trigger t1 { form:f -> g enabled: true }
trigger t2 { webhook:w -> g }
trigger t3 { schedule:s -> g }
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.triggers.length).toBe(3)
      expect(ast.triggers[0]?.resourceType).toBe('form')
      expect(ast.triggers[0]?.resourceName).toBe('f')
      expect(ast.triggers[1]?.resourceType).toBe('webhook')
      expect(ast.triggers[2]?.resourceType).toBe('schedule')
    })
  })

  describe('doc comments', () => {
    test('block comment before declaration is attached as docComment', () => {
      const source = `
/* Doc for form */
form x {
  label: "X"
  enabled: true
  schema: @json {
    {}
  }}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.forms[0]?.docComment?.trim()).toBe('Doc for form')
    })
  })

  describe('version', () => {
    test('version: 1 is parsed', () => {
      const source = `version: 1
form f {
  label: "F"
  enabled: true
  schema: @json {
    {}
  }}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.version).toBe(1)
    })
  })

  describe('error recovery', () => {
    test('invalid-syntax.swirls reports errors and may produce partial AST', () => {
      const source = loadSource(FIXTURES_DIR, 'invalid-syntax.swirls')
      const { ast, errors } = parse(source)
      expect(errors.length).toBeGreaterThan(0)
      errors.forEach((e) => {
        expect(e.message).toBeDefined()
        expect(e.range.start.line).toBeGreaterThanOrEqual(1)
      })
      expect(ast.forms.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('app primitive (RFC 0022)', () => {
    test('legacy RFC 0015 colon-free app body is not accepted as a valid app', () => {
      const source = `
app client_portal {
  description "Support portal for Acme's customers."

  expose: {
    agent    triage
  }

  brand {
    accent "#B33A2B"
  }
}
`
      const { ast, errors } = parse(source)
      // New grammar requires `key: value`; colon-free body yields parse errors
      // and does not produce a well-formed AppDecl with pages.
      expect(errors.length).toBeGreaterThan(0)
      const app = ast.apps[0]
      if (app) {
        expect(app.pages.length).toBe(0)
      }
    })

    test('a Phase 0 app block parses alongside a later channel', () => {
      const source = `
app support_center {
  label: "Support"
  page home {
    render: @openui {
      Stack {}
    }
  }
}

channel support {
  platform: swirls
  agent: triage
}
`
      const { ast, errors } = parse(source)
      expect(errors).toEqual([])
      expect(ast.apps.map((a) => a.name)).toEqual(['support_center'])
      expect(ast.channels.map((c) => c.name)).toEqual(['support'])
    })
  })

  describe('named schema declarations and references', () => {
    test('parses top-level schema block and schema: ref on form and node', () => {
      const source = `
version: 1

schema contact_payload {
  label: "Contact"
  schema: @json {
    { "type": "object", "properties": { "email": { "type": "string" } } }
  }
}

form f {
  label: "F"
  schema: contact_payload
}

workflow g {
  label: "G"
  root {
    type: code
    label: "R"
    inputSchema: contact_payload
    outputSchema: contact_payload
    code: @ts { return {} }
  }
  node n {
    type: code
    label: "N"
    schema: contact_payload
    code: @ts { return {} }
  }
  flow {
    root -> n
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.schemas.length).toBe(1)
      expect(ast.schemas[0]?.name).toBe('contact_payload')
      expect(ast.forms[0]?.schemaRef).toBe('contact_payload')
      const root = ast.workflows[0]?.nodes.find((n) => n.isRoot)
      expect(root?.inputSchemaRef).toBe('contact_payload')
      expect(root?.outputSchemaRef).toBe('contact_payload')
      const n = ast.workflows[0]?.nodes.find((x) => x.name === 'n')
      expect(n?.outputSchemaRef).toBe('contact_payload')
    })

    test('parses review schema: name as schemaRef', () => {
      const source = `
schema rschema {
  label: "R"
  schema: @json {
    { "type": "object", "properties": { "ok": { "type": "boolean" } } }
  }
}

workflow g {
  label: "G"
  root {
    type: code
    label: "R"
    code: @ts { return {} }
    review: {
      enabled: true
      schema: rschema
    }
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const root = ast.workflows[0]?.nodes.find((n) => n.isRoot)
      const rc = root?.reviewConfig as Record<string, unknown> | undefined
      expect(rc?.schemaRef).toBe('rschema')
    })
  })

  describe('round-trip invariants', () => {
    const exampleFiles = [
      'minimal.swirls',
      'contact-form-workflow.swirls',
      'switch-routing.swirls',
      'ai-tasks.swirls',
    ]

    for (const file of exampleFiles) {
      test(`${file} parsed AST has consistent structure`, () => {
        const source = loadSource(EXAMPLES_DIR, file)
        const { ast, errors } = parse(source)
        expect(errors.length).toBe(0)
        for (const g of ast.workflows) {
          const nodeNames = new Set(g.nodes.map((n) => n.name))
          for (const e of g.edges) {
            expect(nodeNames.has(e.source)).toBe(true)
            expect(nodeNames.has(e.target)).toBe(true)
          }
          if (g.edges.length > 0) {
            expect(g.flowRange).toBeDefined()
          }
        }
        for (const t of ast.triggers) {
          const graphExists = ast.workflows.some(
            (gr) => gr.name === t.workflowName,
          )
          expect(graphExists).toBe(true)
        }
      })
    }
  })

  describe('webhook authentication fields', () => {
    test('parses secret: block.VAR and header: "Name"', () => {
      const source = `
secret my_secret {
  vars: [STRIPE]
}

webhook stripe_hook {
  label: "Stripe"
  secret: my_secret.STRIPE
  header: "Stripe-Security"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.webhooks.length).toBe(1)
      const w = ast.webhooks[0]!
      expect(w.secretRef).toEqual({
        blockName: 'my_secret',
        varName: 'STRIPE',
        range: expect.any(Object),
      })
      expect(w.header?.value).toBe('Stripe-Security')
    })

    test('neither secret nor header leaves fields undefined', () => {
      const source = `
webhook anon {
  label: "Anon"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.webhooks[0]?.secretRef).toBeUndefined()
      expect(ast.webhooks[0]?.header).toBeUndefined()
    })
  })
})

describe('top-level keyword list', () => {
  test.each(['skill', 'action', 'query'])(
    'recovery after a parse error stops at a following %s block',
    (kind) => {
      const next =
        kind === 'skill'
          ? 'skill s { name: "s" }'
          : kind === 'action'
            ? 'action a { provider: acme }'
            : 'query q { }'
      const { ast } = parse(`form broken { label: }\n${next}\nform after { label: "After" }\n`)
      expect(ast.forms.map((f) => f.name)).toContain('after')
      const parsed =
        kind === 'skill'
          ? [ast.skill].flat().filter(Boolean).length
          : kind === 'action'
            ? (ast.actions ?? []).length
            : (ast.queries ?? []).length
      expect(parsed).toBe(1)
    },
  )
})
