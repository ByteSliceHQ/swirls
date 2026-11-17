import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'

describe('stream block parsing', () => {
  test('top-level stream block parses graph, versions, condition, prepare', () => {
    const source = `
workflow g {
  label: "G"
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
}

stream out {
  version: v2
  enabled: true
  workflow: g
  versions: {
    v1 {
      schema: @json {
        { "type": "object", "properties": { "x": { "type": "number" } } }
      }
      prepare: @ts { return {} }
    }
    v2 {
      schema: @json {
        { "type": "object", "properties": {} }
      }
      condition: @ts { return true }
      prepare: @ts { return {} }
    }
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    expect(ast.streams.length).toBe(1)
    const s = ast.streams[0]!
    expect(s.name).toBe('out')
    expect(s.label).toBe('out')
    expect(s.workflowName).toBe('g')
    expect(s.version).toBe('v2')
    expect(s.enabled).toBe(true)
    const v2 = s.versions.find((v) => v.key === 'v2')
    expect(v2?.condition?.kind).toBe('ts_block')
    expect(v2?.prepare?.kind).toBe('ts_block')
    expect(v2?.schema).toBeDefined()
  })

  test('stream block label defaults to block name when omitted', () => {
    const source = `
workflow g {
  label: "G"
  root {
    type: code
    label: "R"
    code: @ts { return {} }
  }
}

stream my_stream {
  workflow: g
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return {} }
    }
  }
}
`
    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    expect(ast.streams[0]?.label).toBe('my_stream')
  })
})
