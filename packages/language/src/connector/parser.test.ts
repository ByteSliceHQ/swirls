import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'

describe('connector block parser', () => {
  test('parses connector block with label and description', () => {
    const src = `
connector client_portal {
  label: "Client connector"
  description: "Inbound OAuth application for MSP end clients"
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.connector).toHaveLength(1)
    expect(ast.connector[0]).toMatchObject({
      name: 'client_portal',
      label: 'Client connector',
      description: 'Inbound OAuth application for MSP end clients',
    })
  })

  test('label and description are both optional', () => {
    const src = `
connector bare {
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.connector).toHaveLength(1)
    expect(ast.connector[0]?.label).toBeUndefined()
    expect(ast.connector[0]?.description).toBeUndefined()
  })

  test('rejects unknown connector property', () => {
    const src = `
connector bad {
  provider: swirls
}
`
    const { ast, errors } = parse(src)
    expect(ast.connector).toHaveLength(1)
    expect(
      errors.some((e) => e.message.includes('Unknown connector property')),
    ).toBe(true)
  })

  test('flags duplicate property within a block', () => {
    const src = `
connector dupe {
  label: "One"
  label: "Two"
}
`
    const { errors } = parse(src)
    expect(
      errors.some((e) => e.message.includes('Duplicate connector property')),
    ).toBe(true)
  })

  test('captures the doc comment above the block', () => {
    const src = `
/* Client-facing MCP connector */
connector client_portal {
  label: "Client connector"
}
`
    const { ast } = parse(src)
    expect(ast.connector[0]?.docComment).toBe('Client-facing MCP connector')
  })
})
