import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from '@swirls/language'
import { buildWorkspaceResourceIndex } from '@swirls/language/workspace'
import { buildVirtualTsContent, collectTsBlocks } from './virtual-docs'

const SUBGRAPH_WORKFLOW_PATH = path.join(
  import.meta.dir,
  '../../../language/examples/subgraph-workflow.swirls',
)

const STREAM_EXAMPLE_PATH = path.join(
  import.meta.dir,
  '../../../language/examples/stream.swirls',
)

const LOOP_INLINE_SUBGRAPH_FIXTURE = path.join(
  import.meta.dir,
  '../../../language/src/__fixtures__/loop-inline-subgraph.swirls',
)

const LOOP_BATCH_PIPELINE_EXAMPLE = path.join(
  import.meta.dir,
  '../../../language/examples/loop-batch-pipeline.swirls',
)

const VALID_INTEGRATION_FIXTURE = path.join(
  import.meta.dir,
  '../../../language/src/__fixtures__/valid-integration.swirls',
)

describe('TS block return type constraints', () => {
  test('graph node input block gets return type from subgraph root inputSchema', () => {
    const content = fs.readFileSync(SUBGRAPH_WORKFLOW_PATH, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const inputBlock = blocks.find(
      (b) => b.configKey === 'input' && b.nodeName === 'run_helper',
    )
    expect(inputBlock).toBeDefined()
    const virtual = buildVirtualTsContent(inputBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
    // helper_graph root node inputSchema is { value: number }
    expect(virtual).toContain('value: number')
  })

  test('code block with outputSchema gets return type', () => {
    const content = fs.readFileSync(SUBGRAPH_WORKFLOW_PATH, 'utf8')
    const result = parse(content)
    const blocks = collectTsBlocks(result.ast)
    // root node in main_graph has outputSchema { value: number }
    const rootCodeBlock = blocks.find(
      (b) =>
        b.configKey === 'code' &&
        b.nodeName === 'root' &&
        b.workflowName === 'main_graph',
    )
    expect(rootCodeBlock).toBeDefined()
    const virtual = buildVirtualTsContent(rootCodeBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('value: number')
  })

  test('code block with schema: named ref gets return type from top-level schema', () => {
    const content = `
schema shared {
  label: "S"
  schema: @json {
    { "type": "object", "properties": { "k": { "type": "number" } } }
  }
}
graph g {
  label: "G"
  root {
    type: code
    label: "R"
    outputSchema: shared
    code: @ts { return { k: 1 } }
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const codeBlock = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'root',
    )
    expect(codeBlock).toBeDefined()
    const virtual = buildVirtualTsContent(codeBlock!)
    expect(virtual).toContain('k?: number')
  })

  test('prompt block gets string return type', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  node n {
    type: ai
    kind: text
    prompt: @ts {
      return "hello"
    }
  }
  flow { n -> n }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const promptBlock = blocks.find(
      (b) => b.configKey === 'prompt' && b.nodeName === 'n',
    )
    expect(promptBlock).toBeDefined()
    const virtual = buildVirtualTsContent(promptBlock!)
    expect(virtual).toContain('type __ExpectedReturn = string')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
  })

  test('switch router block gets union of case labels', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  node classify {
    type: switch
    cases: ["urgent", "normal", "low"]
    router: @ts {
      return "urgent"
    }
  }
  flow { classify -> classify }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const routerBlock = blocks.find(
      (b) => b.configKey === 'router' && b.nodeName === 'classify',
    )
    expect(routerBlock).toBeDefined()
    const virtual = buildVirtualTsContent(routerBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('"urgent" | "normal" | "low"')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
  })

  test('postgres insert params: placeholder type inferred by column position', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (greeting) VALUES ({{funky}}) }
    params: @ts { return { funky: "hi" } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('funky: string')
    expect(virtual).toContain('[key: string]: unknown')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
  })

  test('postgres insert params: VALUES without parens still maps positionally', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (greeting) VALUES {{funky}} }
    params: @ts { return { funky: "hi" } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('funky: string')
    expect(virtual).toContain('[key: string]: unknown')
  })

  test('postgres select params: WHERE comparison infers column type', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" }, "score": { "type": "number" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    select: @sql { SELECT * FROM t WHERE score = {{min}} }
    params: @ts { return { min: 5 } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('min: number')
    expect(virtual).toContain('[key: string]: unknown')
  })

  test('postgres update params: SET and WHERE comparisons infer column types', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" }, "score": { "type": "number" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    update: @sql { UPDATE t SET greeting = {{msg}} WHERE score = {{min}} }
    params: @ts { return { msg: "hi", min: 5 } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('msg: string')
    expect(virtual).toContain('min: number')
    expect(virtual).toContain('[key: string]: unknown')
  })

  test('postgres delete params: WHERE comparison infers column type', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" }, "score": { "type": "number" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    delete: @sql { DELETE FROM t WHERE score = {{min}} }
    params: @ts { return { min: 5 } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('min: number')
    expect(virtual).toContain('[key: string]: unknown')
  })

  test('postgres params return type includes index signature for extra keys', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES ({{p}}) }
    params: @ts { return { p: "x" } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toMatch(
      /type __ExpectedReturn = \{[^}]*\[key: string\]: unknown/,
    )
  })

  test('postgres insert params: no placeholders means no return type constraint', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (greeting) VALUES ('static') }
    params: @ts { return { anything: 123 } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).not.toContain('type __ExpectedReturn')
    expect(virtual).toContain('async function __expr() {')
  })

  test('parallel objective block expects string', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  node p {
    type: parallel
    operation: search
    objective: @ts {
      return "q"
    }
    searchQueries: @ts { return ["a"] }
  }
  flow { p -> p }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const block = blocks.find(
      (b) => b.configKey === 'objective' && b.nodeName === 'p',
    )
    expect(block).toBeDefined()
    const virtual = buildVirtualTsContent(block!)
    expect(virtual).toContain('type __ExpectedReturn = string')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
  })

  test('parallel searchQueries block expects string[]', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  node p {
    type: parallel
    operation: search
    objective: @ts { return "q" }
    searchQueries: @ts { return ["a", "b"] }
  }
  flow { p -> p }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const block = blocks.find(
      (b) => b.configKey === 'searchQueries' && b.nodeName === 'p',
    )
    expect(block).toBeDefined()
    const virtual = buildVirtualTsContent(block!)
    expect(virtual).toContain('type __ExpectedReturn = string[]')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
  })

  test('parallel urls block expects string[]', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  node p {
    type: parallel
    operation: extract
    objective: @ts { return "q" }
    urls: @ts { return ["https://example.com"] }
    excerpts: true
  }
  flow { p -> p }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const block = blocks.find(
      (b) => b.configKey === 'urls' && b.nodeName === 'p',
    )
    expect(block).toBeDefined()
    const virtual = buildVirtualTsContent(block!)
    expect(virtual).toContain('type __ExpectedReturn = string[]')
    expect(virtual).toContain(
      'async function __expr(): Promise<__ExpectedReturn> {',
    )
  })

  test('parallel node without schema infers search output type for downstream context', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  node p {
    type: parallel
    operation: search
    objective: @ts { return "q" }
    searchQueries: @ts { return ["a"] }
  }
  node next {
    type: code
    label: "N"
    code: @ts { return context.nodes.p.output.search_id }
  }
  flow {
    root -> p
    p -> next
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const nextCode = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'next',
    )
    expect(nextCode).toBeDefined()
    const virtual = buildVirtualTsContent(nextCode!)
    expect(virtual).toContain('search_id: string')
    expect(virtual).toContain('p: { output:')
  })

  test('scrape node without schema infers scrape output type for downstream context', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  node fc {
    type: scrape
    url: @ts { return "https://example.com" }
  }
  node next {
    type: code
    label: "N"
    code: @ts { return context.nodes.fc.output.markdown }
  }
  flow {
    root -> fc
    fc -> next
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const nextCode = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'next',
    )
    expect(nextCode).toBeDefined()
    const virtual = buildVirtualTsContent(nextCode!)
    expect(virtual).toContain('markdown?: string')
    expect(virtual).toContain('fc: { output:')
  })

  test('search node without schema infers search output type for downstream context', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  node find {
    type: search
    query: @ts { return "hello" }
  }
  node next {
    type: code
    label: "N"
    code: @ts { return context.nodes.find.output.results }
  }
  flow {
    root -> find
    find -> next
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const nextCode = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'next',
    )
    expect(nextCode).toBeDefined()
    const virtual = buildVirtualTsContent(nextCode!)
    expect(virtual).toContain('results: Array<{')
    expect(virtual).toContain('source: "web" | "news" | "images"')
    expect(virtual).toContain('find: { output:')
  })

  test('disk node without schema infers exec envelope for downstream context', () => {
    const content = `
disk proj {}
graph g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  node ls {
    type: disk
    disk: proj
    command: @ts { return "find poems -type f" }
  }
  node next {
    type: code
    label: "N"
    code: @ts { return context.nodes.ls.output.stdout.split("\\n") }
  }
  flow {
    root -> ls
    ls -> next
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const nextCode = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'next',
    )
    expect(nextCode).toBeDefined()
    const virtual = buildVirtualTsContent(nextCode!)
    expect(virtual).toContain('stdout: string')
    expect(virtual).toContain('exitCode: number')
    expect(virtual).toContain('ls: { output:')
  })

  test('disk copy_file node infers copy_file envelope for downstream context', () => {
    const content = `
disk proj {}
graph g {
  root {
    type: code
    label: "R"
    outputSchema: @json {
      {
        "type": "object",
        "required": ["path", "file"],
        "properties": {
          "path": { "type": "string" },
          "file": { "$ref": "swirls:file" }
        }
      }
    }
    code: @ts {
      return { path: "out.pdf", file: { kind: "swirls.file", id: "1", mediaType: "application/pdf", name: "doc.pdf", size: 1 } }
    }
  }
  node copy {
    type: disk
    disk: proj
    operation: copy_file
    path: @ts { return context.nodes.root.output.path }
    file: @ts { return context.nodes.root.output.file }
  }
  node next {
    type: code
    label: "N"
    code: @ts { return context.nodes.copy.output.path + context.nodes.copy.output.file.name }
  }
  flow {
    root -> copy
    copy -> next
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const nextCode = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'next',
    )
    expect(nextCode).toBeDefined()
    const virtual = buildVirtualTsContent(nextCode!)
    expect(virtual).toContain("kind: 'swirls.file'")
    expect(virtual).toContain('path: string')
    expect(virtual).toContain('name: string')
    expect(virtual).toContain('copy: { output:')
    expect(virtual).not.toContain('stdout: string')
  })

  test('swirls:file in root outputSchema types image.name for downstream prompt', () => {
    const content = `
graph g {
  root {
    type: code
    label: "Entry"
    outputSchema: @json {
      {
        "type": "object",
        "required": ["image", "hint"],
        "properties": {
          "image": { "$ref": "swirls:file" },
          "hint": { "type": "string" }
        }
      }
    }
    code: @ts {
      return { image: { kind: "swirls.file", id: "1", mediaType: "image/jpeg", name: "photo.jpg", size: 1 }, hint: "" }
    }
  }
  node classify {
    type: ai
    kind: object
    label: "Classify"
    model: "google/gemini-2.5-flash"
    schema: @json {
      {
        "type": "object",
        "required": ["summary"],
        "properties": { "summary": { "type": "string" } }
      }
    }
    prompt: @ts {
      const name = context.nodes.root.output.image?.name ?? "image"
      return name
    }
  }
  flow {
    root -> classify
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const promptBlock = blocks.find(
      (b) => b.configKey === 'prompt' && b.nodeName === 'classify',
    )
    expect(promptBlock).toBeDefined()
    const virtual = buildVirtualTsContent(promptBlock!)
    expect(virtual).toContain("kind: 'swirls.file'")
    expect(virtual).toContain('name: string')
    expect(virtual).toContain('root: { output:')
  })

  test('email node without schema infers send output type for downstream context', () => {
    const content = `
form f { label: "F" schema: {} }
graph g {
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
  node r {
    type: email
    from: @ts { return "a@b.com" }
    to: @ts { return "c@d.com" }
    subject: @ts { return "s" }
  }
  node next {
    type: code
    label: "N"
    code: @ts { return context.nodes.r.output.sent }
  }
  flow {
    root -> r
    r -> next
  }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const nextCode = blocks.find(
      (b) => b.configKey === 'code' && b.nodeName === 'next',
    )
    expect(nextCode).toBeDefined()
    const virtual = buildVirtualTsContent(nextCode!)
    expect(virtual).toContain('sent: true')
    expect(virtual).toContain('r: { output:')
  })

  test('postgres select params: placeholder not in comparison resolves to unknown', () => {
    const content = `
postgres db {
  connection: "postgresql://localhost/test"
  table t {
    schema: @json { { "type": "object", "properties": { "greeting": { "type": "string" } } } }
  }
}
graph g {
  root {
    type: postgres
    postgres: db
    select: @sql { SELECT * FROM t ORDER BY greeting LIMIT {{n}} }
    params: @ts { return { n: 10 } }
  }
  flow { root -> root }
}
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.configKey === 'params' && b.nodeName === 'root',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('n: unknown')
    expect(virtual).toContain('[key: string]: unknown')
  })

  test('stream condition block gets boolean return type', () => {
    const content = fs.readFileSync(STREAM_EXAMPLE_PATH, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const cond = blocks.find(
      (b) =>
        b.streamDecl?.name === 'store_topic_tokens' &&
        b.configKey === 'condition',
    )
    expect(cond).toBeDefined()
    const virtual = buildVirtualTsContent(cond!)
    expect(virtual).toContain('type __ExpectedReturn = boolean')
  })

  test('stream prepare block gets return type from stream schema', () => {
    const content = fs.readFileSync(STREAM_EXAMPLE_PATH, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const prep = blocks.find(
      (b) =>
        b.streamDecl?.name === 'store_topic_tokens' &&
        b.configKey === 'prepare',
    )
    expect(prep).toBeDefined()
    const virtual = buildVirtualTsContent(prep!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('topic: string')
    expect(virtual).toContain('tokens: number')
  })

  test('map node items block expects array of subgraph root input type', () => {
    const content = fs.readFileSync(LOOP_INLINE_SUBGRAPH_FIXTURE, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const items = blocks.find(
      (b) => b.configKey === 'items' && b.nodeName === 'each_item',
    )
    expect(items).toBeDefined()
    const virtual = buildVirtualTsContent(items!)
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toContain('[]')
    expect(virtual).toContain('x: number')
  })

  test('subgraph inner @ts sees context.iteration for map', () => {
    const content = fs.readFileSync(LOOP_INLINE_SUBGRAPH_FIXTURE, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const innerCode = blocks.find(
      (b) =>
        b.workflowName.includes('subgraph') &&
        b.nodeName === 'root' &&
        b.configKey === 'code',
    )
    expect(innerCode).toBeDefined()
    if (!innerCode) {
      throw new Error('Expected map subgraph code block')
    }
    const virtual = buildVirtualTsContent(innerCode)
    expect(virtual).toContain('iteration: { index: number; item:')
    expect(virtual).toContain('x: number')
  })

  test('fanout iteration context omits sequential previous output', () => {
    const result = parse(`workflow parent {
  root {
    type: code
    code: @ts { return { items: [{ x: 1 }] } }
  }
  node each_item {
    type: fanout
    items: @ts { return context.nodes.root.output.items }
    maxItems: 10
    concurrency: 2
    subgraph {
      root {
        type: code
        inputSchema: @json { { "type": "object", "properties": { "x": { "type": "number" } } } }
        code: @ts { return context.iteration.item }
      }
    }
  }
  flow { root -> each_item }
}`)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const innerCode = blocks.find(
      (block) =>
        block.workflowName.includes('subgraph') &&
        block.nodeName === 'root' &&
        block.configKey === 'code',
    )
    expect(innerCode).toBeDefined()
    if (!innerCode) {
      throw new Error('Expected fanout subgraph code block')
    }
    const virtual = buildVirtualTsContent(innerCode)
    expect(virtual).toContain(
      'iteration: { index: number; item: { x?: number }; total: number }',
    )
  })

  test('while condition and update on parent graph include context.iteration', () => {
    const content = fs.readFileSync(LOOP_BATCH_PIPELINE_EXAMPLE, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const cond = blocks.find(
      (b) => b.nodeName === 'refine_digest' && b.configKey === 'condition',
    )
    const upd = blocks.find(
      (b) => b.nodeName === 'refine_digest' && b.configKey === 'update',
    )
    expect(cond?.loopHost?.type).toBe('while')
    expect(upd?.loopHost?.type).toBe('while')
    for (const b of [cond, upd]) {
      expect(b).toBeDefined()
      const virtual = buildVirtualTsContent(b!)
      expect(virtual).toContain('iteration: { index: number; input:')
      expect(virtual).toContain('draft: string')
    }
  })

  test('integration action params block gets typed return from action input schema', () => {
    const content = fs.readFileSync(VALID_INTEGRATION_FIXTURE, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const paramsBlock = blocks.find(
      (b) => b.nodeName === 'post_slack' && b.configKey === 'params',
    )
    expect(paramsBlock).toBeDefined()
    const virtual = buildVirtualTsContent(paramsBlock!)
    expect(virtual).toContain('type __ExpectedReturn = {')
    expect(virtual).toContain('channel: string')
    expect(virtual).toContain('text: string')
  })

  test('integration action infers downstream output type from action block schema', () => {
    const source = `
action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
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
  root { type: code code: @ts { return { channel: "C1", text: "hi" } } }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    params: @ts { return { channel: "C1", text: "hi" } }
  }
  node after {
    type: code
    code: @ts { return context.nodes.post_slack.output.ok }
  }
  flow {
    root -> post_slack
    post_slack -> after
  }
}
`
    const result = parse(source)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const afterBlock = blocks.find(
      (b) => b.nodeName === 'after' && b.configKey === 'code',
    )
    expect(afterBlock).toBeDefined()
    const virtual = buildVirtualTsContent(afterBlock!)
    expect(virtual).toContain('post_slack: { output: { ok: boolean')
  })

  test('integration action typing resolves cross-file connection via workspace', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-lsp-int-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'connections.swirls'),
        `connection team_slack { provider: slack }
`,
        'utf-8',
      )
      fs.writeFileSync(
        path.join(dir, 'actions.swirls'),
        `action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
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
}
`,
        'utf-8',
      )
      const workflowSource = `
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
      fs.writeFileSync(path.join(dir, 'notify.swirls'), workflowSource, 'utf-8')

      const { ast, errors } = parse(workflowSource)
      expect(errors).toHaveLength(0)

      const localBlock = collectTsBlocks(ast).find(
        (b) => b.nodeName === 'post_slack' && b.configKey === 'params',
      )
      expect(localBlock).toBeDefined()
      const localVirtual = buildVirtualTsContent(localBlock!)
      expect(localVirtual).not.toContain('channel: string')

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const wsBlock = collectTsBlocks(ast, { workspace }).find(
        (b) => b.nodeName === 'post_slack' && b.configKey === 'params',
      )
      expect(wsBlock).toBeDefined()
      const wsVirtual = buildVirtualTsContent(wsBlock!)
      expect(wsVirtual).toContain('channel: string')
      expect(wsVirtual).toContain('text: string')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('graphql integration params block emits alias declarations before __ExpectedReturn', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-lsp-gql-params-'))
    const schemaPath = path.join(
      import.meta.dir,
      '../graphql-action/__fixtures__/users.graphql',
    )
    try {
      fs.mkdirSync(path.join(dir, 'swirls/integrations/test'), {
        recursive: true,
      })
      fs.writeFileSync(
        path.join(dir, 'swirls/integrations/test/schema.graphql'),
        fs.readFileSync(schemaPath, 'utf-8'),
      )
      fs.writeFileSync(
        path.join(dir, 'swirls/integrations/test/list_issues.swirls'),
        `action test_list_issues {
  provider: test
  method: POST
  path: "/graphql"
  document: "query issues($first: Int, $filter: IssueFilter) { issues(first: $first, filter: $filter) { nodes { id } } }"
}
`,
      )
      fs.writeFileSync(
        path.join(dir, 'connections.swirls'),
        `connection test_conn { provider: test }
`,
      )
      const workflowSource = `
workflow list_issues {
  label: "List issues"
  root { type: code code: @ts { return {} } }
  node fetch_issues {
    type: integration
    connection: test_conn
    action: test_list_issues
    params: @ts {
      const input = context.nodes.root.output
      return { first: input.first ?? 50, filter: input.filter }
    }
  }
  flow { root -> fetch_issues }
}
`
      fs.writeFileSync(path.join(dir, 'list_issues.swirls'), workflowSource)

      const { ast, errors } = parse(workflowSource)
      expect(errors).toHaveLength(0)

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const readWorkspaceFile = (relativePath: string) => {
        const fullPath = path.join(dir, relativePath)
        if (!fs.existsSync(fullPath)) {
          return undefined
        }
        return fs.readFileSync(fullPath, 'utf-8')
      }

      const paramsBlock = collectTsBlocks(ast, {
        workspace,
        readWorkspaceFile,
      }).find((b) => b.nodeName === 'fetch_issues' && b.configKey === 'params')
      expect(paramsBlock).toBeDefined()

      const virtual = buildVirtualTsContent(paramsBlock!)
      expect(virtual).toContain('type IssueFilter =')
      expect(virtual).toContain('type __ExpectedReturn = {')
      expect(virtual).not.toContain('type __ExpectedReturn = type ')
      expect(virtual).toContain('"filter"?: IssueFilter')
      expect(virtual).toContain('"first"?: number')
      expect(virtual).toContain(
        'async function __expr(): Promise<__ExpectedReturn> {',
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('graphql integration infers downstream output type from document selection', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-lsp-gql-output-'))
    const schemaPath = path.join(
      import.meta.dir,
      '../graphql-action/__fixtures__/users.graphql',
    )
    try {
      fs.mkdirSync(path.join(dir, 'swirls/integrations/test'), {
        recursive: true,
      })
      fs.writeFileSync(
        path.join(dir, 'swirls/integrations/test/schema.graphql'),
        fs.readFileSync(schemaPath, 'utf-8'),
      )
      fs.writeFileSync(
        path.join(dir, 'swirls/integrations/test/list_issues.swirls'),
        `action test_list_issues {
  provider: test
  method: POST
  path: "/graphql"
  document: "query issues($first: Int) { issues(first: $first) { nodes { id name } } }"
}
`,
      )
      fs.writeFileSync(
        path.join(dir, 'connections.swirls'),
        `connection test_conn { provider: test }
`,
      )
      const workflowSource = `
workflow list_issues {
  label: "List issues"
  root { type: code code: @ts { return { first: 10 } } }
  node fetch_issues {
    type: integration
    connection: test_conn
    action: test_list_issues
    params: @ts { return { first: 10 } }
  }
  node after {
    type: code
    code: @ts { return context.nodes.fetch_issues.output.nodes[0].id }
  }
  flow {
    root -> fetch_issues
    fetch_issues -> after
  }
}
`
      fs.writeFileSync(path.join(dir, 'list_issues.swirls'), workflowSource)

      const { ast, errors } = parse(workflowSource)
      expect(errors).toHaveLength(0)

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const readWorkspaceFile = (relativePath: string) => {
        const fullPath = path.join(dir, relativePath)
        if (!fs.existsSync(fullPath)) {
          return undefined
        }
        return fs.readFileSync(fullPath, 'utf-8')
      }

      const afterBlock = collectTsBlocks(ast, {
        workspace,
        readWorkspaceFile,
      }).find((b) => b.nodeName === 'after' && b.configKey === 'code')
      expect(afterBlock).toBeDefined()

      const virtual = buildVirtualTsContent(afterBlock!)
      expect(virtual).toContain('fetch_issues: { output: { "nodes":')
      expect(virtual).toContain('"id": string')
      expect(virtual).toContain('"name": string')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
