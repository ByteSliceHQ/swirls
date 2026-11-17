import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { TextDocument } from 'vscode-languageserver-textdocument'

import { getReferences } from './references'

const EXAMPLES_DIR = path.join(import.meta.dir, '../../language/examples')
const URI = 'file:///switch-routing.swirls'

function loadSwitchRouting(): TextDocument {
  const p = path.join(EXAMPLES_DIR, 'switch-routing.swirls')
  const content = fs.readFileSync(p, 'utf8')
  return TextDocument.create(URI, 'swirls', 1, content)
}

describe('getReferences', () => {
  test('node root: includes definition and edge when includeDeclaration true', () => {
    const doc = loadSwitchRouting()
    const rootDefLine = 20

    const lineText = doc.getText({
      start: { line: rootDefLine, character: 0 },
      end: { line: rootDefLine, character: 80 },
    })

    const rootIndex = lineText.indexOf('root')
    expect(rootIndex).toBeGreaterThanOrEqual(0)
    const locs = getReferences(doc, { line: rootDefLine, character: rootIndex + 2 }, URI, true)
    expect(locs.length).toBeGreaterThanOrEqual(2)
    const defCount = locs.filter((l) => l.range.start.line === rootDefLine).length
    expect(defCount).toBe(1)
    const edgeLocs = locs.filter((l) => l.range.start.line === 107)
    expect(edgeLocs.length).toBe(1)
  })

  test('node root: with includeDeclaration false excludes definition', () => {
    const doc = loadSwitchRouting()
    const rootDefLine = 20

    const lineText = doc.getText({
      start: { line: rootDefLine, character: 0 },
      end: { line: rootDefLine, character: 80 },
    })

    const rootIndex = lineText.indexOf('root')
    const locs = getReferences(doc, { line: rootDefLine, character: rootIndex }, URI, false)
    const hasDef = locs.some((l) => l.range.start.line === rootDefLine)
    expect(hasDef).toBe(false)
    expect(locs.length).toBe(1)
  })

  test('node classify: includes definition and all edges using it', () => {
    const doc = loadSwitchRouting()
    const classifyDefLine = 58

    const lineText = doc.getText({
      start: { line: classifyDefLine, character: 0 },
      end: { line: classifyDefLine, character: 80 },
    })

    const classifyIndex = lineText.indexOf('classify')
    expect(classifyIndex).toBeGreaterThanOrEqual(0)
    const locs = getReferences(doc, { line: classifyDefLine, character: classifyIndex }, URI, true)
    expect(locs.length).toBeGreaterThanOrEqual(2)
    const defCount = locs.filter((l) => l.range.start.line === classifyDefLine).length
    expect(defCount).toBe(1)
  })

  test('form with includeDeclaration returns single location', () => {
    const doc = loadSwitchRouting()
    const locs = getReferences(doc, { line: 0, character: 5 }, URI, true)
    expect(locs.length).toBe(1)
    expect(locs[0]?.range.start.line).toBe(0)
  })

  test('returns empty array when not on a symbol', () => {
    const doc = loadSwitchRouting()
    const locs = getReferences(doc, { line: 1, character: 0 }, URI, true)
    expect(locs).toEqual([])
  })

  describe('graph name in graph node (subgraph)', () => {
    const subgraphPath = path.join(EXAMPLES_DIR, 'subgraph-workflow.swirls')
    const subgraphUri = 'file:///subgraph-workflow.swirls'

    function loadSubgraph(): TextDocument {
      const content = fs.readFileSync(subgraphPath, 'utf8')
      return TextDocument.create(subgraphUri, 'swirls', 1, content)
    }

    test('graph: helper_graph with includeDeclaration true includes definition and graph node reference', () => {
      const doc = loadSubgraph()
      const graphNodeConfigLine = 61

      const lineText = doc.getText({
        start: { line: graphNodeConfigLine, character: 0 },
        end: { line: graphNodeConfigLine, character: 80 },
      })

      const helperGraphIndex = lineText.indexOf('helper_graph')
      expect(helperGraphIndex).toBeGreaterThanOrEqual(0)

      const locs = getReferences(
        doc,
        { line: graphNodeConfigLine, character: helperGraphIndex },
        subgraphUri,
        true,
      )

      expect(locs.length).toBeGreaterThanOrEqual(2)
      const helperGraphDefLine = 27
      const defLoc = locs.find((l) => l.range.start.line === helperGraphDefLine)
      expect(defLoc).toBeDefined()
      const refInNodeConfig = locs.find((l) => l.range.start.line === graphNodeConfigLine)
      expect(refInNodeConfig).toBeDefined()
    })

    test('graph: helper_graph with includeDeclaration false excludes definition', () => {
      const doc = loadSubgraph()
      const graphNodeConfigLine = 61

      const lineText = doc.getText({
        start: { line: graphNodeConfigLine, character: 0 },
        end: { line: graphNodeConfigLine, character: 80 },
      })

      const helperGraphIndex = lineText.indexOf('helper_graph')

      const locs = getReferences(
        doc,
        { line: graphNodeConfigLine, character: helperGraphIndex },
        subgraphUri,
        false,
      )

      const helperGraphDefLine = 27
      const hasDef = locs.some((l) => l.range.start.line === helperGraphDefLine)
      expect(hasDef).toBe(false)
      expect(locs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('agent back-references from usage site', () => {
    const uri = 'file:///slack-team-orchestrator.swirls'
    const p = path.join(EXAMPLES_DIR, 'slack-team-orchestrator.swirls')
    const content = fs.readFileSync(p, 'utf8')
    const doc = TextDocument.create(uri, 'swirls', 1, content)

    test('find references on channel agent: includes agent declaration and both channels', () => {
      const line = 36

      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })

      const idx = lineText.indexOf('slack_orchestrator')
      expect(idx).toBeGreaterThanOrEqual(0)
      const locs = getReferences(doc, { line, character: idx }, uri, true)
      expect(locs.length).toBeGreaterThanOrEqual(3)
      const agentDefLine = 16
      expect(locs.some((l) => l.range.start.line === agentDefLine)).toBe(true)
      expect(locs.some((l) => l.range.start.line === 36)).toBe(true)
      expect(locs.some((l) => l.range.start.line === 44)).toBe(true)
    })
  })
})
