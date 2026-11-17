import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'

const SOURCE = `
workflow store_topics {
  label: "Store topics"
  root {
    type: code
    code: @ts {
      return { topic: "a", tokens: 1 }
    }
  }
}

workflow complex_graph_thing {
  label: "Complex"
  root {
    type: code
    code: @ts {
      return { email: "x@example.com" }
    }
  }
}

stream store_topic_tokens {
  label: "Topic tokens"
  workflow: store_topics
  version: v1
  versions: {
    v1 {
      schema: @json {
        {
          "type": "object",
          "properties": {
            "topic": { "type": "string" },
            "tokens": { "type": "number" }
          },
          "required": ["topic", "tokens"]
        }
      }
      prepare: @ts {
        return context.output
      }
    }
  }
}

view my_view {
  label: "My view"
  description: "Spreadsheet of topics"
  streams: [store_topic_tokens]
  schema: @json {
    {
      "type": "object",
      "properties": {
        "topic": { "type": "string" },
        "tokens": { "type": "number" }
      },
      "required": ["topic", "tokens"]
    }
  }
  columns: @ts {
    return {
      topic: context.streams.store_topic_tokens.output.topic,
      tokens: context.streams.store_topic_tokens.output.tokens,
    }
  }
  computed {
    computed_thing {
      graph: complex_graph_thing
      input: @ts {
        return { topic: context.row.topic }
      }
      output: @ts {
        return context.output.email
      }
    }
  }
}
`

describe('view block parsing', () => {
  test('top-level view block parses with streams, schema, columns, and computed', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors.length).toBe(0)
    expect(ast.views.length).toBe(1)

    const v = ast.views[0]!
    expect(v.name).toBe('my_view')
    expect(v.label).toBe('My view')
    expect(v.description).toBe('Spreadsheet of topics')
    expect(v.streams.map((s) => s.name)).toEqual(['store_topic_tokens'])
    expect(v.schema).toMatchObject({ type: 'object' })
    expect(v.schemaBlock?.code).toContain('"topic"')
    expect(v.columns?.kind).toBe('ts_block')

    if (v.columns?.kind === 'ts_block') {
      expect(v.columns.code).toContain('context.streams.store_topic_tokens')
    }

    expect(v.computed.length).toBe(1)
    const col = v.computed[0]!
    expect(col.name).toBe('computed_thing')
    expect(col.workflowName).toBe('complex_graph_thing')
    expect(col.input?.kind).toBe('ts_block')
    expect(col.output?.kind).toBe('ts_block')
  })

  test('label defaults to view name', () => {
    const { ast, errors } = parse(`
view bare {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}
`)

    expect(errors.length).toBe(0)
    expect(ast.views[0]?.label).toBe('bare')
  })

  test('computed accepts optional colon before block', () => {
    const { ast, errors } = parse(`
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed: {
    c {
      graph: g
      input: @ts { return {} }
    }
  }
}
`)

    expect(errors.length).toBe(0)
    expect(ast.views[0]?.computed.length).toBe(1)
  })

  test('schema by reference parses', () => {
    const { ast, errors } = parse(`
view v {
  streams: [s]
  schema: shared_shape
  columns: @ts { return {} }
}
`)

    expect(errors.length).toBe(0)
    expect(ast.views[0]?.schemaRef).toBe('shared_shape')
  })

  test('unknown key inside computed column errors', () => {
    const { errors } = parse(`
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c {
      graph: g
      input: @ts { return {} }
      bogus: 1
    }
  }
}
`)

    expect(errors.some((e) => e.message.includes('Unexpected key "bogus"'))).toBe(true)
  })

  test('round-trips through serialize -> parse', () => {
    const first = parse(SOURCE)
    expect(first.errors.length).toBe(0)
    const out = serialize(first.ast)
    const second = parse(out)
    expect(second.errors.length).toBe(0)
    expect(second.ast.views.length).toBe(1)

    const a = first.ast.views[0]!
    const b = second.ast.views[0]!
    expect(b.name).toBe(a.name)
    expect(b.label).toBe(a.label)
    expect(b.streams.map((s) => s.name)).toEqual(a.streams.map((s) => s.name))
    expect(b.schema).toEqual(a.schema)
    expect(b.computed.length).toBe(a.computed.length)
    expect(b.computed[0]?.workflowName).toBe(a.computed[0]?.workflowName ?? '')
  })
})

