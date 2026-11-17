import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from './parser'
import { serialize } from './serializer'
import { collectSwirlsFiles } from './workspace/collect'

const FORM_B = 'form b {\n  label: "B"\n}\n'

describe('parser never hangs or throws on malformed input', () => {
  test.each([
    'workflow w { node a { x: [ : ] } }',
    'workflow w { node a { x: [ = ] } }',
    'workflow w { node a { x: [ -> ] } }',
    'workflow w { node a { x: { a: [ } } }',
    'workflow w { node a { x: { a:',
    'workflow w { node a { cases: ["safe", "flagged"\n label: "x" } }',
  ])('%s', (source) => {
    const { errors } = parse(source)
    expect(errors.length).toBeGreaterThan(0)
  })

  test('every prefix of an example parses without throwing', () => {
    const source = fs.readFileSync(
      path.join(import.meta.dir, '../examples/decisions.swirls'),
      'utf8',
    )
    for (let i = 0; i < source.length; i += 7) {
      expect(() => parse(source.slice(0, i))).not.toThrow()
    }
  })
})

describe('nothing is dropped silently', () => {
  test.each([
    ["a single-quoted string", "form a { label: 'single' }\n"],
    ['a stray semicolon', 'form a { label: "A" };\n'],
    ['a # comment', '# not a comment\n'],
  ])('%s is reported and the next block still parses', (_name, head) => {
    const { ast, errors } = parse(head + FORM_B)
    expect(errors.some((e) => e.message.startsWith('Unexpected character'))).toBe(
      true,
    )
    expect(ast.forms.map((f) => f.name)).toContain('b')
  })

  test('a leading byte order mark is ignored', () => {
    const { ast, errors } = parse(`﻿${FORM_B}`)
    expect(errors).toEqual([])
    expect(ast.forms.map((f) => f.name)).toEqual(['b'])
  })

  test.each(['form', 'form f {', 'form f { label: "x"', 'workflow w { node a { type: code'])(
    'truncated input %p reports an error',
    (source) => {
      expect(parse(source).errors.length).toBeGreaterThan(0)
    },
  )
})

describe('serialize output parses back', () => {
  test.each(['decisions.swirls', 'decisions-release.swirls', 'disk.swirls'])(
    'examples/%s',
    (file) => {
      const source = fs.readFileSync(
        path.join(import.meta.dir, '../examples', file),
        'utf8',
      )
      const first = parse(source)
      expect(first.errors).toEqual([])
      const second = parse(serialize(first.ast))
      expect(second.errors).toEqual([])
      const count = (ast: typeof first.ast) => ({
        workflows: ast.workflows.length,
        decisions: (ast.decisions ?? []).length,
        disks: (ast.disk ?? []).length,
      })
      expect(count(second.ast)).toEqual(count(first.ast))
    },
  )
})

describe('shipped .swirls files parse cleanly', () => {
  const roots = [
    path.join(import.meta.dir, '../examples'),
    path.join(import.meta.dir, '../../../cookbook'),
  ]
  const files = roots.flatMap((root) =>
    collectSwirlsFiles({ cwd: root }).map((f) => path.join(root, f)),
  )
  test(`${files.length} files`, () => {
    expect(files.length).toBeGreaterThan(50)
    const failures = files
      .map((f) => ({ f, errors: parse(fs.readFileSync(f, 'utf8')).errors }))
      .filter((r) => r.errors.length > 0)
      .map((r) => `${r.f}: ${r.errors[0]?.message}`)
    expect(failures).toEqual([])
  })
})

describe('serialize is stable', () => {
  const examples = path.join(import.meta.dir, '../examples')
  const files = collectSwirlsFiles({ cwd: examples }).filter(
    (f) => !f.endsWith('.ts.swirls'),
  )

  test(`a second pass changes nothing (${files.length} files)`, () => {
    const unstable: string[] = []
    for (const file of files) {
      const first = parse(fs.readFileSync(path.join(examples, file), 'utf8'))
      if (first.errors.length > 0) {
        continue
      }
      const once = serialize(first.ast)
      const second = parse(once)
      if (second.errors.length > 0 || serialize(second.ast) !== once) {
        unstable.push(file)
      }
    }
    expect(unstable).toEqual([])
  })

  test('embedded code is written back verbatim, at any nesting depth', () => {
    const source = [
      'workflow w {',
      '  root {',
      '    type: code',
      '    code: @ts {',
      '      return `line one',
      '  line two`',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n')
    const once = serialize(parse(source).ast)
    expect(once).toContain('      return `line one\n  line two`\n')
    expect(serialize(parse(once).ast)).toBe(once)
  })
})
