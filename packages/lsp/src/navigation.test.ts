import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { getDefinition } from './definition'
import {
  AST_NAV_REF_FIELD_PATTERN,
  NAV_DEFINITION_CASES,
  NAV_REF_ALLOWLIST,
  type NavDefinitionCase,
  type NavRefsConfig,
} from './nav-manifest'
import { lineIndexOf, loadFixture, loadInline, positionAt } from './nav-test-helpers'
import { getReferences } from './references'

const repoRoot = path.join(import.meta.dir, '../../..')
const languageAstDir = path.join(repoRoot, 'packages/language/src')

function collectAstNavRefFields(): Set<string> {
  const fields = new Set<string>()

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(full)
        continue
      }

      if (!entry.name.endsWith('ast.ts')) {
        continue
      }

      const lines = fs.readFileSync(full, 'utf8').split('\n')

      for (const line of lines) {
        const match = line.match(AST_NAV_REF_FIELD_PATTERN)

        if (match) {
          const name = match[0].trim().replace(/\??:$/, '')
          fields.add(name)
        }
      }
    }
  }

  walk(languageAstDir)
  return fields
}

function structuralCoveredFields(): Set<string> {
  const covered = new Set<string>(NAV_REF_ALLOWLIST)
  covered.add('range')

  for (const c of NAV_DEFINITION_CASES) {
    if (c.astField) {
      covered.add(c.astField)
    }
  }

  return covered
}

function resolveDefLine(content: string, c: NavDefinitionCase): number {
  if (c.expectedDefLine !== undefined) {
    return c.expectedDefLine
  }

  if (!c.expectedDefSubstring) {
    throw new Error(`case ${c.name}: missing expectedDefLine or expectedDefSubstring`)
  }

  return lineIndexOf(content, c.expectedDefSubstring)
}

function resolveRefLine(content: string, c: NavDefinitionCase): number {
  if (c.line !== undefined) {
    return c.line
  }

  if (!c.refSubstring) {
    throw new Error(`case ${c.name}: missing line or refSubstring`)
  }

  return lineIndexOf(content, c.refSubstring)
}

function resolveMustIncludeLines(
  content: string,
  c: NavDefinitionCase,
  refs: NavRefsConfig,
): number[] {
  if (refs.mustIncludeLines?.length) {
    return refs.mustIncludeLines
  }

  if (refs.resolveMustIncludeFromContent && c.name === 'agent-disks') {
    return [
      lineIndexOf(content, 'disk shared_d'),
      lineIndexOf(content, 'disks: [shared_d]'),
      lineIndexOf(content, 'disk: shared_d'),
    ]
  }

  return []
}

function loadCaseDocument(c: NavDefinitionCase) {
  const uri =
    c.uri ?? (c.fixture ? `file:///${c.fixture.split('/').pop()}` : 'file:///inline.swirls')

  if (c.fixture) {
    return { ...loadFixture(c.fixture, uri), uri }
  }

  const content = c.inline!
  return { doc: loadInline(content, uri), content, uri }
}

describe('navigation structural coverage', () => {
  test('every AST ref-range field is allowlisted or covered by a manifest astField', () => {
    const astFields = collectAstNavRefFields()
    const covered = structuralCoveredFields()
    const missing = [...astFields].filter((field) => !covered.has(field)).sort()
    expect(missing).toEqual([])
  })
})

describe('getDefinition navigation manifest', () => {
  for (const c of NAV_DEFINITION_CASES) {
    if (!c.refSubstring) {
      continue
    }

    const run = c.knownGap ? test.failing : test

    run(c.name, () => {
      const { doc, content, uri } = loadCaseDocument(c)
      const refLine = resolveRefLine(content, c)
      const pos = positionAt(doc, refLine, c.refSubstring!)
      const loc = getDefinition(doc, pos, uri)

      expect(loc).not.toBeNull()
      const single = Array.isArray(loc) ? loc[0] : loc
      expect(single?.uri).toBe(c.expectedDefUri ?? uri)
      expect(single?.range.start.line).toBe(resolveDefLine(content, c))
    })
  }
})

describe('getReferences navigation manifest', () => {
  for (const c of NAV_DEFINITION_CASES) {
    if (!c.refs) {
      continue
    }

    const run = c.knownGap ? test.failing : test

    run(`${c.name} references`, () => {
      const { doc, content, uri } = loadCaseDocument(c)
      const refs = c.refs!
      const refSubstring = refs.refSubstring ?? c.refSubstring!

      const refLine = refs.refSubstring
        ? lineIndexOf(content, refSubstring)
        : resolveRefLine(content, c)

      const pos = positionAt(doc, refLine, refSubstring)
      const locs = getReferences(doc, pos, uri, refs.includeDeclaration ?? true)

      expect(locs.length).toBeGreaterThanOrEqual(refs.minLocations)

      for (const line of resolveMustIncludeLines(content, c, refs)) {
        expect(locs.some((l) => l.range.start.line === line)).toBe(true)
      }
    })
  }
})
