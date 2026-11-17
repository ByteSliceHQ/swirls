import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { validateActionBlocks } from './validator'

describe('action block parser', () => {
  test('parses action block with schemas', () => {
    const source = `
action slack_post_message {
  label: "Post message"
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  scopes: ["chat:write"]
  input: @json { { "type": "object", "required": ["channel"], "properties": { "channel": { "type": "string" } } } }
  output: @json { { "type": "object", "properties": { "ok": { "type": "boolean" } } } }
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.actions).toHaveLength(1)
    expect(ast.actions[0]?.name).toBe('slack_post_message')
    expect(ast.actions[0]?.provider).toBe('slack')
    expect(ast.actions[0]?.method).toBe('POST')
    expect(ast.actions[0]?.encoding).toBe('form')
  })
})

describe('validateActionBlocks', () => {
  test('rejects duplicate action names', () => {
    const { ast } = parse(`
action a { provider: slack method: POST path: "/a" }
action a { provider: slack method: POST path: "/b" }
`)
    const diags = validateActionBlocks(ast)
    expect(diags.some((d) => d.message.includes('Duplicate action'))).toBe(true)
  })

  test('requires POST when document is set', () => {
    const { ast } = parse(`
action linear_issue {
  provider: linear
  method: GET
  path: "/graphql"
  document: "query { viewer { id } }"
}
`)
    const diags = validateActionBlocks(ast)
    expect(
      diags.some((d) =>
        d.message.includes('with document requires method POST'),
      ),
    ).toBe(true)
  })

  test('rejects input/output when document is set', () => {
    const { ast } = parse(`
action linear_issue {
  provider: linear
  method: POST
  path: "/graphql"
  document: "query { viewer { id } }"
  input: { type: "object" }
}
`)
    const diags = validateActionBlocks(ast)
    expect(
      diags.some((d) => d.message.includes('must not declare input or output')),
    ).toBe(true)
  })

  test('parses document field on graphql actions', () => {
    const { ast, errors } = parse(`
action linear_viewer {
  provider: linear
  method: POST
  path: "/graphql"
  document: "query { viewer { id } }"
}
`)
    expect(errors).toEqual([])
    expect(ast.actions[0]?.graphqlDocument).toBe('query { viewer { id } }')
  })
})
