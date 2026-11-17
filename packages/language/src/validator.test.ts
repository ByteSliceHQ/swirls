import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Diagnostic, FormVisibility } from './ast'
import { parse } from './parser'
import { validateTsFileRefs } from './validate-ts-file-refs'
import { validate } from './validator'
import {
  buildWorkspaceResourceIndex,
  workspaceIndexFromStreamNames,
} from './workspace/workspace-resources'

const EXAMPLES_DIR = path.join(import.meta.dir, '../examples')
const FIXTURES_DIR = path.join(import.meta.dir, '__fixtures__')

function loadAndParse(dir: string, file: string): ReturnType<typeof parse> {
  const p = path.join(dir, file)
  const source = fs.readFileSync(p, 'utf8')
  return parse(source)
}

function hasDiagnostic(diags: Diagnostic[], messageSubstring: string): boolean {
  return diags.some((d) => d.message.includes(messageSubstring))
}

describe('validate', () => {
  test('validates workflow and fanout concurrency', () => {
    const valid = parse(`
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
  concurrency: 16
  root {
    type: code
    code: @ts { return { items: [] } }
  }
  node workers {
    type: fanout
    items: @ts { return context.nodes.root.output.items }
    maxItems: 20
    concurrency: 8
    workflow: child
  }
  flow { root -> workers }
}`)
    expect(valid.errors).toEqual([])
    expect(validate(valid.ast)).toEqual([])

    const invalid = parse(`
workflow bad {
  label: "Bad"
  concurrency: 65
  root {
    type: code
    code: @ts { return [] }
  }
  node old_map {
    type: map
    items: @ts { return [] }
    maxItems: 1
    concurrency: 2
    workflow: bad
  }
  node bad_fanout {
    type: fanout
    items: @ts { return [] }
    maxItems: 1.5
    concurrency: 0
    workflow: bad
  }
  flow {
    root -> old_map
    root -> bad_fanout
  }
}`)
    const diagnostics = validate(invalid.ast)
    expect(
      hasDiagnostic(
        diagnostics,
        'Workflow concurrency must be an integer between 1 and 64',
      ),
    ).toBe(true)
    expect(
      hasDiagnostic(
        diagnostics,
        'map node concurrency is not supported; use type: fanout',
      ),
    ).toBe(true)
    expect(
      hasDiagnostic(
        diagnostics,
        'fanout node requires maxItems as a positive integer',
      ),
    ).toBe(true)
    expect(
      hasDiagnostic(
        diagnostics,
        'fanout node requires concurrency as an integer between 1 and 64',
      ),
    ).toBe(true)
  })

  test('validates workflow execution token TTL', () => {
    const valid = parse(`
workflow long_running {
  label: "Long running"
  executionTokenTtl: "3h"
  root {
    type: code
    code: @ts { return {} }
  }
}`)
    expect(valid.errors).toEqual([])
    expect(validate(valid.ast)).toEqual([])

    const tooShort = parse(`
workflow too_short {
  label: "Too short"
  executionTokenTtl: "4m"
  root {
    type: code
    code: @ts { return {} }
  }
}`)
    expect(
      hasDiagnostic(
        validate(tooShort.ast),
        'Workflow executionTokenTtl must be between 5m and 24h',
      ),
    ).toBe(true)

    const malformed = parse(`
workflow malformed {
  label: "Malformed"
  executionTokenTtl: "2.5h"
  root {
    type: code
    code: @ts { return {} }
  }
}`)
    expect(
      hasDiagnostic(
        validate(malformed.ast),
        'Workflow executionTokenTtl must be a quoted duration',
      ),
    ).toBe(true)
  })

  describe('valid files produce zero diagnostics', () => {
    const validFiles = [
      'minimal.swirls',
      'contact-form-workflow.swirls',
      'webhook-and-schedule.swirls',
      'review-workflow.swirls',
      'ai-tasks.swirls',
      'switch-routing.swirls',
      'subgraph-workflow.swirls',
      'standalone-ts-ref.swirls',
      'parallel-findall.swirls',
      'search-web.swirls',
      'search-telem.swirls',
      'deep-research-concurrent.swirls',
      'postgres.swirls',
      'loop-batch-pipeline.swirls',
      'agent.swirls',
    ]

    for (const file of validFiles) {
      test(`${file}`, () => {
        const { ast, errors } = loadAndParse(EXAMPLES_DIR, file)
        expect(errors.length).toBe(0)
        const diags = validate(ast)
        const errorDiags = diags.filter((d) => d.severity !== 'warning')
        expect(errorDiags).toEqual([])
      })
    }
  })

  describe('valid fixture valid-full.swirls', () => {
    test('produces zero error diagnostics', () => {
      const { ast, errors } = loadAndParse(FIXTURES_DIR, 'valid-full.swirls')
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      const errorDiags = diags.filter((d) => d.severity !== 'warning')
      expect(errorDiags).toEqual([])
    })
  })

  describe('valid fixture valid-integration.swirls', () => {
    test('produces zero diagnostics', () => {
      const { ast, errors } = loadAndParse(
        FIXTURES_DIR,
        'valid-integration.swirls',
      )
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(diags).toEqual([])
    })
  })

  describe('valid fixture valid-auth.swirls', () => {
    test('produces zero diagnostics', () => {
      const { ast, errors } = loadAndParse(FIXTURES_DIR, 'valid-auth.swirls')
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(diags).toEqual([])
    })
  })

  describe('invalid-semantics.swirls produces expected diagnostics', () => {
    test('duplicate form name', () => {
      const { ast, errors } = loadAndParse(
        FIXTURES_DIR,
        'invalid-semantics.swirls',
      )
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Duplicate form name')).toBe(true)
    })

    test('missing required field (code for code node)', () => {
      const { ast } = loadAndParse(FIXTURES_DIR, 'invalid-semantics.swirls')
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "code"')).toBe(true)
    })

    test('invalid node type', () => {
      const { ast } = loadAndParse(FIXTURES_DIR, 'invalid-semantics.swirls')
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Invalid node type')).toBe(true)
    })

    test('cycle in graph', () => {
      const { ast } = loadAndParse(FIXTURES_DIR, 'invalid-semantics.swirls')
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'cycle')).toBe(true)
    })

    test('topological root must be root { } block', () => {
      const source = `
workflow g {
  label: "No root block"
  node x {
    type: code
    label: "X"
    code: @ts { return {} }
  }
  node y {
    type: code
    label: "Y"
    code: @ts { return {} }
  }
  flow { x -> y }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'root { } as the entry node')).toBe(true)
      expect(hasDiagnostic(diags, '"x" instead')).toBe(true)
    })

    test('multiple roots', () => {
      const { ast } = loadAndParse(FIXTURES_DIR, 'invalid-semantics.swirls')
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'exactly one root')).toBe(true)
    })

    test('trigger references non-existent form', () => {
      const { ast } = loadAndParse(FIXTURES_DIR, 'invalid-semantics.swirls')
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'references form')).toBe(true)
      expect(hasDiagnostic(diags, 'which is not defined')).toBe(true)
    })

    test('trigger references non-existent graph', () => {
      const { ast } = loadAndParse(FIXTURES_DIR, 'invalid-semantics.swirls')
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'references workflow')).toBe(true)
    })

    // inputSchema in node blocks is now a parse error, not a validation error
  })

  describe('secret keys on nodes', () => {
    test('duplicate var name across two secret blocks is allowed', () => {
      const source = `
secret block_a {
  vars: [SHARED_KEY]
}
secret block_b {
  vars: [SHARED_KEY]
}
workflow g {
  root {
    type: code
    label: "R"
    secrets: {
      block_a: [SHARED_KEY]
    }
    code: @ts { return {} }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(diags).toEqual([])
    })

    test('managed secret block accepts known platform keys', () => {
      const source = `
secret llm {
  type: managed
  vars: [OPENROUTER_API_KEY]
}
workflow g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      expect(ast.secrets[0]?.type).toBe('managed')
      const diags = validate(ast)
      expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    })

    test('managed secret block rejects unknown vars', () => {
      const source = `
secret llm {
  type: managed
  vars: [MY_CUSTOM_KEY]
}
workflow g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'is not a manageable platform key')).toBe(
        true,
      )
    })

    test('warns when ai node needs undeclared vendor key', () => {
      const source = `
workflow g {
  root {
    type: ai
    kind: text
    label: "R"
    prompt: "hi"
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        diags.some(
          (d) =>
            d.severity === 'warning' &&
            d.message.includes('OPENROUTER_API_KEY') &&
            d.message.includes('no secret block declares'),
        ),
      ).toBe(true)
    })

    test('duplicate var in same secret block produces diagnostic', () => {
      const source = `
secret dup {
  vars: [X, X]
}
workflow g {
  root {
    type: code
    label: "R"
    secrets: { dup: [X] }
    code: @ts { return {} }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'Duplicate var "X" in secret block "dup"'),
      ).toBe(true)
    })

    test('invalid secret var characters produce diagnostic', () => {
      const source = `
secret blk {
  vars: [X]
}
workflow g {
  root {
    type: code
    label: "R"
    secrets: {
      blk: ["bad/key"]
    }
    code: @ts {
      return {}
    }
  }
  flow {
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Invalid secret var')).toBe(true)
    })
  })

  describe('parallel node', () => {
    test('rejects operation other than search, extract, or findall', () => {
      const source = `
workflow g {
  root {
    type: parallel
    label: "Bad op"
    operation: invalid_op
    objective: @ts { return "x" }
    searchQueries: @ts { return ["a"] }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(
          diags,
          'Parallel "operation" must be "search", "extract", or "findall"',
        ),
      ).toBe(true)
    })

    test('findall requires entityType, generator, matchConditions, matchLimit', () => {
      const source = `
workflow g {
  root {
    type: parallel
    label: "FindAll"
    operation: findall
    objective: @ts { return "x" }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'Parallel findall requires "entityType"'),
      ).toBe(true)
      expect(
        hasDiagnostic(diags, 'Parallel findall requires "generator"'),
      ).toBe(true)
      expect(
        hasDiagnostic(diags, 'Parallel findall requires "matchConditions"'),
      ).toBe(true)
      expect(
        hasDiagnostic(diags, 'Parallel findall requires "matchLimit"'),
      ).toBe(true)
    })

    test('rejects user output schema (vendor-managed)', () => {
      const source = `
workflow g {
  node p {
    type: parallel
    operation: search
    objective: @ts { return "x" }
    searchQueries: @ts { return ["a"] }
    schema: @json { { "type": "object" } }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'vendor-managed output schema; remove "schema"'),
      ).toBe(true)
    })
  })

  describe('search node', () => {
    function searchDiagnostics(
      fields: string,
      secrets = 'secret web { vars: [TELEM_API_KEY] }',
    ) {
      const parsed = parse(`${secrets}
workflow g {
  root {
    type: search
    label: "Search"
    query: "hello"
    ${fields}
  }
}`)
      expect(parsed.errors).toEqual([])
      return validate(parsed.ast)
    }

    test('accepts Telem with inferred user and managed credentials', () => {
      expect(searchDiagnostics('provider: telem\nsources: ["web"]')).toEqual([])
      expect(
        searchDiagnostics(
          'provider: telem',
          'secret web { type: managed vars: [TELEM_API_KEY] }',
        ),
      ).toEqual([])
    })

    test('infers the credential from the provider, not available secret declarations', () => {
      expect(
        hasDiagnostic(
          searchDiagnostics(
            'provider: telem',
            'secret web { vars: [FIRECRAWL_API_KEY] }',
          ),
          'requires vendor key "TELEM_API_KEY"',
        ),
      ).toBe(true)
      expect(
        hasDiagnostic(
          searchDiagnostics(''),
          'requires vendor key "FIRECRAWL_API_KEY"',
        ),
      ).toBe(true)
      expect(
        searchDiagnostics(
          'provider: firecrawl\nsources: ["news"]\ntbs: "qdr:m"',
          'secret web { vars: [FIRECRAWL_API_KEY] }',
        ),
      ).toEqual([])
    })

    test.each([
      'other',
      '42',
      '@ts { return "telem" }',
    ])('rejects invalid provider %s', (provider) => {
      expect(
        hasDiagnostic(
          searchDiagnostics(`provider: ${provider}`),
          '"provider" must be firecrawl or telem',
        ),
      ).toBe(true)
    })

    test.each([
      'categories: []',
      'location: "US"',
      'country: "US"',
      'tbs: "qdr:m"',
      'includeDomains: []',
      'excludeDomains: []',
      'scrapeFormats: []',
    ])('rejects unsupported Telem option %s', (field) => {
      expect(
        hasDiagnostic(
          searchDiagnostics(`provider: telem\n${field}`),
          'is not supported by Telem yet; use provider: firecrawl',
        ),
      ).toBe(true)
    })

    test.each([
      '[]',
      '["news"]',
      '["images"]',
      '["web", "news"]',
      '["web", "web"]',
    ])('rejects Telem sources %s', (sources) => {
      expect(
        hasDiagnostic(
          searchDiagnostics(`provider: telem\nsources: ${sources}`),
          'Telem search only supports sources: ["web"]',
        ),
      ).toBe(true)
    })

    test('requires query', () => {
      const source = `
workflow g {
  node find {
    type: search
    limit: 5
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "query"')).toBe(true)
    })

    test('rejects invalid sources', () => {
      const source = `
workflow g {
  node find {
    type: search
    query: @ts { return "hello" }
    sources: ["web", "videos"]
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Invalid search source "videos"')).toBe(true)
    })

    test('rejects invalid categories', () => {
      const source = `
workflow g {
  node find {
    type: search
    query: @ts { return "hello" }
    categories: ["blog"]
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Invalid search category "blog"')).toBe(true)
    })

    test('happy path with filters', () => {
      const source = `
workflow g {
  root {
    type: search
    query: @ts { return "hello" }
    limit: 10
    sources: ["web", "news"]
    categories: ["research"]
    includeDomains: ["example.com"]
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      const errorDiags = diags.filter((d) => d.severity !== 'warning')
      expect(errorDiags).toEqual([])
    })
  })

  describe('vendor-managed output schema', () => {
    test('scrape: rejects schema', () => {
      const source = `
workflow g {
  node f {
    type: scrape
    url: @ts { return "https://example.com" }
    schema: @json { { "type": "object" } }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'vendor-managed output schema; remove "schema"'),
      ).toBe(true)
    })

    test('search: rejects schema', () => {
      const source = `
workflow g {
  node find {
    type: search
    query: @ts { return "hello" }
    schema: @json { { "type": "object" } }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'vendor-managed output schema; remove "schema"'),
      ).toBe(true)
    })

    test('email: rejects schema', () => {
      const source = `
workflow g {
  node r {
    type: email
    from: @ts { return "a@b.com" }
    to: @ts { return "c@d.com" }
    subject: @ts { return "s" }
    schema: @json { { "type": "object" } }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'vendor-managed output schema; remove "schema"'),
      ).toBe(true)
    })

    test('disk: rejects schema on node', () => {
      const source = `
disk proj {}
workflow g {
  node ls {
    type: disk
    disk: proj
    command: "ls"
    schema: @json { { "type": "string" } }
  }
  flow {}
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'vendor-managed output schema; remove "schema"'),
      ).toBe(true)
    })

    test('disk: rejects outputSchema on root', () => {
      const source = `
disk proj {}
workflow g {
  root {
    type: disk
    disk: proj
    command: "ls"
    outputSchema: @json { { "type": "string" } }
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'vendor-managed output schema; remove "schema"'),
      ).toBe(true)
    })

    test('disk: exec without operation field is valid', () => {
      const source = `
disk proj {}
workflow g {
  root {
    type: disk
    disk: proj
    command: "ls -la"
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "operation"')).toBe(false)
      expect(diags.filter((d) => d.severity === 'error')).toHaveLength(0)
    })

    test('disk: exec accepts command @ts block', () => {
      const source = `
disk proj {}
workflow g {
  root {
    type: code
    code: @ts { return {} }
  }
  node mkdir {
    type: disk
    disk: proj
    command: @ts {
      return "mkdir -p companies/" + context.nodes.root.output.id
    }
  }
  flow { root -> mkdir }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires a "command" field')).toBe(false)
      expect(diags.filter((d) => d.severity === 'error')).toHaveLength(0)
    })

    test('disk: copy_file accepts path and file @ts blocks', () => {
      const source = `
disk proj {}
workflow g {
  root {
    type: code
    code: @ts { return { path: "a.pdf", file: {} } }
  }
  node copy {
    type: disk
    disk: proj
    operation: copy_file
    path: @ts { return context.nodes.root.output.path }
    file: @ts { return context.nodes.root.output.file }
  }
  flow { root -> copy }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'copy_file')).toBe(false)
      expect(diags.filter((d) => d.severity === 'error')).toHaveLength(0)
    })
  })

  describe('resource name validation', () => {
    test('invalid character in form name produces diagnostic', () => {
      const r = (
        line: number,
        col: number,
      ): {
        start: { line: number; column: number; offset: number }
        end: { line: number; column: number; offset: number }
      } => ({
        start: { line, column: col, offset: 0 },
        end: { line, column: col + 1, offset: 1 },
      })
      const internal: FormVisibility = 'internal'
      const ast = {
        schemas: [],
        forms: [
          {
            name: 'bad-name',
            label: 'Bad',
            // Required at the AST layer post the visibility feature; secure
            // default keeps fixtures aligned with parser behavior.
            visibility: internal,
            range: r(1, 1),
          },
        ],
        webhooks: [],
        schedules: [],
        workflows: [],
        streams: [],
        views: [],
        triggers: [],
        secrets: [],
        auths: [],
        postgres: [],
        databases: [],
        migrations: [],
        disk: [],
        computer: [],
        operations: [],
        skill: [],
        agent: [],
        mcp: [],
        channels: [],
        queries: [],
        connections: [],
        connector: [],
        actions: [],
        roles: [],
        policies: [],
        apps: [],
        mocks: [],
        playbooks: [],
      }
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'Form name') ||
          hasDiagnostic(diags, 'letters, numbers') ||
          hasDiagnostic(diags, 'Name must'),
      ).toBe(true)
    })
  })

  describe('named schema references', () => {
    test('form schema: missing_name produces diagnostic', () => {
      const source = `
form f {
  label: "F"
  schema: does_not_exist
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'undefined schema')).toBe(true)
    })

    test('duplicate schema block names produce diagnostic', () => {
      const source = `
schema a {
  label: "A"
  schema: @json { { "type": "object" } }
}
schema a {
  label: "A2"
  schema: @json { { "type": "object" } }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Duplicate schema name')).toBe(true)
    })
  })

  describe('DAG validation', () => {
    test('edge to non-existent node', () => {
      const source = `
workflow g {
  label: "G"
  node a {
    type: code
    label: "A"
    code: @ts {
      return {}
    }  }
  flow {
    a -> missing
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'non-existent')).toBe(true)
    })

    test('self-loop edge', () => {
      const source = `
workflow g {
  label: "G"
  node a {
    type: code
    label: "A"
    code: @ts {
      return {}
    }  }
  flow {
    a -> a
  }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'cannot connect a node to itself')).toBe(true)
    })
  })

  describe('workflow node requires workflow', () => {
    test('workflow node without workflow config produces diagnostic', () => {
      const source = `
workflow g {
  label: "G"
  node sub {
    type: workflow
    label: "Subgraph"
  }
  flow { }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Workflow node requires "workflow"')).toBe(
        true,
      )
    })

    test('graph node without input produces diagnostic', () => {
      const { ast, errors } = loadAndParse(
        EXAMPLES_DIR,
        'subgraph-workflow.swirls',
      )
      expect(errors.length).toBe(0)
      const mainGraph = ast.workflows.find((g) => g.name === 'main_graph')
      const runHelper = mainGraph?.nodes.find((n) => n.name === 'run_helper')
      expect(runHelper?.type).toBe('workflow')
      expect(runHelper?.configFields.input).toBeDefined()
      delete runHelper?.configFields.input
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "input"')).toBe(true)
    })

    test('graph node referencing non-existent graph produces diagnostic', () => {
      const source = `
workflow g {
  label: "G"
  node sub {
    type: workflow
    label: "Subgraph"
    workflow: nonexistent_graph
    input: @ts { return {} }
  }
  flow { }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(
          diags,
          'Workflow node references workflow "nonexistent_graph" which is not defined',
        ),
      ).toBe(true)
    })
  })

  describe('stream node (read side)', () => {
    test('stream node with stream + filter is valid when stream block exists', () => {
      const source = `
stream s1 {
  enabled: true
  label: "S"
  workflow: g1
  version: v1
  versions: {
    v1 {
      schema: @json {
        { "type": "object", "properties": { "x": { "type": "number" } } }
      }
      condition: @ts { return true }
      prepare: @ts { return context.output }
    }
  }
}

workflow g1 {
  label: "G1"
  root {
    type: code
    code: @ts { return 1 }
  }
}

workflow g2 {
  label: "G2"
  root {
    type: code
    code: @ts { return {} }
  }
  node q {
    type: stream
    label: "Q"
    stream: s1
    version: v1
    filter: @ts {
      return { x: { eq: 1 } }
    }
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      const errs = diags.filter((d) => d.severity !== 'warning')
      expect(errs.length).toBe(0)
    })

    test('stream node missing stream', () => {
      const source = `
stream s1 {
  enabled: true
  label: "S"
  workflow: g1
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

workflow g1 {
  label: "G1"
  root {
    type: code
    code: @ts { return 1 }
  }
}

workflow g2 {
  label: "G2"
  root {
    type: code
    code: @ts { return {} }
  }
  node q {
    type: stream
    label: "Q"
    filter: @ts {
      return {}
    }
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "stream"')).toBe(true)
    })

    test('stream node missing filter', () => {
      const source = `
stream s1 {
  enabled: true
  label: "S"
  workflow: g1
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

workflow g1 {
  label: "G1"
  root {
    type: code
    code: @ts { return 1 }
  }
}

workflow g2 {
  label: "G2"
  root {
    type: code
    code: @ts { return {} }
  }
  node q {
    type: stream
    label: "Q"
    stream: s1
    version: v1
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "filter"')).toBe(true)
    })

    test('stream node missing version', () => {
      const source = `
stream s1 {
  enabled: true
  label: "S"
  workflow: g1
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return {} }
    }
  }
}

workflow g1 {
  label: "G1"
  root { type: code code: @ts { return 1 } }
}

workflow g2 {
  label: "G2"
  root { type: code code: @ts { return {} } }
  node q {
    type: stream
    stream: s1
    filter: @ts { return {} }
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'requires "version"')).toBe(true)
    })

    test('stream node rejects unknown pinned version when stream is local', () => {
      const source = `
stream s1 {
  enabled: true
  label: "S"
  workflow: g1
  version: v1
  versions: {
    v1 {
      schema: @json {
        { "type": "object" }
      }
      prepare: @ts { return {} }
    }
  }
}

workflow g1 {
  label: "G1"
  root {
    type: code
    code: @ts { return 1 }
  }
}

workflow g2 {
  label: "G2"
  root {
    type: code
    code: @ts { return {} }
  }
  node q {
    type: stream
    label: "Q"
    stream: s1
    version: v2
    filter: @ts { return {} }
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'does not declare that version under versions'),
      ).toBe(true)
    })

    test('stream node with streamId is rejected', () => {
      const source = `
stream s1 {
  enabled: true
  label: "S"
  workflow: g1
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

workflow g1 {
  label: "G1"
  root {
    type: code
    code: @ts { return 1 }
  }
}

workflow g2 {
  label: "G2"
  root {
    type: code
    code: @ts { return {} }
  }
  node q {
    type: stream
    label: "Q"
    stream: s1
    version: v1
    streamId: "x"
    filter: @ts { return {} }
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'streamId is no longer supported')).toBe(true)
    })

    test('stream node referencing undefined stream block', () => {
      const source = `
workflow g2 {
  label: "G2"
  root {
    type: code
    code: @ts { return {} }
  }
  node q {
    type: stream
    label: "Q"
    stream: missing_stream
    version: v1
    filter: @ts { return {} }
  }
  flow { root -> q }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(
          diags,
          'references stream block "missing_stream" which is not defined',
        ),
      ).toBe(true)
    })
  })

  describe('AI kind validation', () => {
    test('invalid ai kind produces diagnostic', () => {
      const source = `
workflow g {
  label: "G"
  node ai {
    type: ai
    label: "AI"
    kind: invalid_kind
    model: "x"
    prompt: @ts {
      return "x"
    }  }
  flow { }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Invalid ai kind')).toBe(true)
    })

    test('invalid ai provider produces diagnostic', () => {
      const source = `
workflow g {
  label: "G"
  node ai {
    type: ai
    label: "AI"
    kind: text
    provider: bedrock
    model: "x"
    prompt: @ts {
      return "x"
    }  }
  flow { }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'Invalid ai provider')).toBe(true)
    })

    test('ai kind text with schema produces warning', () => {
      const source = `
workflow g {
  label: "G"
  node ai {
    type: ai
    label: "AI"
    kind: text
    schema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }
    prompt: @ts {
      return "x"
    }
  }
  flow { }
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      const w = diags.find((d) =>
        d.message.includes('kind "text" produces a plain string'),
      )
      expect(w).toBeDefined()
      expect(w?.severity).toBe('warning')
    })
  })

  describe('webhook authentication', () => {
    const reservedHeaders = [
      'Cookie',
      'Host',
      'Content-Length',
      'X-Forwarded-For',
      'User-Agent',
      'Content-Type',
      'Connection',
      'Transfer-Encoding',
    ]

    for (const name of reservedHeaders) {
      test(`reserved header "${name}" is rejected`, () => {
        const source = `
secret sec {
  vars: [KEY]
}

webhook wh {
  label: "W"
  secret: sec.KEY
  header: "${name}"
}
`
        const { ast, errors } = parse(source)
        expect(errors.length).toBe(0)
        const diags = validate(ast)
        expect(hasDiagnostic(diags, 'is reserved and cannot be used')).toBe(
          true,
        )
      })
    }

    test('reserved header comparison is case-insensitive', () => {
      const source = `
secret sec {
  vars: [KEY]
}
webhook wh {
  label: "W"
  secret: sec.KEY
  header: "CoOkIe"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'is reserved and cannot be used')).toBe(true)
    })

    test('Authorization header is explicitly allowed', () => {
      const source = `
secret sec {
  vars: [KEY]
}
webhook wh {
  label: "W"
  secret: sec.KEY
  header: "Authorization"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      const errorDiags = diags.filter((d) => d.severity !== 'warning')
      expect(errorDiags).toEqual([])
    })

    test('dangling secret block is rejected', () => {
      const source = `
webhook wh {
  label: "W"
  secret: missing_block.KEY
  header: "X-Sig"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(
          diags,
          'references undefined secret block "missing_block"',
        ),
      ).toBe(true)
    })

    test('var not in secret block is rejected', () => {
      const source = `
secret sec {
  vars: [ACTUAL_VAR]
}
webhook wh {
  label: "W"
  secret: sec.MISSING_VAR
  header: "X-Sig"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(
        hasDiagnostic(diags, 'references var "MISSING_VAR" not declared'),
      ).toBe(true)
    })

    test('secret without header is rejected (both-or-neither)', () => {
      const source = `
secret sec {
  vars: [KEY]
}
webhook wh {
  label: "W"
  secret: sec.KEY
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'is missing "header"')).toBe(true)
    })

    test('header without secret is rejected (both-or-neither)', () => {
      const source = `
webhook wh {
  label: "W"
  header: "X-Sig"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(hasDiagnostic(diags, 'is missing "secret"')).toBe(true)
    })

    test('neither set emits a warning, not an error', () => {
      const source = `
webhook wh {
  label: "W"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      const w = diags.find((d) =>
        d.message.includes('will accept any POST without verification'),
      )
      expect(w).toBeDefined()
      expect(w?.severity).toBe('warning')
      const errorDiags = diags.filter((d) => d.severity !== 'warning')
      expect(errorDiags).toEqual([])
    })

    test('both set and valid produces no diagnostics', () => {
      const source = `
secret sec {
  vars: [STRIPE]
}
webhook wh {
  label: "W"
  secret: sec.STRIPE
  header: "Stripe-Security"
}
`
      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      const diags = validate(ast)
      expect(diags).toEqual([])
    })
  })
})

describe('workspace-scoped stream node validation', () => {
  const consumerOnlySource = `
version: 1
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node pull {
    type: stream
    label: "Pull"
    stream: remote_stream
    version: v1
    filter: @ts { return {} }
  }
  flow { root -> pull }
}
`

  test('stream node errors when stream block is not in file and no workspace set', () => {
    const { ast, errors } = parse(consumerOnlySource)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'Stream node references stream block "remote_stream"',
      ),
    ).toBe(true)
  })

  test('stream node accepts cross-file stream name when workspace index includes streams', () => {
    const { ast, errors } = parse(consumerOnlySource)
    expect(errors.length).toBe(0)
    const diags = validate(ast, {
      workspace: workspaceIndexFromStreamNames(new Set(['remote_stream'])),
    })
    expect(
      hasDiagnostic(
        diags,
        'Stream node references stream block "remote_stream"',
      ),
    ).toBe(false)
  })
})

describe('workspace-scoped cross-file references', () => {
  test('graph node, stream graph binding, trigger, schema, http auth, secrets map, postgres', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-val-ws-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'consumer.swirls'),
        `version: 1
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node sub {
    type: workflow
    label: "S"
    workflow: other_g
    input: @ts { return {} }
  }
  node http_n {
    type: http
    label: "H"
    url: "https://example.com"
    auth: other_auth
  }
  node pg_n {
    type: postgres
    label: "P"
    postgres: other_pg
    select: @sql { SELECT id FROM t }
  }
  node sec_n {
    type: code
    label: "C"
    code: @ts { return {} }
    secrets: { other_secret: [API_KEY] }
  }
  flow {
    root -> sub
    sub -> http_n
    http_n -> pg_n
    pg_n -> sec_n
  }
}
stream s1 {
  label: "S"
  workflow: other_g
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object", "properties": {} } }
      prepare: @ts { return {} }
    }
  }
}
trigger tr1 {
  form:other_form -> other_g
}
`,
        'utf-8',
      )
      fs.writeFileSync(
        path.join(dir, 'provider.swirls'),
        `version: 1
form other_form {
  label: "F"
  schema: @json { { "type": "object", "properties": {} } }
}
workflow other_g {
  label: "OG"
  root { type: code label: "R" code: @ts { return {} } }
}
schema remote_shape {
  label: "R"
  schema: @json { { "type": "object", "properties": { "x": { "type": "string" } } } }
}
secret other_secret {
  label: "OS"
  vars: [API_KEY]
}
secret pg_sec {
  label: "PG"
  vars: [KEY]
}
auth other_auth {
  label: "OA"
  type: bearer
  secrets: other_secret
  token: API_KEY
}
postgres other_pg {
  label: "OP"
  connection: KEY
  secrets: pg_sec
  table t {
    schema: @json { { "type": "object", "properties": { "id": { "type": "integer" } } } }
  }
}
`,
        'utf-8',
      )

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const consumer = fs.readFileSync(
        path.join(dir, 'consumer.swirls'),
        'utf-8',
      )
      const { ast, errors } = parse(consumer)
      expect(errors.length).toBe(0)

      const diagsLocal = validate(ast)
      expect(
        hasDiagnostic(
          diagsLocal,
          'references workflow "other_g" which is not defined',
        ),
      ).toBe(true)
      expect(
        hasDiagnostic(
          diagsLocal,
          'references undefined auth block "other_auth"',
        ),
      ).toBe(true)
      expect(
        hasDiagnostic(
          diagsLocal,
          'references undefined postgres block "other_pg"',
        ),
      ).toBe(true)
      expect(
        hasDiagnostic(diagsLocal, 'undefined secret block "other_secret"'),
      ).toBe(true)
      expect(
        hasDiagnostic(
          diagsLocal,
          'Stream references workflow "other_g" which is not defined',
        ),
      ).toBe(true)
      expect(
        hasDiagnostic(
          diagsLocal,
          'Trigger references form "other_form" which is not defined',
        ),
      ).toBe(true)

      const diagsWs = validate(ast, { workspace })
      const err = diagsWs.filter((d) => d.severity === 'error')
      expect(err.length).toBe(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('node inputSchema schemaRef resolves across files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-val-sch-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'a.swirls'),
        `version: 1
workflow g {
  label: "G"
  root {
    type: code
    label: "R"
    inputSchema: remote_shape
    code: @ts { return {} }
  }
  flow { }
}
`,
        'utf-8',
      )
      fs.writeFileSync(
        path.join(dir, 'b.swirls'),
        `version: 1
schema remote_shape {
  label: "R"
  schema: @json { { "type": "object", "properties": { "x": { "type": "string" } } } }
}
`,
        'utf-8',
      )
      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const { ast, errors } = parse(
        fs.readFileSync(path.join(dir, 'a.swirls'), 'utf-8'),
      )
      expect(errors.length).toBe(0)
      const diagsLocal = validate(ast)
      expect(
        hasDiagnostic(diagsLocal, 'references undefined schema "remote_shape"'),
      ).toBe(true)
      const diagsWs = validate(ast, { workspace })
      expect(
        hasDiagnostic(diagsWs, 'references undefined schema "remote_shape"'),
      ).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agent blocks and nodes', () => {
  test('agent node references undefined agent block', () => {
    const source = `
workflow g {
  root {
    type: agent
    label: "A"
    agent: missing_one
    prompt: @ts { return ""; }
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'undefined agent block "missing_one"')).toBe(
      true,
    )
  })

  test('role tools must be subset of agent tools list', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }

workflow tool_g {
  label: "T"
  description: "demo tool graph"
  root {
    type: code
    label: "R"
    inputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    code: @ts { return {}; }
  }
}

agent dup_role {
  label: "A"
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  tools: [ tool_g ]
  profile r1 {
    tools: [ other_graph ]
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'Profile "r1" tool "other_graph" is not listed on agent "dup_role" tools:',
      ),
    ).toBe(true)
  })

  test('duplicate role names produce diagnostic', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }
agent dup {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  profile z { }
  profile z { }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'Duplicate profile name "z"')).toBe(true)
  })

  test('invalid provider string', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }
agent badprov {
  secrets: s
  provider: vendor_x
  model: "gpt-4o-mini"
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'Invalid agent provider "vendor_x"')).toBe(true)
  })

  test('node tools override must stay within inherited agent/role tools', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }

