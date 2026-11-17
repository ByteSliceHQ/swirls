import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from '@swirls/language'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  buildHoverContent,
  getDeclarationAtPosition,
  getHarnessHover,
  getWordAtPosition,
  HARNESS_BLOCK_HOVER,
  markdownTsQuickInfo,
} from './hover'

const EXAMPLES_DIR = path.join(import.meta.dir, '../../language/examples')
const STREAM_EXAMPLE = path.join(EXAMPLES_DIR, 'stream.swirls')

function loadMinimal(): {
  content: string
  doc: TextDocument
  ast: ReturnType<typeof parse>['ast']
} {
  const p = path.join(EXAMPLES_DIR, 'minimal.swirls')
  const content = fs.readFileSync(p, 'utf8')

  const doc = TextDocument.create(
    'file:///minimal.swirls',
    'swirls',
    1,
    content,
  )

  const { ast } = parse(content)
  return { content, doc, ast }
}

describe('getWordAtPosition', () => {
  test('returns word at start of identifier', () => {
    const doc = TextDocument.create('file:///x', 'swirls', 1, 'form contact {')
    expect(getWordAtPosition(doc, { line: 0, character: 0 })).toBe('form')
    expect(getWordAtPosition(doc, { line: 0, character: 5 })).toBe('contact')
  })

  test('returns word in middle of identifier', () => {
    const doc = TextDocument.create('file:///x', 'swirls', 1, 'process_contact')
    expect(getWordAtPosition(doc, { line: 0, character: 7 })).toBe(
      'process_contact',
    )
  })

  test('returns null when not on any word', () => {
    const doc = TextDocument.create('file:///x', 'swirls', 1, '   \n')
    expect(getWordAtPosition(doc, { line: 0, character: 1 })).toBeNull()
  })

  test('returns null on space between tokens', () => {
    const doc = TextDocument.create('file:///x', 'swirls', 1, 'form: x')
    expect(getWordAtPosition(doc, { line: 0, character: 5 })).toBeNull()
  })
})

describe('getDeclarationAtPosition', () => {
  test('resolves form declaration on form keyword or name', () => {
    const { doc, ast } = loadMinimal()
    const formLine = 3
    const declForm = getDeclarationAtPosition(
      doc,
      { line: formLine, character: 0 },
      ast,
    )
    expect(declForm).not.toBeNull()
    expect(declForm?.type).toBe('form')
    if (declForm?.type === 'form') {
      expect(declForm.decl.name).toBe('minimal_contact')
    }
    const declName = getDeclarationAtPosition(
      doc,
      { line: formLine, character: 5 },
      ast,
    )
    expect(declName).not.toBeNull()
    expect(declName?.type).toBe('form')
    if (declName?.type === 'form') {
      expect(declName.decl.name).toBe('minimal_contact')
    }
  })

  test('resolves graph declaration', () => {
    const { doc, ast } = loadMinimal()
    const graphLine = 19
    const decl = getDeclarationAtPosition(
      doc,
      { line: graphLine, character: 6 },
      ast,
    )
    expect(decl).not.toBeNull()
    expect(decl?.type).toBe('graph')
    if (decl?.type === 'graph') {
      expect(decl.decl.name).toBe('process_contact')
    }
  })

  test('resolves stream declaration', () => {
    const content = fs.readFileSync(STREAM_EXAMPLE, 'utf8')
    const { ast } = parse(content)
    const doc = TextDocument.create(
      'file:///stream.swirls',
      'swirls',
      1,
      content,
    )
    const streamLine = content
      .split('\n')
      .findIndex((l) => l.includes('stream store_topic_tokens'))
    expect(streamLine).toBeGreaterThanOrEqual(0)
    const decl = getDeclarationAtPosition(
      doc,
      { line: streamLine, character: 10 },
      ast,
    )
    expect(decl).not.toBeNull()
    const d = decl!
    expect(d.type).toBe('stream')
    if (d.type === 'stream') {
      expect(d.decl.name).toBe('store_topic_tokens')
    }
  })

  test('resolves node declaration inside graph', () => {
    const { doc, ast } = loadMinimal()
    const nodeLine = 23
    const decl = getDeclarationAtPosition(
      doc,
      { line: nodeLine, character: 6 },
      ast,
    )
    expect(decl).not.toBeNull()
    const d = decl!
    expect(d.type).toBe('node')
    if (d.type === 'node') {
      expect(d.decl.name).toBe('root')
      expect(d.graph.name).toBe('process_contact')
    }
  })

  test('resolves trigger declaration', () => {
    const { doc, ast } = loadMinimal()
    const triggerLine = 67
    const decl = getDeclarationAtPosition(
      doc,
      { line: triggerLine, character: 8 },
      ast,
    )
    expect(decl).not.toBeNull()
    expect(decl?.type).toBe('trigger')
    if (decl?.type === 'trigger') {
      expect(decl.decl.name).toBe('on_minimal_contact')
    }
  })

  test('resolves form when hovering on resource name in trigger binding', () => {
    const { doc, ast } = loadMinimal()
    const bindingLine = 68
    const lineText = doc.getText({
      start: { line: bindingLine, character: 0 },
      end: { line: bindingLine, character: 100 },
    })
    const resourceIndex = lineText.indexOf('minimal_contact')
    expect(resourceIndex).toBeGreaterThanOrEqual(0)
    const decl = getDeclarationAtPosition(
      doc,
      { line: bindingLine, character: resourceIndex + 4 },
      ast,
    )
    expect(decl).not.toBeNull()
    expect(decl?.type).toBe('form')
    if (decl?.type === 'form') {
      expect(decl.decl.name).toBe('minimal_contact')
    }
  })

  test('resolves graph when hovering on graph name in trigger binding', () => {
    const { doc, ast } = loadMinimal()
    const bindingLine = 68
    const lineText = doc.getText({
      start: { line: bindingLine, character: 0 },
      end: { line: bindingLine, character: 100 },
    })
    const graphIndex = lineText.indexOf('process_contact')
    expect(graphIndex).toBeGreaterThanOrEqual(0)
    const decl = getDeclarationAtPosition(
      doc,
      { line: bindingLine, character: graphIndex + 4 },
      ast,
    )
    expect(decl).not.toBeNull()
    expect(decl?.type).toBe('graph')
    if (decl?.type === 'graph') {
      expect(decl.decl.name).toBe('process_contact')
    }
  })

  test('returns null on whitespace', () => {
    const { doc, ast } = loadMinimal()
    const decl = getDeclarationAtPosition(doc, { line: 0, character: 0 }, ast)
    expect(decl).toBeNull()
  })
})

