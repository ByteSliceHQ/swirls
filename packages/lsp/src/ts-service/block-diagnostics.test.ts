import { beforeEach, describe, expect, test } from 'bun:test'
import { parse } from '@swirls/language'
import {
  blockDiagnosticsStats,
  clearBlockDiagnosticsCache,
  getVirtualDiagnostics,
  toDocumentDiagnostics,
} from './block-diagnostics'
import { buildVirtualTsContent, collectTsBlocks } from './virtual-docs'

function diagnose(source: string) {
  const { ast, errors } = parse(source)
  expect(errors).toEqual([])
  const blocks = collectTsBlocks(ast)
  const virtual = getVirtualDiagnostics(blocks.map(buildVirtualTsContent))
  return blocks.flatMap((block, i) =>
    toDocumentDiagnostics(block, virtual[i] ?? []),
  )
}

const workflow = (body: string) =>
  `workflow w {\n  label: "W"\n  root { type: code code: @ts { ${body} } }\n}\n`

describe('@ts block diagnostics', () => {
  beforeEach(() => {
    clearBlockDiagnosticsCache()
    blockDiagnosticsStats.hits = 0
    blockDiagnosticsStats.misses = 0
  })

  test('a diagnostic in a single-line block lands on the offending token', () => {
    const source = workflow('return nope1')
    const diags = diagnose(source)
    const d = diags.find((x) => x.message.includes('nope1'))
    expect(d).toBeDefined()
    const line = source.split('\n')[d!.range.start.line] ?? ''
    expect(line.slice(d!.range.start.character, d!.range.end.character)).toBe(
      'nope1',
    )
  })

  test('a diagnostic in a multi-line block lands on the offending token', () => {
    const source = `workflow w {\n  label: "W"\n  root {\n    type: code\n    code: @ts {\n      return nope2\n    }\n  }\n}\n`
    const d = diagnose(source).find((x) => x.message.includes('nope2'))
    expect(d).toBeDefined()
    const line = source.split('\n')[d!.range.start.line] ?? ''
    expect(line.slice(d!.range.start.character, d!.range.end.character)).toBe(
      'nope2',
    )
  })

  test('TypeScript syntax errors are reported', () => {
    const diags = diagnose(workflow('const = 5; return 1'))
    expect(diags.length).toBeGreaterThan(0)
  })

  test('an unchanged block is not type-checked again', () => {
    const before = diagnose(workflow('return nope1'))
    expect(blockDiagnosticsStats).toEqual({ hits: 0, misses: 1 })
    const after = diagnose(workflow('return nope1'))
    expect(blockDiagnosticsStats).toEqual({ hits: 1, misses: 1 })
    expect(after).toEqual(before)
  })
})
