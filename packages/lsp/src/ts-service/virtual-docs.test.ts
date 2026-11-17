import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from '@swirls/language'
import {
  buildVirtualTsContent,
  collectJsonBlocks,
  collectTsBlocks,
} from './virtual-docs'

const STREAM_EXAMPLE = path.join(
  import.meta.dir,
  '../../../language/examples/stream.swirls',
)

describe('collectTsBlocks / collectJsonBlocks (stream)', () => {
  test('collects stream condition and prepare @ts blocks and stream schema @json', () => {
    const content = fs.readFileSync(STREAM_EXAMPLE, 'utf8')
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const tsBlocks = collectTsBlocks(result.ast)
    const cond = tsBlocks.find(
      (b) =>
        b.streamDecl?.name === 'store_topic_tokens' &&
        b.configKey === 'condition',
    )
    const prep = tsBlocks.find(
      (b) =>
        b.streamDecl?.name === 'store_topic_tokens' &&
        b.configKey === 'prepare',
    )
    expect(cond).toBeDefined()
    expect(prep).toBeDefined()
    expect(cond?.referencedWorkflow?.name).toBe('count_topic_tokens')
    expect(cond?.code.trim().startsWith('return')).toBe(true)

    const jsonBlocks = collectJsonBlocks(result.ast)
    const streamSchema = jsonBlocks.find((j) =>
      j.label?.includes('store_topic_tokens'),
    )
    expect(streamSchema).toBeDefined()
  })

  test('stream prepare virtual file types context.output from referenced graph and stream schema return', () => {
    const content = fs.readFileSync(STREAM_EXAMPLE, 'utf8')
    const result = parse(content)
    const prep = collectTsBlocks(result.ast).find(
      (b) =>
        b.streamDecl?.name === 'store_topic_tokens' &&
        b.configKey === 'prepare',
    )
    expect(prep).toBeDefined()
    const virtual = buildVirtualTsContent(prep!)
    expect(virtual).toContain('output: { tokens:')
    expect(virtual).toContain('type __ExpectedReturn = ')
    expect(virtual).toMatch(/topic.*tokens/s)
  })
})

describe('buildVirtualTsContent', () => {
  test('virtual preamble does not emit Record utility type (no default lib dependency)', () => {
    const content = `
form f { label: "F" enabled: true schema: @json { { "type": "object", "properties": {} } } }
graph g {
  label: "G"
  root {
    type: code
    label: "R"
    code: @ts {
      return {}
    }
  }
  flow { }
}
trigger t { form:f -> g enabled: true }
`
    const result = parse(content)
    expect(result.errors).toHaveLength(0)
    const blocks = collectTsBlocks(result.ast)
    const codeBlock = blocks.find((b) => b.configKey === 'code')
    expect(codeBlock).toBeDefined()
    const virtual = buildVirtualTsContent(codeBlock!)
    expect(virtual.startsWith('/// <reference lib="dom" />\n')).toBe(true)
    expect(virtual).not.toContain('Record<string')
  })
})