workflow tool_g {
  label: "T"
  description: "demo tool graph"
  root {
    type: code
    label: "R"
    inputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    code: @ts { return {}; }
  }
}

agent arb {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  tools: [ tool_g ]
  profile rn {
    tools: [ tool_g ]
  }
}
workflow gn {
  root {
    type: agent
    label: "N"
    agent: arb
    profile: rn
    tools: [ tool_g, other_graph ]
    prompt: @ts { return ""; }
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'Agent node tool override "other_graph" is not allowed for the selected profile/agent tool list',
      ),
    ).toBe(true)
  })

  test('tool graph without graph description is rejected', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }

workflow bare_tool {
  label: "Bare"
  root {
    type: code
    label: "R"
    inputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    code: @ts { return {}; }
  }
}

agent ag {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  tools: [ bare_tool ]
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'is used as an agent tool but the workflow-level description field is missing',
      ),
    ).toBe(true)
  })

  test('tool graph missing root inputSchema is rejected', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }

workflow bad_root {
  label: "Bad"
  description: "Has description but invalid root shape"
  root {
    type: code
    label: "R"
    outputSchema: @json {
      {
        "type": "object",
        "additionalProperties": true
      }
    }
    code: @ts { return {}; }
  }
}

agent ag2 {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  tools: [ bad_root ]
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'Agent tool workflow "bad_root" must declare inputSchema on the root node',
      ),
    ).toBe(true)
  })

  test('tool graph accepts named root inputSchema reference', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }

