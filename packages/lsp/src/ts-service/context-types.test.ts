import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type {
  NodeDecl,
  SourceRange,
  StreamDecl,
  SwirlsFile,
  WorkflowDecl,
} from '@swirls/language'
import { parse } from '@swirls/language'
import {
  generateContextTypePreamble,
  generateStreamBlockContextPreamble,
} from './context-types'

const LOOP_INLINE_SUBGRAPH_FIXTURE = path.join(
  import.meta.dir,
  '../../../language/src/__fixtures__/loop-inline-subgraph.swirls',
)

const range: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 2, column: 1, offset: 10 },
}

function streamGraphWithPullRef(streamName: string): {
  graph: WorkflowDecl
  streams: StreamDecl[]
} {
  const rootNode: NodeDecl = {
    name: 'root',
    type: 'code',
    label: 'r',
    isRoot: true,
    configFields: {},
    range,
  }

  const pullNode: NodeDecl = {
    name: 'pull',
    type: 'stream',
    label: 'p',
    configFields: {
      stream: { kind: 'string', value: streamName, range },
      version: { kind: 'string', value: 'v1', range },
      filter: {
        kind: 'ts_block',
        code: 'return {}',
        innerRange: range,
        range,
      },
    },
    range,
  }

  const formatNode: NodeDecl = {
    name: 'format',
    type: 'code',
    label: 'f',
    configFields: {},
    range,
  }

  const graph: WorkflowDecl = {
    name: 'g',
    label: 'G',
    nodes: [rootNode, pullNode, formatNode],
    edges: [
      { source: 'root', target: 'pull', range },
      { source: 'pull', target: 'format', range },
    ],
    range,
  }

  const streams: StreamDecl[] = [
    {
      name: 'scores',
      label: 'Scores',
      workflowName: 'writer',
      version: 'v1',
      versions: [
        {
          key: 'v1',
          range,
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              score: { type: 'number' },
            },
            required: ['email', 'score'],
          },
        },
      ],
      range,
    },
  ]

  return { graph, streams }
}

