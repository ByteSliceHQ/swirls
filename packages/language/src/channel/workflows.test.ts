import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validateChannelBlocks } from './validator'

const workflow = `workflow quote {
  label: "Create quote"
  description: "Create a customer quote"
  root {
    type: code
    inputSchema: @json { { "type": "object", "properties": {} } }
    code: @ts { return {} }
  }
}`
const source = `${workflow}
connector customers {}
channel sales { platform: mcp connector: customers workflows: [quote] }
role salesperson { match { department: "sales" } }
policy { allow salesperson -> workflow quote }`

describe('MCP workflow DSL', () => {
  test('accepts and round-trips a workflow-only channel and direct grant', () => {
    const result = parse(source)
    expect(result.errors).toEqual([])
    expect(validateChannelBlocks(result.ast)).toEqual([])
    const again = parse(serialize(result.ast))
    expect(again.errors).toEqual([])
    expect(again.ast.channels[0]?.agent).toBeUndefined()
    expect(again.ast.channels[0]?.workflows).toEqual(['quote'])
    expect(again.ast.policies[0]?.grants[0]?.workflow).toBe('quote')
  })
  test.each([
    ['workflows: []', 'agent or'],
    ['workflows: [missing]', 'unknown workflow'],
    ['workflows: [quote, quote]', 'repeats workflow'],
    ['workflows: [send_message]', 'reserved MCP'],
  ])('rejects %s', (publication, message) => {
    const result = parse(source.replace('workflows: [quote]', publication))
    expect(
      [...result.errors, ...validateChannelBlocks(result.ast)].some((error) =>
        error.message.includes(message),
      ),
    ).toBe(true)
  })
  test('requires a description and an object schema', () => {
    const result = parse(
      source
        .replace('description: "Create a customer quote"', '')
        .replace('"type": "object"', '"type": "string"'),
    )
    const messages = validateChannelBlocks(result.ast).map(
      (error) => error.message,
    )
    expect(
      messages.some((message) => message.includes('requires a description')),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes('requires an object inputSchema'),
      ),
    ).toBe(true)
  })
  test('forbids workflow publication on other channel platforms', () => {
    const result = parse(
      source.replace('platform: mcp', 'platform: web agent: assistant'),
    )
    expect(
      validateChannelBlocks(result.ast).some((error) =>
        error.message.includes('only valid for platform "mcp"'),
      ),
    ).toBe(true)
  })
  test.each([
    'allow salesperson -> workflow *',
    'allow salesperson -> workflow quote { tools: [quote] }',
  ])('rejects %s', (grant) => {
    expect(parse(`policy { ${grant} }`).errors.length).toBeGreaterThan(0)
  })
})
