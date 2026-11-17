import { describe, expect, test } from 'bun:test'

import type { EdgeDecl, NodeDecl, SourceRange, WorkflowDecl } from '../ast'
import { parse } from '../parser'
import { validate } from '../validator'
import { getBranchNodes, getExclusiveSwitchBranches, validateSwitchFlow } from './switch-flow'

const r: SourceRange = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
}

function node(name: string, type: string, cases?: string[]): NodeDecl {
  const configFields: NodeDecl['configFields'] = {}

  if (cases) {
    configFields.cases = {
      kind: 'array',
      value: cases.map((c) => ({ kind: 'string', value: c, range: r })),
      range: r,
    }
  }

  return { name, type, label: '', configFields, range: r }
}

function edge(source: string, target: string, label?: string): EdgeDecl {
  return { source, target, range: r, ...(label != null ? { label } : {}) }
}

function workflow(nodes: NodeDecl[], edges: EdgeDecl[]): WorkflowDecl {
  return {
    name: 'g',
    label: '',
    nodes,
    edges,
    range: r,
  }
}

describe('getBranchNodes', () => {
  test('includes downstream nodes after labeled first hop', () => {
    const g = workflow(
      [
        node('sw', 'switch', ['a', 'b']),
        node('a1', 'code'),
        node('a2', 'code'),
        node('b1', 'code'),
      ],
      [edge('sw', 'a1', 'a'), edge('a1', 'a2'), edge('sw', 'b1', 'b')],
    )

    expect(getBranchNodes(g, 'sw', 'a')).toEqual(new Set(['a1', 'a2']))
    expect(getBranchNodes(g, 'sw', 'b')).toEqual(new Set(['b1']))
  })
})

describe('getExclusiveSwitchBranches', () => {
  test('returns single branch when node is exclusive to one case', () => {
    const g = workflow(
      [node('sw', 'switch', ['a', 'b']), node('only_a', 'code')],
      [edge('sw', 'only_a', 'a')],
    )

    expect(getExclusiveSwitchBranches('only_a', g)).toEqual(new Map([['sw', 'a']]))
  })
})

describe('validateSwitchFlow', () => {
  test('Rule A: rejects two labeled edges from same switch to one target', () => {
    const g = workflow(
      [node('sw', 'switch', ['a', 'b']), node('sink', 'code')],
      [edge('sw', 'sink', 'a'), edge('sw', 'sink', 'b')],
    )

    const diags = validateSwitchFlow(g)
    expect(diags.some((d) => d.severity !== 'warning')).toBe(true)
    expect(diags.some((d) => d.message.includes('mutually exclusive'))).toBe(true)
  })

  test('Rule B: rejects cross-branch join (GTM pattern)', () => {
    const g = workflow(
      [
        node('route', 'switch', ['skip', 'review']),
        node('promote', 'code'),
        node('finalize', 'code'),
      ],
      [
        edge('route', 'finalize', 'skip'),
        edge('route', 'promote', 'review'),
        edge('promote', 'finalize'),
      ],
    )

    const diags = validateSwitchFlow(g)

    expect(
      diags.some(
        (d) => d.severity === 'error' && d.message.includes('joins switch "route" branches'),
      ),
    ).toBe(true)
  })

  test('Rule B2: rejects merge of two branch-only nodes', () => {
    const g = workflow(
      [
        node('sw', 'switch', ['a', 'b']),
        node('a', 'code'),
        node('b', 'code'),
        node('join', 'code'),
      ],
      [edge('sw', 'a', 'a'), edge('sw', 'b', 'b'), edge('a', 'join'), edge('b', 'join')],
    )

    const diags = validateSwitchFlow(g)

    expect(
      diags.some((d) => d.severity === 'error' && d.message.includes('joins switch "sw"')),
    ).toBe(true)
  })

  test('Rule B3: rejects must-run plus branch-only on same join', () => {
    const g = workflow(
      [
        node('pre', 'code'),
        node('sw', 'switch', ['a', 'b']),
        node('a', 'code'),
        node('join', 'code'),
      ],
      [edge('pre', 'sw'), edge('pre', 'join'), edge('sw', 'a', 'a'), edge('a', 'join')],
    )

    const diags = validateSwitchFlow(g)

    expect(
      diags.some(
        (d) => d.severity === 'error' && d.message.includes('joins must-run node(s) with switch'),
      ),
    ).toBe(true)
  })

  test('allows leaf switch branches (no rejoin)', () => {
    const g = workflow(
      [node('sw', 'switch', ['a', 'b']), node('a', 'code'), node('b', 'code')],
      [edge('sw', 'a', 'a'), edge('sw', 'b', 'b')],
    )

    const errors = validateSwitchFlow(g).filter((d) => d.severity === 'error')
    expect(errors).toEqual([])
  })

  test('allows separate terminal paths per branch', () => {
    const g = workflow(
      [
        node('route', 'switch', ['skip', 'review']),
        node('promote', 'code'),
        node('finalize_auto', 'code'),
        node('finalize_reviewed', 'code'),
      ],
      [
        edge('route', 'finalize_auto', 'skip'),
        edge('route', 'promote', 'review'),
        edge('promote', 'finalize_reviewed'),
      ],
    )

    const errors = validateSwitchFlow(g).filter((d) => d.severity === 'error')
    expect(errors).toEqual([])
  })

  test('Rule C: switch outgoing edge must be labeled', () => {
    const g = workflow([node('sw', 'switch', ['a']), node('t', 'code')], [edge('sw', 't')])
    const diags = validateSwitchFlow(g)
    expect(diags.some((d) => d.message.includes('must have a label'))).toBe(true)
  })

  test('Rule C: warns on missing case coverage', () => {
    const g = workflow(
      [node('sw', 'switch', ['a', 'b']), node('a', 'code')],
      [edge('sw', 'a', 'a')],
    )

    const diags = validateSwitchFlow(g)

    expect(
      diags.some(
        (d) => d.severity === 'warning' && d.message.includes('no outgoing edge for case "b"'),
      ),
    ).toBe(true)
  })

  test('allows non-switch diamond merge', () => {
    const g = workflow(
      [node('root', 'code'), node('b', 'code'), node('c', 'code'), node('end', 'code')],
      [edge('root', 'b'), edge('root', 'c'), edge('b', 'end'), edge('c', 'end')],
    )

    const errors = validateSwitchFlow(g).filter((d) => d.severity === 'error')
    expect(errors).toEqual([])
  })
})

describe('invalid switch join fixture', () => {
  test('cross-branch join fails validate()', () => {
    const source = `
version: 1

workflow bad_switch_join {
  label: "Bad join"
  root {
    type: code
    code: @ts { return {} }
  }
  node route {
    type: switch
    cases: ["skip", "review"]
    router: @ts { return "skip" }
  }
  node promote {
    type: code
    code: @ts { return {} }
  }
  node finalize {
    type: code
    code: @ts { return {} }
  }
  flow {
    root -> route
    route -["skip"]-> finalize
    route -["review"]-> promote
    promote -> finalize
  }
}
`

    const { ast } = parse(source)
    const diags = validate(ast)

    expect(
      diags.some(
        (d) => d.severity === 'error' && d.message.includes('joins switch "route" branches'),
      ),
    ).toBe(true)
  })
})