schema tool_payload {
  label: "Tool payload"
  schema: @json {
    {
      "type": "object",
      "required": ["email"],
      "properties": {
        "email": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
}

schema tool_result {
  label: "Tool result"
  schema: @json {
    {
      "type": "object",
      "required": ["status"],
      "properties": {
        "status": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
}

workflow named_tool {
  label: "Named tool"
  description: "Looks up one customer status."
  root {
    type: code
    label: "Lookup"
    inputSchema: tool_payload
    outputSchema: tool_result
    code: @ts { return { status: "ok" }; }
  }
}

agent ag3 {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  tools: [ named_tool ]
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'Agent tool workflow "named_tool" must declare inputSchema on the root node',
      ),
    ).toBe(false)
  })

  test('unknown profile referenced by agent node', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }
agent ar {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
}
workflow gx {
  root {
    type: agent
    label: "X"
    agent: ar
    profile: nope_profile
    prompt: @ts { return ""; }
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(diags, 'Agent "ar" has no profile named "nope_profile"'),
    ).toBe(true)
  })

  test('profile sandbox without agent sandbox is allowed', () => {
    const source = `
secret s { label: "S" vars: [ OPENAI_API_KEY ] }
agent ar {
  secrets: s
  provider: openai
  model: "gpt-4o-mini"
  profile r1 {
    description: "R"
    sandbox: { autoStopMinutes: 10 }
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(
      hasDiagnostic(
        diags,
        'declares sandbox but agent "ar" has no top-level sandbox',
      ),
    ).toBe(false)
    expect(ast.agent?.[0]?.profiles?.[0]?.sandbox?.autoStopMinutes).toBe(10)
  })
})

describe('validateTsFileRefs', () => {
  test('reports missing @ts file', () => {
    const source = `
workflow g {
  root {
    type: code
    label: "R"
    code: @ts "./missing.ts.swirls"
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validateTsFileRefs(ast, {
      swirlsFilePath: '/project/app.swirls',
      existsSync: () => false,
    })
    expect(diags.length).toBeGreaterThan(0)
    expect(hasDiagnostic(diags, 'not found')).toBe(true)
  })
})
