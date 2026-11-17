import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'

describe('mcp block parser', () => {
  test('parses mcp block with label and description', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  description: "Query Swirls traces, logs, and metrics via MCP"
  url: "https://mcp.example.com/mcp"
  auth: static
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.mcp).toHaveLength(1)
    expect(ast.mcp[0]).toMatchObject({
      name: 'axiom_observability',
      label: 'Axiom',
      description: 'Query Swirls traces, logs, and metrics via MCP',
      url: 'https://mcp.example.com/mcp',
      auth: 'static',
    })
  })

  test('parses url and auth fields', () => {
    const src = `
mcp axiom_observability {
  url: "https://mcp.axiom.co/mcp"
  auth: interactive
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.mcp[0]?.url).toBe('https://mcp.axiom.co/mcp')
    expect(ast.mcp[0]?.auth).toBe('interactive')
  })

  test('label and description are both optional', () => {
    const src = `
mcp bare {
  url: "https://mcp.example.com/mcp"
  auth: static
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.mcp).toHaveLength(1)
    expect(ast.mcp[0]?.label).toBeUndefined()
    expect(ast.mcp[0]?.description).toBeUndefined()
  })

  test('rejects unknown mcp property', () => {
    const src = `
mcp bad {
  foo: "bar"
}
`
    const { ast, errors } = parse(src)
    expect(ast.mcp).toHaveLength(1)
    expect(errors.some((e) => e.message.includes('Unknown mcp property'))).toBe(
      true,
    )
  })

  test('rejects provider key (catalog deferred)', () => {
    const src = `
mcp axiom {
  provider: axiom
  url: "https://mcp.axiom.co/mcp"
  auth: interactive
}
`
    const { errors } = parse(src)
    expect(
      errors.some((e) => e.message.includes('Unknown mcp property "provider"')),
    ).toBe(true)
  })

  test('flags duplicate property within a block', () => {
    const src = `
mcp dupe {
  url: "https://mcp.example.com/mcp"
  auth: static
  label: "One"
  label: "Two"
}
`
    const { errors } = parse(src)
    expect(
      errors.some((e) => e.message.includes('Duplicate mcp property')),
    ).toBe(true)
  })

  test('captures the doc comment above the block', () => {
    const src = `
/* Observability MCP */
mcp axiom {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
  auth: static
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.mcp[0]?.docComment).toContain('Observability MCP')
  })
})
