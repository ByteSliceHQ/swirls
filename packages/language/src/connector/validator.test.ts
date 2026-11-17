import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { validateConnectorBlocks } from './validator'

describe('validateConnectorBlocks', () => {
  test('flags duplicate connector block names', () => {
    const src = `
connector client_portal {
  label: "One"
}
connector client_portal {
  label: "Two"
}
`

    const { ast } = parse(src)
    const diags = validateConnectorBlocks(ast)
    expect(diags.some((d) => d.message.includes('Duplicate connector block name'))).toBe(true)
  })

  test('rejects invalid handle format', () => {
    // A hyphenated handle is not a lexable identifier, so exercise the
    // name-format rule against a decl built directly (mirrors mcp/connection).
    const { ast } = parse('')

    ast.connector = [
      {
        name: 'bad-name',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      },
    ]

    const diags = validateConnectorBlocks(ast)
    expect(diags.some((d) => d.message.includes('Connector block name'))).toBe(true)
  })

  test('accepts a well-formed block', () => {
    const src = `
connector client_portal {
  label: "Client connector"
}
`

    const { ast } = parse(src)
    expect(validateConnectorBlocks(ast)).toEqual([])
  })
})
