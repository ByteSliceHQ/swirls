import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { TextDocument } from 'vscode-languageserver-textdocument'

import { getBlockContext, getCompletions } from './completions'

const AI_TASKS_PATH = path.join(import.meta.dir, '../../language/examples/ai-tasks.swirls')

describe('getBlockContext', () => {
  test('search nodes offer provider selection in property completions', () => {
    const text = 'workflow g {\n  node find {\n    type: search\n    \n  }\n}\n'
    const doc = TextDocument.create('file:///test.swirls', 'swirls', 1, text)

    const provider = getCompletions(doc, { line: 3, character: 4 }).find(
      (item) => item.label === 'provider',
    )

    expect(provider?.detail).toContain('firecrawl | telem')
  })

  test('returns null outside all blocks', () => {
    const text = 'version: 1\n\n'
    expect(getBlockContext(text, 0)).toBe(null)
    expect(getBlockContext(text, 10)).toBe(null)
  })

  test('returns form inside form block', () => {
    const text = 'form contact {\n  label: "x"\n}\n'
    expect(getBlockContext(text, 15)).toBe('form')
    expect(getBlockContext(text, 25)).toBe('form')
  })

  test('returns graph inside graph block', () => {
    const text = 'graph g {\n  label: "G"\n}\n'
    expect(getBlockContext(text, 12)).toBe('graph')
    expect(getBlockContext(text, 22)).toBe('graph')
  })

  test('returns node inside node block', () => {
    const text = 'graph g {\n  node n {\n    type: code\n  }\n}\n'
    const nodeBody = text.indexOf('type: code')
    expect(getBlockContext(text, nodeBody)).toBe('node')
  })

  test('returns root inside root block', () => {
    const text = 'graph g {\n  root {\n    type: code\n  }\n}\n'
    const rootBody = text.indexOf('type: code')
    expect(getBlockContext(text, rootBody)).toBe('root')
  })

  test('returns flow inside flow block', () => {
    const text = 'graph g {\n  flow {\n    a -> b\n  }\n}\n'
    const flowBody = text.indexOf('a -> b')
    expect(getBlockContext(text, flowBody)).toBe('flow')
  })

  test('returns stream inside top-level stream block', () => {
    const text =
      'stream my_stream {\n  label: "S"\n  graph: g\n  version: v1\n  versions: {\n    v1 { schema: @json { {} } prepare: @ts { return {} } }\n  }\n}\n'

    const inside = text.indexOf('graph:')
    expect(getBlockContext(text, inside)).toBe('stream')
  })
})

