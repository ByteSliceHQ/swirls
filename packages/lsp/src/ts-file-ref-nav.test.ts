import { describe, expect, test } from 'bun:test'
import type { Range } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  getTsFileRefDefinition,
  getTsFileRefDocumentLinks,
} from './ts-file-ref-nav'

const sampleUri = 'file:///project/app.swirls'
const sampleContent = `graph g {
  root {
    type: code
    label: "R"
    code: @ts "./logic.ts.swirls"
  }
}
`

/** Same boundary rules as positionInRange for 0-based LSP ranges from sourceRangeToLspRange. */
function lspPositionInRange(
  line: number,
  character: number,
  r: Range,
): boolean {
  if (line < r.start.line || line > r.end.line) {
    return false
  }
  if (line === r.start.line && character < r.start.character) {
    return false
  }
  if (line === r.end.line && character > r.end.character) {
    return false
  }
  return true
}

describe('getTsFileRefDefinition', () => {
  test('returns target file URI when cursor is on path', () => {
    const doc = TextDocument.create(sampleUri, 'swirls', 1, sampleContent)
    const pos = doc.positionAt(sampleContent.indexOf('logic'))
    const loc = getTsFileRefDefinition(doc, pos, sampleUri)
    expect(loc).not.toBeNull()
    expect(loc?.uri).toContain('logic.ts.swirls')
  })

  test('returns target when cursor is on @ts or opening quote', () => {
    const doc = TextDocument.create(sampleUri, 'swirls', 1, sampleContent)
    const atTs = sampleContent.indexOf('@ts')
    const openQuote = sampleContent.indexOf('"./logic')
    for (const offset of [atTs, atTs + 1, openQuote]) {
      const pos = doc.positionAt(offset)
      const loc = getTsFileRefDefinition(doc, pos, sampleUri)
      expect(loc).not.toBeNull()
      expect(loc?.uri).toContain('logic.ts.swirls')
    }
  })

  test('returns null when cursor is outside path', () => {
    const doc = TextDocument.create(sampleUri, 'swirls', 1, sampleContent)
    const pos = doc.positionAt(sampleContent.indexOf('type:'))
    expect(getTsFileRefDefinition(doc, pos, sampleUri)).toBeNull()
  })
})

describe('getTsFileRefDocumentLinks', () => {
  test('emits one link covering full @ts ref; target resolves path', () => {
    const doc = TextDocument.create(sampleUri, 'swirls', 1, sampleContent)
    const links = getTsFileRefDocumentLinks(doc, sampleUri)
    expect(links).toHaveLength(1)
    const link = links[0]
    expect(link).toBeDefined()
    if (!link) {
      throw new Error('expected document link')
    }
    expect(link.target).toContain('logic.ts.swirls')

    const r = link.range
    const atTs = sampleContent.indexOf('@ts')
    const openQuote = sampleContent.indexOf('"./logic')
    const inPath = sampleContent.indexOf('logic')
    const afterClose = sampleContent.indexOf('.swirls"') + '.swirls'.length

    const check = (offset: number) => {
      const p = doc.positionAt(offset)
      expect(lspPositionInRange(p.line, p.character, r)).toBe(true)
    }
    check(atTs)
    check(openQuote)
    check(inPath)
    check(afterClose)
  })
})
