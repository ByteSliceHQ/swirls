import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from '@swirls/language'
import { emptyWorkspaceResourceIndex } from '@swirls/language/workspace'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getCompletions } from '../completions'
import { getDefinition } from '../definition'
import { getDeclarationAtPosition } from '../hover'
import { getReferences } from '../references'
import { createLanguageServiceFromMap, virtualUriForBlock } from './host'
import { buildVirtualTsContent, collectTsBlocks } from './virtual-docs'

const source = readFileSync(
  new URL('../../../language/examples/decisions.swirls', import.meta.url),
  'utf8',
)

test('decision references support navigation, hover and find-references', () => {
  const doc = TextDocument.create(
    'file:///decisions.swirls',
    'swirls',
    1,
    source,
  )
  const ast = parse(source).ast
  const ref = doc.positionAt(
    source.indexOf('decision: support_triage') + 'decision: '.length,
  )
  const declaration = ast.decisions![0]!
  expect(getDefinition(doc, ref, doc.uri)).toMatchObject({
    uri: doc.uri,
    range: { start: { line: declaration.range.start.line - 1 } },
  })
  expect(getDeclarationAtPosition(doc, ref, ast)).toMatchObject({
    type: 'decision',
    decl: { description: expect.stringContaining('support_triage') },
  })
  const references = getReferences(doc, ref, doc.uri, true)
  expect(references).toHaveLength(2)
  expect(references.map((r) => r.range.start.line)).toEqual([
    declaration.range.start.line - 1,
    ref.line,
  ])
  for (const [field, target] of [
    ['secrets: decision_vendor', ast.secrets[0]],
    ['inputSchema: support_request', ast.schemas[0]],
  ] as const) {
    const position = doc.positionAt(
      source.indexOf(field) + field.indexOf(': ') + 2,
    )
    expect(getDefinition(doc, position, doc.uri)).toMatchObject({
      range: { start: { line: target!.range.start.line - 1 } },
    })
  }
})

function diagnostics(text: string) {
  const parsed = parse(text)
  expect(parsed.errors).toEqual([])
  const blocks = collectTsBlocks(parsed.ast)
  const content = new Map(
    blocks.map((b, i) => [
      virtualUriForBlock(String(i)),
      buildVirtualTsContent(b),
    ]),
  )
  const service = createLanguageServiceFromMap(content)
  return blocks.flatMap((_b, i) =>
    service.getSemanticDiagnostics(virtualUriForBlock(String(i))),
  )
}

test('complete triage fixture has valid TypeScript including dynamic models', () => {
  expect(diagnostics(source).map((d) => d.messageText)).toEqual([])
})
test.each([
  [
    'answers.severity.score >= 1.5',
    'answers.severity.missing >= 1.5',
    'missing',
  ],
  [
    'answers.severity.score >= 1.5',
    'answers.urgent.confidence >= 1.5',
    'confidence',
  ],
  [
    'answers.severity.score >= 1.5',
    'answers.department.probabilities.missing >= 1.5',
    'missing',
  ],
  ['model: @ts { return "jev-1.13.0" }', 'model: @ts { return 42 }', 'number'],
])('reports invalid decision/model access', (from, to, message) => {
  expect(
    JSON.stringify(
      diagnostics(source.replace(from, to)).map((d) => d.messageText),
    ),
  ).toContain(message)
})
test('cross-file question IDs and option unions survive workspace resolution', () => {
  const ast = parse(source).ast
  const workspace = emptyWorkspaceResourceIndex()
  workspace.decisionBlocks = new Map(ast.decisions!.map((d) => [d.name, d]))
  workspace.schemaLiterals = new Map([
    [
      'support_request',
      {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    ],
  ])
  ast.decisions = []
  const block = collectTsBlocks(ast, { workspace }).find(
    (b) => b.node.name === 'route',
  )!
  const code = buildVirtualTsContent(block)
  expect(code).toContain('"billing" | "technical" | "other"')
  expect(code).toContain('noul: number')
})
test('editor offers decisions as declarations, node types and references', () => {
  const text = `${source}\nworkflow example {\n root { type: code code: @ts { return {} } }\n node test {\n  type: decision\n  decision: \n }\n}`
  const document = TextDocument.create('file:///test.swirls', 'swirls', 1, text)
  const position = document.positionAt(
    text.lastIndexOf('decision: ') + 'decision: '.length,
  )
  expect(
    getCompletions(document, position).map((item) => item.label),
  ).toContain('support_triage')
})