describe('buildHoverContent', () => {
  test('returns description when present', () => {
    const content = buildHoverContent({ description: 'A form' })
    expect(content).toBe('A form')
  })

  test('returns empty string when description absent', () => {
    const content = buildHoverContent({})
    expect(content).toBe('')
  })

  test('trims description', () => {
    const content = buildHoverContent({ description: '  text  ' })
    expect(content).toBe('text')
  })
})

describe('markdownTsQuickInfo', () => {
  test('wraps display in typescript fence', () => {
    expect(markdownTsQuickInfo('(property) x: string', '')).toBe(
      '```typescript\n(property) x: string\n```',
    )
  })

  test('appends documentation after fenced block', () => {
    expect(markdownTsQuickInfo('let x: number', 'A variable.')).toBe(
      '```typescript\nlet x: number\n```\n\nA variable.',
    )
  })
})

describe('getHarnessHover', () => {
  const content = `computer codex_box {
  harness: {
    type: coding
    provider: codex
  }
  resources: { cpus: 2 }
}
`
  const doc = TextDocument.create('file:///h.swirls', 'swirls', 1, content)
  const { ast, errors } = parse(content)

  test('parses cleanly', () => {
    expect(errors).toEqual([])
  })

  test('harness key shows the block summary', () => {
    const hover = getHarnessHover(doc, { line: 1, character: 4 }, ast)
    expect(hover?.value).toBe(HARNESS_BLOCK_HOVER)
    expect(hover?.range).toEqual({
      start: { line: 1, character: 2 },
      end: { line: 1, character: 9 },
    })
  })

  test('provider value names the Flox package', () => {
    const hover = getHarnessHover(doc, { line: 3, character: 16 }, ast)
    expect(hover?.value).toContain('**codex** harness')
    expect(hover?.value).toContain('`codex`')
    expect(hover?.range).toEqual({
      start: { line: 3, character: 14 },
      end: { line: 3, character: 19 },
    })
  })

  test('type value describes the coding harness', () => {
    const hover = getHarnessHover(doc, { line: 2, character: 11 }, ast)
    expect(hover?.value).toContain('**coding** harness')
  })

  test('keys list the allowed values', () => {
    expect(
      getHarnessHover(doc, { line: 3, character: 6 }, ast)?.value,
    ).toContain('`claude`, `codex`, `pi`, `hermes`')
    expect(
      getHarnessHover(doc, { line: 2, character: 5 }, ast)?.value,
    ).toContain('`coding`')
  })

  test('positions outside the harness block return null', () => {
    expect(getHarnessHover(doc, { line: 5, character: 4 }, ast)).toBeNull()
    expect(getHarnessHover(doc, { line: 0, character: 2 }, ast)).toBeNull()
  })
})
