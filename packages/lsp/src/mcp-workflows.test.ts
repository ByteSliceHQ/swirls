import { describe, expect, test } from 'bun:test'
import { getCompletions } from './completions'
import { getDefinition } from './definition'
import {
  lineIndexOf,
  loadFixture,
  loadInline,
  positionAt,
} from './nav-test-helpers'
import { getReferences } from './references'

const { doc, content, uri } = loadFixture(
  'packages/language/examples/mcp-workflows.swirls',
)
const name = 'prepare_quote'
const declarationLine = lineIndexOf(content, `workflow ${name} {`)
const publicationLine = lineIndexOf(content, `workflows: [${name}]`)
const grantLine = lineIndexOf(content, `allow sales -> workflow ${name}`)

describe('MCP workflow editor support', () => {
  test.each([
    publicationLine,
    grantLine,
  ])('navigates workflow reference on line %s', (line) => {
    const result = getDefinition(doc, positionAt(doc, line, name), uri)
    const location = Array.isArray(result) ? result[0] : result
    expect(location?.uri).toBe(uri)
    expect(location?.range.start.line).toBe(declarationLine)
  })

  test('finds both channel publications and direct policy grants', () => {
    const references = getReferences(
      doc,
      positionAt(doc, declarationLine, name),
      uri,
      false,
    )
    expect(
      references.map((reference) => reference.range.start.line).sort(),
    ).toEqual([publicationLine, grantLine].sort())
  })

  test.each([
    '  workflows: [pre',
    '  allow sales -> workflow pre',
  ])('completes workflow names in %s', (prefix) => {
    const block = prefix.includes('workflows:') ? 'channel more {' : 'policy {'
    const text = `${content}\n${block}\n${prefix}`
    const partial = loadInline(text)
    const items = getCompletions(partial, partial.positionAt(text.length))
    expect(items.map((item) => item.label)).toContain(name)
  })
})