describe('getCompletions', () => {
  function createDoc(content: string) {
    return TextDocument.create('file:///test.swirls', 'swirls', 1, content)
  }

  test('empty line at top level returns no completions', () => {
    const doc = createDoc('version: 1\n\n')
    const items = getCompletions(doc, { line: 1, character: 0 })
    expect(items).toEqual([])
  })

  test('inside graph body on empty line returns graph-level keywords', () => {
    const doc = createDoc('graph g {\n  \n}\n')
    const items = getCompletions(doc, { line: 1, character: 2 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('node')
    expect(labels).toContain('flow')
    expect(labels).toContain('label')
    expect(labels).toContain('concurrency')
  })

  test('inside form body on empty line returns form properties only', () => {
    const doc = createDoc('form f {\n  \n}\n')
    const items = getCompletions(doc, { line: 1, character: 2 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('label')
    expect(labels).toContain('schema')
    expect(labels).not.toContain('node')
    expect(labels).not.toContain('flow')
  })

  test('inside stream body on empty line returns stream properties', () => {
    const doc = createDoc('stream s {\n  \n}\n')
    const items = getCompletions(doc, { line: 1, character: 2 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('graph')
    expect(labels).toContain('version')
    expect(labels).toContain('versions')
    expect(labels).not.toContain('node')
  })

  test('typing at top level offers top-level keywords', () => {
    const doc = createDoc('g')
    const items = getCompletions(doc, { line: 0, character: 1 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('graph')
    const docSt = createDoc('st')
    const itemsSt = getCompletions(docSt, { line: 0, character: 2 })
    expect(itemsSt.map((i) => i.label)).toContain('stream')
    const doc2 = createDoc('fo')
    const items2 = getCompletions(doc2, { line: 0, character: 2 })
    expect(items2.map((i) => i.label)).toContain('form')
  })

  test('ai-tasks.swirls at (24,2) inside node returns node completions not top-level', () => {
    try {
      const content = fs.readFileSync(AI_TASKS_PATH, 'utf8')
      const doc = TextDocument.create('file:///ai-tasks.swirls', 'swirls', 1, content)
      const position = { line: 24, character: 2 }
      const ctx = getBlockContext(content, doc.offsetAt(position))
      expect(ctx).not.toBe(null)
      expect(ctx).toBe('root')
      const items = getCompletions(doc, position)
      const labels = items.map((i) => i.label)
      expect(labels).toContain('type')
      expect(labels).toContain('label')
      expect(labels).not.toContain('form')
      expect(labels).not.toContain('graph')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn('Skipping ai-tasks test: file not found at', AI_TASKS_PATH)
        return
      }

      throw e
    }
  })

  test('inside trigger body on empty line offers form:, webhook:, schedule:', () => {
    const doc = createDoc('trigger t {\n  \n}\n')
    const items = getCompletions(doc, { line: 1, character: 2 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('form:')
    expect(labels).toContain('webhook:')
    expect(labels).toContain('schedule:')
  })

  test('inside node body after type: offers node types including graph (subgraph)', () => {
    const doc = createDoc('graph g {\n  node n {\n    type: \n  }\n}\n')
    const items = getCompletions(doc, { line: 2, character: 10 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('code')
    expect(labels).toContain('ai')
    expect(labels).toContain('switch')
    expect(labels).toContain('graph')
    expect(labels).toContain('map')
    expect(labels).toContain('while')
    expect(labels).toContain('parallel')
  })

  test('inside flow block when typing node name offers graph node names', () => {
    const switchPath = path.join(import.meta.dir, '../../language/examples/switch-routing.swirls')

    if (!fs.existsSync(switchPath)) {
      console.warn('Skipping flow completions test: switch-routing.swirls not found')
      return
    }

    const content = fs.readFileSync(switchPath, 'utf8')
    const doc = TextDocument.create('file:///switch-routing.swirls', 'swirls', 1, content)
    const flowLine = 107
    const items = getCompletions(doc, { line: flowLine, character: 6 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('root')
    expect(labels).toContain('classify')
  })

  test('inside ai node offers kind, model, and other AI properties', () => {
    const doc = createDoc(`graph g {
  node n {
    type: ai
    kind: text

  }
}
`)

    const items = getCompletions(doc, { line: 4, character: 4 })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('model')
    expect(labels).toContain('kind')
  })

  test('agent blocks offer computer and profiles do not', () => {
    const agentDoc = createDoc('agent worker {\n  \n}\n')
    const agentItems = getCompletions(agentDoc, { line: 1, character: 2 })
    const computer = agentItems.find((item) => item.label === 'computer')

    expect(computer?.detail).toBe(
      "Named computer whose guest runs this agent's workspace tools. Cannot be combined with sandbox or disks.",
    )

    const profileDoc = createDoc('agent worker {\n  profile oncall {\n    \n  }\n}\n')
    const profileItems = getCompletions(profileDoc, { line: 2, character: 4 })
    expect(profileItems.some((item) => item.label === 'computer')).toBe(false)
    expect(profileItems.some((item) => item.label === 'description')).toBe(true)
  })

  test('inside fanout node offers bounded iteration properties', () => {
    const doc = createDoc(`workflow g {
  node n {
    type: fanout

  }
}
`)

    const items = getCompletions(doc, { line: 3, character: 4 })
    const labels = items.map((item) => item.label)
    expect(labels).toContain('items')
    expect(labels).toContain('maxItems')
    expect(labels).toContain('concurrency')
    expect(labels).toContain('subgraph')
    expect(labels).toContain('workflow')
  })
})

describe('computer harness completions', () => {
  function createDoc(content: string) {
    return TextDocument.create('file:///test.swirls', 'swirls', 1, content)
  }

  test('computer body offers harness', () => {
    const doc = createDoc('computer box {\n  \n}\n')

    const harness = getCompletions(doc, { line: 1, character: 2 }).find(
      (item) => item.label === 'harness',
    )

    expect(harness?.insertText).toBe('harness: { type: coding, provider: codex }')
  })

  test('harness block context is distinct from the computer', () => {
    const text = 'computer box {\n  harness: {\n    \n  }\n}\n'
    expect(getBlockContext(text, text.indexOf('    \n') + 4)).toBe('computer_harness')
    expect(getBlockContext(text, text.indexOf('harness'))).toBe('computer')
  })

  test('empty line inside harness offers type and provider', () => {
    const doc = createDoc('computer box {\n  harness: {\n    \n  }\n}\n')
    const labels = getCompletions(doc, { line: 2, character: 4 }).map((item) => item.label)
    expect(labels).toEqual(['type', 'provider'])
  })

  test('type: offers the catalog harness types', () => {
    const doc = createDoc('computer box {\n  harness: {\n    type: \n  }\n}\n')
    const labels = getCompletions(doc, { line: 2, character: 10 }).map((item) => item.label)
    expect(labels).toEqual(['coding'])
  })

  test('provider: offers every catalog provider with its package', () => {
    const doc = createDoc('computer box {\n  harness: { type: coding, provider: c }\n}\n')
    const items = getCompletions(doc, { line: 1, character: 38 })
    expect(items.map((item) => item.label)).toEqual(['claude', 'codex', 'pi', 'hermes'])
    expect(items[0]?.detail).toContain('claude-code')
  })

  test('type: inside a node still offers node types', () => {
    const doc = createDoc('workflow g {\n  node n {\n    type: \n  }\n}\n')
    const labels = getCompletions(doc, { line: 2, character: 10 }).map((item) => item.label)
    expect(labels).toContain('shell')
    expect(labels).not.toContain('coding')
  })
})
