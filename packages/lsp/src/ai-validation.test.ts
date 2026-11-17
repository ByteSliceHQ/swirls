import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type { NodeDecl } from '@swirls/language'
import { parse } from '@swirls/language'

import { getAiNodeOptionsDiagnostics } from './ai-validation'

const EXAMPLES_DIR = path.join(import.meta.dir, '../../language/examples')

function hasMessage(diags: ReturnType<typeof getAiNodeOptionsDiagnostics>, sub: string): boolean {
  return diags.some((d) => d.message.includes(sub))
}

describe('getAiNodeOptionsDiagnostics', () => {
  test('ai-tasks.swirls AI nodes produce zero diagnostics', () => {
    const p = path.join(EXAMPLES_DIR, 'ai-tasks.swirls')
    const content = fs.readFileSync(p, 'utf8')
    const { ast } = parse(content)
    const nodes = ast.workflows[0]?.nodes
    const diags = getAiNodeOptionsDiagnostics(nodes)
    expect(diags).toEqual([])
  })

  test('AI node with unknown root property produces diagnostic', () => {
    const r = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    }

    const node: NodeDecl = {
      name: 'ai',
      type: 'ai',
      label: 'AI',
      configFields: {
        kind: { kind: 'string', value: 'text', range: r },
        model: { kind: 'string', value: 'gpt-4', range: r },
        prompt: {
          kind: 'ts_block',
          code: 'return "x"',
          range: r,
          innerRange: r,
        },
        unknownKey: { kind: 'string', value: 'x', range: r },
      },
      range: r,
    }

    const diags = getAiNodeOptionsDiagnostics([node])
    expect(hasMessage(diags, 'Unknown property')).toBe(true)
    expect(hasMessage(diags, 'unknownKey')).toBe(true)
  })

  test('AI node without prompt produces diagnostic', () => {
    const r = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    }

    const node: NodeDecl = {
      name: 'ai',
      type: 'ai',
      label: 'AI',
      configFields: {
        kind: { kind: 'string', value: 'text', range: r },
        model: { kind: 'string', value: 'gpt-4', range: r },
      },
      range: r,
    }

    const diags = getAiNodeOptionsDiagnostics([node])
    expect(hasMessage(diags, 'requires "prompt"')).toBe(true)
  })

  test('AI image node with valid options (n, size) produces no option diagnostics', () => {
    const r = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    }

    const node: NodeDecl = {
      name: 'ai',
      type: 'ai',
      label: 'AI',
      configFields: {
        kind: { kind: 'string', value: 'image', range: r },
        model: { kind: 'string', value: 'dall-e', range: r },
        prompt: {
          kind: 'ts_block',
          code: 'return "x"',
          range: r,
          innerRange: r,
        },
        options: {
          kind: 'object',
          value: {
            n: { kind: 'number', value: 1, range: r },
            size: { kind: 'string', value: '1024x1024', range: r },
          },
          range: r,
        },
      },
      range: r,
    }

    const diags = getAiNodeOptionsDiagnostics([node])
    expect(hasMessage(diags, 'Unknown option')).toBe(false)
  })

  test('AI image node with invalid option in options produces diagnostic', () => {
    const r = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    }

    const node: NodeDecl = {
      name: 'ai',
      type: 'ai',
      label: 'AI',
      configFields: {
        kind: { kind: 'string', value: 'image', range: r },
        model: { kind: 'string', value: 'dall-e', range: r },
        prompt: {
          kind: 'ts_block',
          code: 'return "x"',
          range: r,
          innerRange: r,
        },
        options: {
          kind: 'object',
          value: {
            temperature: { kind: 'number', value: 0.5, range: r },
          },
          range: r,
        },
      },
      range: r,
    }

    const diags = getAiNodeOptionsDiagnostics([node])
    expect(hasMessage(diags, 'Unknown option')).toBe(true)
    expect(hasMessage(diags, 'temperature')).toBe(true)
  })
})
