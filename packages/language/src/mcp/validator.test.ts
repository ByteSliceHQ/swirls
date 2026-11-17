import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { validateAgentMcpRefs, validateMcpBlocks } from './validator'

describe('validateMcpBlocks', () => {
  test('flags duplicate mcp block names', () => {
    const src = `
mcp axiom {
  label: "One"
  url: "https://mcp.example.com/one"
  auth: static
}
mcp axiom {
  label: "Two"
  url: "https://mcp.example.com/two"
  auth: static
}
`

    const { ast } = parse(src)
    const diags = validateMcpBlocks(ast)
    expect(diags.some((d) => d.message.includes('Duplicate mcp block name'))).toBe(true)
  })

  test('rejects invalid handle format', () => {
    // A hyphenated handle is not a lexable identifier, so exercise the
    // name-format rule against a decl built directly (mirrors connection/skill).
    const { ast } = parse('')

    ast.mcp = [
      {
        name: 'bad-name',
        url: 'https://mcp.example.com/mcp',
        auth: 'static',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      },
    ]

    const diags = validateMcpBlocks(ast)
    expect(diags.some((d) => d.message.includes('MCP block name'))).toBe(true)
  })

  test('accepts a well-formed block', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
  auth: static
}
`

    const { ast } = parse(src)
    expect(validateMcpBlocks(ast)).toEqual([])
  })

  test('requires url', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  auth: static
}
`

    const { ast } = parse(src)
    const diags = validateMcpBlocks(ast)
    expect(diags.some((d) => d.message.includes('requires "url"'))).toBe(true)
  })

  test('requires auth', () => {
    const src = `
mcp axiom_observability {
  url: "https://mcp.example.com/mcp"
}
`

    const { ast } = parse(src)
    const diags = validateMcpBlocks(ast)
    expect(diags.some((d) => d.message.includes('requires "auth:'))).toBe(true)
  })

  test('rejects non-https url', () => {
    const src = `
mcp axiom_observability {
  url: "http://mcp.example.com/mcp"
  auth: interactive
}
`

    const { ast } = parse(src)
    const diags = validateMcpBlocks(ast)
    expect(diags.some((d) => d.message.includes('https URL'))).toBe(true)
  })
})

describe('validateAgentMcpRefs', () => {
  test('flags agent referencing an undefined mcp block', () => {
    const src = `
agent sre_assistant {
  provider: openrouter
  model: "google/gemini-2.5-flash"
  mcp: [missing_slot]
}
`

    const { ast } = parse(src)
    const diags = validateAgentMcpRefs(ast)

    expect(
      diags.some((d) => d.message.includes('references undefined mcp block "missing_slot"')),
    ).toBe(true)
  })

  test('accepts agent referencing a declared mcp block', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
  auth: static
}
agent sre_assistant {
  provider: openrouter
  model: "google/gemini-2.5-flash"
  mcp: [axiom_observability]
}
`

    const { ast } = parse(src)
    expect(validateAgentMcpRefs(ast)).toEqual([])
  })

  test('flags profile mcp not listed on the agent', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
  auth: static
}
mcp extra_slot {
  label: "Extra"
  url: "https://mcp.example.com/extra"
  auth: interactive
}
agent sre_assistant {
  provider: openrouter
  model: "google/gemini-2.5-flash"
  mcp: [axiom_observability]

  profile oncall {
    mcp: [extra_slot]
  }
}
`

    const { ast } = parse(src)
    const diags = validateAgentMcpRefs(ast)

    expect(
      diags.some((d) => d.message.includes('is not listed on agent "sre_assistant" mcp:')),
    ).toBe(true)
  })

  test('accepts profile mcp that is a subset of the agent mcp list', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
  auth: static
}
agent sre_assistant {
  provider: openrouter
  model: "google/gemini-2.5-flash"
  mcp: [axiom_observability]

  profile oncall {
    mcp: [axiom_observability]
  }
}
`

    const { ast } = parse(src)
    expect(validateAgentMcpRefs(ast)).toEqual([])
  })
})