describe('generateContextTypePreamble', () => {
  test('types type:stream node output from referenced stream schema as SchemaType[]', () => {
    const { graph, streams } = streamGraphWithPullRef('scores')
    const preamble = generateContextTypePreamble(
      graph,
      'format',
      [graph],
      [],
      streams,
    )

    expect(preamble).toContain('type PullOutput =')
    expect(preamble).toContain('email')
    expect(preamble).toContain('score')
    expect(preamble).toContain('pull: { output: PullOutput[] }')
  })

  test('stream block without schema yields unknown[] for stream node output', () => {
    const { graph } = streamGraphWithPullRef('scores')
    const streamsNoSchema: StreamDecl[] = [
      {
        name: 'scores',
        label: 'Scores',
        workflowName: 'writer',
        version: 'v1',
        versions: [{ key: 'v1', range }],
        range,
      },
    ]

    const preamble = generateContextTypePreamble(
      graph,
      'format',
      [graph],
      [],
      streamsNoSchema,
    )

    expect(preamble).toContain('pull: { output: unknown[] }')
    expect(preamble).not.toContain('PullOutput')
  })

  test('missing stream block for reference yields unknown[]', () => {
    const { graph } = streamGraphWithPullRef('wrong_name')
    const preamble = generateContextTypePreamble(
      graph,
      'format',
      [graph],
      [],
      [],
    )

    expect(preamble).toContain('pull: { output: unknown[] }')
  })

  test('downstream of map sees map output as leaf array type', () => {
    const content = fs.readFileSync(LOOP_INLINE_SUBGRAPH_FIXTURE, 'utf8')
    const { ast } = parse(content)
    const graph = ast.workflows[0]
    if (!graph) {
      throw new Error('expected graph')
    }
    const after: NodeDecl = {
      name: 'after',
      type: 'code',
      label: 'after',
      configFields: {},
      range,
    }
    const extended: WorkflowDecl = {
      ...graph,
      nodes: [...graph.nodes, after],
      edges: [
        ...(graph.edges ?? []),
        { source: 'each_item', target: 'after', range },
      ],
    }
    const preamble = generateContextTypePreamble(
      extended,
      'after',
      ast.workflows,
      [],
      [],
    )
    expect(preamble).toContain('Each_itemOutput =')
    expect(preamble).toContain('[]')
    expect(preamble).toContain('each_item: { output: Each_itemOutput }')
  })

  test('resolves root inputSchema name ref via fileAst for RootInput', () => {
    const source = `
version: 1

schema shared {
  label: "S"
  schema: @json {
    { "type": "object", "properties": { "name": { "type": "string" }, "email": { "type": "string" } }, "required": ["name", "email"] }
  }
}

graph g {
  label: "G"
  root {
    type: code
    label: "R"
    inputSchema: shared
    code: @ts { return {} }
  }
  node tail {
    type: code
    label: "T"
    code: @ts { return {} }
  }
  flow {
    root -> tail
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const graph = ast.workflows[0]
    if (!graph) {
      throw new Error('expected graph')
    }
    const preamble = generateContextTypePreamble(
      graph,
      'tail',
      ast.workflows,
      [],
      [],
      undefined,
      undefined,
      ast as SwirlsFile,
    )
    expect(preamble).toContain('type RootInput =')
    expect(preamble).toContain('name')
    expect(preamble).toContain('email')
    expect(preamble).toContain('root: { input: RootInput; output')
  })

  test('resolves downstream node schema: name ref for output type', () => {
    const source = `
version: 1

schema shared {
  label: "S"
  schema: @json {
    { "type": "object", "properties": { "score": { "type": "number" } }, "required": ["score"] }
  }
}

graph g {
  label: "G"
  root {
    type: code
    label: "R"
    code: @ts { return { score: 1 } }
  }
  node scored {
    type: code
    label: "S"
    schema: shared
    code: @ts { return {} }
  }
  node tail {
    type: code
    label: "T"
    code: @ts { return {} }
  }
  flow {
    root -> scored
    scored -> tail
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const graph = ast.workflows[0]
    if (!graph) {
      throw new Error('expected graph')
    }
    const preamble = generateContextTypePreamble(
      graph,
      'tail',
      ast.workflows,
      [],
      [],
      undefined,
      undefined,
      ast as SwirlsFile,
    )
    expect(preamble).toContain('type ScoredOutput =')
    expect(preamble).toContain('score')
    expect(preamble).toContain('scored: { output: ScoredOutput }')
  })

  test('resolves review schema: name ref for context.reviews', () => {
    const source = `
version: 1

schema rschema {
  label: "R"
  schema: @json {
    { "type": "object", "properties": { "approved": { "type": "boolean" } }, "required": ["approved"] }
  }
}

graph g {
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
    const graph = ast.workflows[0]
    if (!graph) {
      throw new Error('expected graph')
    }
    const preamble = generateContextTypePreamble(
      graph,
      'root',
      ast.workflows,
      [],
      [],
      undefined,
      undefined,
      ast as SwirlsFile,
    )
    expect(preamble).toContain('type RootReview =')
    expect(preamble).toContain('approved')
    expect(preamble).toContain('reviews: {\n    root: RootReview')
  })
})

describe('generateStreamBlockContextPreamble', () => {
  test('types context.output as partial record keyed by leaf node names', () => {
    const { graph, streams } = streamGraphWithPullRef('scores')
    const preamble = generateStreamBlockContextPreamble(
      graph,
      [graph],
      [],
      streams,
    )
    expect(preamble).toContain('format: unknown')
    expect(preamble).toContain('output: { format: unknown }')
    expect(preamble).toContain('root:')
    expect(preamble).toContain('pull:')
    expect(preamble).toContain('format:')
  })

  test('types context.output from root outputSchema when root is the sole sink', () => {
    const rootNode: NodeDecl = {
      name: 'root',
      type: 'code',
      label: 'r',
      isRoot: true,
      configFields: {},
      outputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          tokens: { type: 'number' },
        },
        required: ['topic', 'tokens'],
      },
      range,
    }

    const graph: WorkflowDecl = {
      name: 'count_topic_tokens',
      label: 'Count',
      nodes: [rootNode],
      edges: [],
      range,
    }

    const preamble = generateStreamBlockContextPreamble(graph, [graph], [], [])

    expect(preamble).toContain('type RootOutput =')
    expect(preamble).toContain('topic')
    expect(preamble).toContain('tokens')
    expect(preamble).toContain(
      'output: { root: { topic: string; tokens: number } }',
    )
  })

  test('switch graph with two leaf code nodes types both leaves as optional on context.output', () => {
    const rootNode: NodeDecl = {
      name: 'root',
      type: 'code',
      label: 'r',
      isRoot: true,
      configFields: {},
      outputSchema: {
        type: 'object',
        properties: { len: { type: 'number' } },
        required: ['len'],
      },
      range,
    }
    const routeNode: NodeDecl = {
      name: 'route',
      type: 'switch',
      label: 'route',
      configFields: {},
      range,
    }
    const leafA: NodeDecl = {
      name: 'leaf_a',
      type: 'code',
      label: 'a',
      configFields: {},
      outputSchema: {
        type: 'object',
        properties: { x: { type: 'number' } },
        required: ['x'],
      },
      range,
    }
    const leafB: NodeDecl = {
      name: 'leaf_b',
      type: 'code',
      label: 'b',
      configFields: {},
      outputSchema: {
        type: 'object',
        properties: { y: { type: 'string' } },
        required: ['y'],
      },
      range,
    }
    const graph: WorkflowDecl = {
      name: 'switch_g',
      label: 'Switch',
      nodes: [rootNode, routeNode, leafA, leafB],
      edges: [
        { source: 'root', target: 'route', range },
        { source: 'route', target: 'leaf_a', label: 'a', range },
        { source: 'route', target: 'leaf_b', label: 'b', range },
      ],
      range,
    }

    const preamble = generateStreamBlockContextPreamble(graph, [graph], [], [])

    expect(preamble).toContain('type Leaf_aOutput =')
    expect(preamble).toContain('type Leaf_bOutput =')
    expect(preamble).toContain(
      'output: { leaf_a?: { x: number }; leaf_b?: { y: string } }',
    )
    expect(preamble).toContain('leaf_a?: { output: Leaf_aOutput }')
    expect(preamble).toContain('leaf_b?: { output: Leaf_bOutput }')
    expect(preamble).toContain('route: { output: unknown }')
  })
})
