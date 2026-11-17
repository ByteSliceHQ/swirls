import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { tokenize } from './lexer'

const EXAMPLES_DIR = path.join(import.meta.dir, '../examples')
const FIXTURES_DIR = path.join(import.meta.dir, '__fixtures__')

function getTokenKinds(source: string): string[] {
  return tokenize(source).map((t) => t.kind)
}

describe('tokenize', () => {
  describe('token kinds', () => {
    test('keywords', () => {
      const tokens = tokenize(
        'form webhook schedule graph trigger secret auth node type label postgres disk select insert update delete params table',
      )
      const kinds = tokens.map((t) => t.kind)
      expect(kinds.every((k) => k === 'keyword')).toBe(true)
      expect(tokens.map((t) => t.value)).toEqual([
        'form',
        'webhook',
        'schedule',
        'graph',
        'trigger',
        'secret',
        'auth',
        'node',
        'type',
        'label',
        'postgres',
        'disk',
        'select',
        'insert',
        'update',
        'delete',
        'params',
        'table',
      ])
    })

    test('identifiers', () => {
      const tokens = tokenize('foo bar_baz Qux1')
      expect(tokens.map((t) => ({ kind: t.kind, value: t.value }))).toEqual([
        { kind: 'identifier', value: 'foo' },
        { kind: 'identifier', value: 'bar_baz' },
        { kind: 'identifier', value: 'Qux1' },
      ])
    })

    test('strings', () => {
      const tokens = tokenize('"hello" "world"')
      expect(tokens.length).toBe(2)
      expect(tokens[0]?.kind).toBe('string')
      expect(tokens[0]?.value).toBe('hello')
      expect(tokens[1]?.kind).toBe('string')
      expect(tokens[1]?.value).toBe('world')
    })

    test('slash-prefixed path literals', () => {
      const tokens = tokenize('path: /chat.postMessage')
      expect(tokens.map((t) => ({ kind: t.kind, value: t.value }))).toEqual([
        { kind: 'identifier', value: 'path' },
        { kind: 'colon', value: ':' },
        { kind: 'string', value: '/chat.postMessage' },
      ])
    })

    test('numbers', () => {
      const tokens = tokenize('1 42 3.14')
      expect(tokens.map((t) => ({ kind: t.kind, value: t.value }))).toEqual([
        { kind: 'number', value: 1 },
        { kind: 'number', value: 42 },
        { kind: 'number', value: 3.14 },
      ])
    })

    test('booleans', () => {
      const tokens = tokenize('true false')
      expect(tokens[0]?.kind).toBe('boolean')
      expect(tokens[0]?.value).toBe(true)
      expect(tokens[1]?.kind).toBe('boolean')
      expect(tokens[1]?.value).toBe(false)
    })

    test('braces and brackets', () => {
      const _tokens = tokenize('{ } [ ]')
      expect(getTokenKinds('{ } [ ]')).toEqual([
        'lbrace',
        'rbrace',
        'lbracket',
        'rbracket',
      ])
    })

    test('colon and comma', () => {
      expect(getTokenKinds(': ,')).toEqual(['colon', 'comma'])
    })

    test('arrow', () => {
      const _tokens = tokenize('a -> b')
      expect(getTokenKinds('a -> b')).toEqual([
        'identifier',
        'arrow',
        'identifier',
      ])
    })

    test('labeled arrow', () => {
      const tokens = tokenize('a -["label"]-> b')
      expect(tokens.some((t) => t.kind === 'labeled_arrow')).toBe(true)
      const labeled = tokens.find((t) => t.kind === 'labeled_arrow')
      expect(labeled?.value).toBe('label')
    })

    test('block comment', () => {
      const tokens = tokenize('/* comment */ form')
      expect(tokens[0]?.kind).toBe('block_comment')
      expect(tokens[0]?.value).toBe('comment')
      expect(tokens[1]?.kind).toBe('keyword')
      expect(tokens[1]?.value).toBe('form')
    })
  })

  describe('source positions', () => {
    test('line and column advance across multiple lines', () => {
      const source = 'form x\n  label: "y"\n'
      const tokens = tokenize(source)
      const first = tokens[0]!
      expect(first.range.start.line).toBe(1)
      expect(first.range.start.column).toBe(1)
      expect(first.range.start.offset).toBe(0)
      const labelTok = tokens.find(
        (t) => t.kind === 'keyword' && t.value === 'label',
      )!
      expect(labelTok.range.start.line).toBe(2)
      expect(labelTok.range.start.column).toBe(3)
    })

    test('offset increases sequentially', () => {
      const source = 'form foo'
      const tokens = tokenize(source)
      expect(tokens[0]?.range.start.offset).toBe(0)
      expect(tokens[0]?.range.end.offset).toBe(4)
      expect(tokens[1]?.range.start.offset).toBe(5)
    })
  })

  describe('@lang blocks', () => {
    test('ts block has fencedContent and fencedLang', () => {
      const source = 'code: @ts {\nconst x = 1\n}\n'
      const tokens = tokenize(source)
      const fenced = tokens.find(
        (t) => t.kind === 'fenced_block' && t.fencedLang === 'ts',
      )
      expect(fenced).toBeDefined()
      expect(fenced?.value).toBe('@ts')
      expect(fenced?.fencedLang).toBe('ts')
      expect(fenced?.fencedContent?.trim()).toBe('const x = 1')
      expect(fenced?.fencedContentRange).toBeDefined()
    })

    test('ts block with nested object literal in body', () => {
      const source =
        'code: @ts {\nconst email = ""\nreturn { email: email.toLowerCase() }\n}\n'
      const tokens = tokenize(source)
      const fenced = tokens.find((t) => t.kind === 'fenced_block')
      expect(fenced?.fencedContent?.trim()).toBe(
        'const email = ""\nreturn { email: email.toLowerCase() }',
      )
    })

    test('ts block with template literal and ${}', () => {
      const source = 'x: @ts { return `Bearer ${context.x}` }\n'
      const tokens = tokenize(source)
      const fenced = tokens.find((t) => t.kind === 'fenced_block')
      expect(fenced?.fencedContent?.trim()).toBe('return `Bearer ${context.x}`')
    })

    test('@ts path ref token', () => {
      const source = 'code: @ts "./handlers/entry.ts.swirls"\n'
      const tokens = tokenize(source)
      const ref = tokens.find((t) => t.kind === 'ts_path_ref')
      expect(ref).toBeDefined()
      expect(ref?.value).toBe('./handlers/entry.ts.swirls')
      expect(ref?.pathInnerRange?.start.column).toBe(12)
    })

    test('json block', () => {
      const source = 'schema: @json {{"a": 1}}\n'
      const tokens = tokenize(source)
      const fenced = tokens.find(
        (t) => t.kind === 'fenced_block' && t.fencedLang === 'json',
      )
      expect(fenced).toBeDefined()
      expect(fenced?.value).toBe('@json')
      expect(fenced?.fencedLang).toBe('json')
      expect(fenced?.fencedContent?.trim()).toBe('{"a": 1}')
    })

    test('sql block', () => {
      const source = 'query: @sql {SELECT * FROM t}\n'
      const tokens = tokenize(source)
      const fenced = tokens.find(
        (t) => t.kind === 'fenced_block' && t.fencedLang === 'sql',
      )
      expect(fenced).toBeDefined()
      expect(fenced?.value).toBe('@sql')
      expect(fenced?.fencedContent?.trim()).toBe('SELECT * FROM t')
    })

    test('@ ts { } allows horizontal space after @', () => {
      const tokens = tokenize('@ ts { a }')
      const fenced = tokens.find((t) => t.kind === 'fenced_block')
      expect(fenced?.fencedContent?.trim()).toBe('a')
    })
  })

  describe('string escapes', () => {
    test('escape double quote', () => {
      const tokens = tokenize('"say \\"hi\\""')
      expect(tokens[0]?.kind).toBe('string')
      expect(tokens[0]?.value).toBe('say "hi"')
    })

    test('escape backslash', () => {
      const tokens = tokenize('"\\\\"')
      expect(tokens[0]?.kind).toBe('string')
      expect(tokens[0]?.value).toBe('\\')
    })

    test('escape n', () => {
      const tokens = tokenize('"a\\nb"')
      expect(tokens[0]?.kind).toBe('string')
      expect(tokens[0]?.value).toBe('a\nb')
    })

    test('escape t', () => {
      const tokens = tokenize('"a\\tb"')
      expect(tokens[0]?.kind).toBe('string')
      expect(tokens[0]?.value).toBe('a\tb')
    })
  })

  describe('comments', () => {
    test('line comments are skipped (not emitted as tokens)', () => {
      const tokens = tokenize('// comment\nform x')
      const kinds = tokens.map((t) => t.kind)
      expect(kinds).not.toContain('block_comment')
      expect(
        tokens.some((t) => t.kind === 'keyword' && t.value === 'form'),
      ).toBe(true)
    })

    test('block comment is emitted as single token', () => {
      const tokens = tokenize('/* doc */ graph g')
      expect(tokens[0]?.kind).toBe('block_comment')
      expect((tokens[0]?.value as string).trim()).toBe('doc')
    })
  })

  describe('edge cases', () => {
    test('empty input returns empty array', () => {
      expect(tokenize('')).toEqual([])
    })

    test('whitespace-only returns empty array', () => {
      expect(tokenize('   \n\t  ')).toEqual([])
    })

    test('consecutive arrows', () => {
      const tokens = tokenize('a -> b -> c')
      const arrows = tokens.filter((t) => t.kind === 'arrow')
      expect(arrows.length).toBe(2)
    })

    test('unterminated @ts block returns fenced_block with content to end', () => {
      const source = '@ts { code only'
      const tokens = tokenize(source)
      const fenced = tokens.find((t) => t.kind === 'fenced_block')
      expect(fenced).toBeDefined()
      expect(fenced?.fencedContent).toBeDefined()
      expect(fenced?.fencedContent).toContain('code only')
    })
  })

  describe('example files', () => {
    const exampleFiles = [
      'minimal.swirls',
      'contact-form-workflow.swirls',
      'webhook-and-schedule.swirls',
      'review-workflow.swirls',
      'ai-tasks.swirls',
      'switch-routing.swirls',
      'subgraph-workflow.swirls',
    ]

    for (const file of exampleFiles) {
      test(`${file} tokenizes without throwing and produces tokens`, () => {
        const filePath = path.join(EXAMPLES_DIR, file)
        if (!fs.existsSync(filePath)) {
          console.warn(`Skipping ${file}: not found`)
          return
        }
        const source = fs.readFileSync(filePath, 'utf8')
        const tokens = tokenize(source)
        expect(Array.isArray(tokens)).toBe(true)
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i]!
          expect(t).not.toBeNull()
          expect(t.kind).toBeDefined()
          expect(t.range).toBeDefined()
          expect(t.range.start.line).toBeGreaterThanOrEqual(1)
          expect(t.range.start.column).toBeGreaterThanOrEqual(1)
        }
      })
    }
  })

  describe('fixture files', () => {
    test('valid-full.swirls tokenizes', () => {
      const filePath = path.join(FIXTURES_DIR, 'valid-full.swirls')
      const source = fs.readFileSync(filePath, 'utf8')
      const tokens = tokenize(source)
      expect(tokens.length).toBeGreaterThan(0)
    })

    test('edge-cases.swirls tokenizes', () => {
      const filePath = path.join(FIXTURES_DIR, 'edge-cases.swirls')
      const source = fs.readFileSync(filePath, 'utf8')
      const tokens = tokenize(source)
      expect(tokens.length).toBeGreaterThan(0)
    })
  })
})