describe('view block validation', () => {
  test('valid view produces no diagnostics', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(diags.filter((d) => d.severity !== 'warning')).toEqual([])
  })

  test('missing streams, schema, and columns are reported', () => {
    const { ast } = parse(`
view v {
  label: "V"
}
`)

    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('requires "streams"'))).toBe(true)
    expect(diags.some((d) => d.message.includes('has no schema'))).toBe(true)
    expect(diags.some((d) => d.message.includes('requires "columns"'))).toBe(true)
  })

  test('undefined stream reference is reported', () => {
    const { ast } = parse(`
view v {
  streams: [missing_stream]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}
`)

    const diags = validate(ast)

    expect(
      diags.some((d) =>
        d.message.includes('View references stream "missing_stream" which is not defined'),
      ),
    ).toBe(true)
  })

  test('computed column with undefined graph is reported', () => {
    const { ast } = parse(`
workflow g { label: "G" root { type: code code: @ts { return 1 } } }
stream s {
  label: "S"
  workflow: g
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c {
      graph: nope
      input: @ts { return {} }
    }
  }
}
`)

    const diags = validate(ast)

    expect(
      diags.some((d) => d.message.includes('references workflow "nope" which is not defined')),
    ).toBe(true)
  })

  test('computed column requires non-empty input', () => {
    const { ast } = parse(`
workflow g { label: "G" root { type: code code: @ts { return 1 } } }
stream s {
  label: "S"
  workflow: g
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c {
      graph: g
      input: @ts { }
    }
  }
}
`)

    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('input requires a non-empty @ts block'))).toBe(true)
  })

  test('duplicate computed column names are reported', () => {
    const { ast } = parse(`
workflow g { label: "G" root { type: code code: @ts { return 1 } } }
stream s {
  label: "S"
  workflow: g
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c { graph: g input: @ts { return {} } }
    c { graph: g input: @ts { return {} } }
  }
}
`)

    const diags = validate(ast)

    expect(diags.some((d) => d.message.includes('declares duplicate computed column "c"'))).toBe(
      true,
    )
  })

  test('duplicate view names are reported', () => {
    const { ast } = parse(`
workflow g { label: "G" root { type: code code: @ts { return 1 } } }
stream s {
  label: "S"
  workflow: g
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}
`)

    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('Duplicate view name'))).toBe(true)
  })

  test('computed column running the stream-writing graph of its own view is rejected', () => {
    const { ast } = parse(`
workflow g { label: "G" root { type: code code: @ts { return 1 } } }
stream s {
  label: "S"
  workflow: g
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c { graph: g input: @ts { return {} } }
  }
}
`)

    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('creates an infinite execution loop'))).toBe(true)
  })

  test('mutual view cycle across two views is rejected', () => {
    const { ast } = parse(`
workflow ga { label: "GA" root { type: code code: @ts { return 1 } } }
workflow gb { label: "GB" root { type: code code: @ts { return 1 } } }
stream sa {
  label: "SA"
  workflow: ga
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
stream sb {
  label: "SB"
  workflow: gb
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view va {
  streams: [sa]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c { graph: gb input: @ts { return {} } }
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

    const diags = validate(ast)
    const loops = diags.filter((d) => d.message.includes('creates an infinite execution loop'))
    expect(loops.length).toBe(2)
  })

  test('computed column over an unrelated graph does not flag a loop', () => {
    const { ast } = parse(`
workflow writer { label: "W" root { type: code code: @ts { return 1 } } }
workflow enrich { label: "E" root { type: code code: @ts { return 1 } } }
stream s {
  label: "S"
  workflow: writer
  version: v1
  versions: { v1 { schema: @json { { "type": "object" } } prepare: @ts { return {} } } }
}
view v {
  streams: [s]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
  computed {
    c { graph: enrich input: @ts { return {} } }
  }
}
`)

    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('creates an infinite execution loop'))).toBe(false)
  })
})
