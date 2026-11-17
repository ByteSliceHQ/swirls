import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createParseCache } from './parse-cache'
import { parse } from './parser'
import { buildWorkspaceResourceIndex } from './workspace/workspace-resources'

const FORM = (name: string) => `form ${name} {\n  label: "${name}"\n}\n`

describe('createParseCache', () => {
  test('returns the same result object for the same text and matches parse()', () => {
    const cache = createParseCache()
    const first = cache.parse(FORM('a'))
    expect(cache.parse(FORM('a'))).toBe(first)
    expect(first).toEqual(parse(FORM('a')))
    expect(cache.stats).toEqual({ hits: 1, misses: 1 })
  })

  test('caches results that have parse errors too', () => {
    const cache = createParseCache()
    const broken = cache.parse('form broken { label: }')
    expect(broken.errors.length).toBeGreaterThan(0)
    expect(cache.parse('form broken { label: }')).toBe(broken)
  })

  test('drops the least recently used entry past maxEntries', () => {
    const cache = createParseCache({ maxEntries: 2 })
    const a = cache.parse(FORM('a'))
    cache.parse(FORM('b'))
    cache.parse(FORM('a')) // a is now the most recently used
    cache.parse(FORM('c')) // evicts b
    expect(cache.size).toBe(2)
    expect(cache.parse(FORM('a'))).toBe(a)
    const missesBefore = cache.stats.misses
    cache.parse(FORM('b'))
    expect(cache.stats.misses).toBe(missesBefore + 1)
  })
})

describe('buildWorkspaceResourceIndex with a parse cache', () => {
  test('a rebuild after one edit parses only the edited file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-parse-cache-'))

    try {
      for (const name of ['a', 'b', 'c', 'd']) {
        fs.writeFileSync(path.join(dir, `${name}.swirls`), FORM(name))
      }

      const cache = createParseCache()
      const build = () => buildWorkspaceResourceIndex({ cwd: dir, parse: cache.parse })

      const cold = build()
      expect([...cold.forms.keys()].sort()).toEqual(['a', 'b', 'c', 'd'])
      expect(cache.stats).toEqual({ hits: 0, misses: 4 })

      fs.writeFileSync(path.join(dir, 'b.swirls'), FORM('renamed'))
      const warm = build()
      expect([...warm.forms.keys()].sort()).toEqual(['a', 'c', 'd', 'renamed'])
      expect(cache.stats).toEqual({ hits: 3, misses: 5 })

      // Same answer as an uncached build.
      expect([...buildWorkspaceResourceIndex({ cwd: dir }).forms.keys()]).toEqual([
        ...warm.forms.keys(),
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
