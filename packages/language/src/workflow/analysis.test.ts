import { describe, expect, test } from 'bun:test'

import type { EdgeDecl, NodeDecl, SourceRange, WorkflowDecl } from '../ast'
import { getLeafNodes, getLineageNodeNames, getMustRunNodeNames, getRootNode } from './analysis'

const r: SourceRange = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
}

function node(name: string, type: string): NodeDecl {
  return { name, type, label: '', configFields: {}, range: r }
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

describe('getRootNode', () => {
  test('returns the single node with no incoming edges', () => {
    const g = workflow([node('a', 'code'), node('b', 'code')], [edge('a', 'b')])
    expect(getRootNode(g)?.name).toBe('a')
  })
})

describe('getLeafNodes', () => {
  test('returns nodes with no outgoing edges', () => {
    const g = workflow(
      [node('a', 'code'), node('b', 'code'), node('c', 'code')],
      [edge('a', 'b'), edge('a', 'c')],
    )

    const leaves = getLeafNodes(g).map((n) => n.name)
    expect(leaves.sort()).toEqual(['b', 'c'])
  })
})

describe('getLineageNodeNames', () => {
  test('collects transitive ancestors', () => {
    const g = workflow(
      [node('a', 'code'), node('b', 'code'), node('c', 'code')],
      [edge('a', 'b'), edge('b', 'c')],
    )

    const lineage = getLineageNodeNames(g, 'c')
    expect(lineage.sort()).toEqual(['a', 'b'])
  })
})

describe('getMustRunNodeNames', () => {
  test('linear chain: all nodes are must-run', () => {
    const g = workflow(
      [node('a', 'code'), node('b', 'code'), node('c', 'code')],
      [edge('a', 'b'), edge('b', 'c')],
    )

    expect(getMustRunNodeNames(g)).toEqual(new Set(['a', 'b', 'c']))
  })

  test('diamond: all nodes are must-run', () => {
    const g = workflow(
      [node('root', 'code'), node('b', 'code'), node('c', 'code'), node('end', 'code')],
      [edge('root', 'b'), edge('root', 'c'), edge('b', 'end'), edge('c', 'end')],
    )

    expect(getMustRunNodeNames(g)).toEqual(new Set(['root', 'b', 'c', 'end']))
  })

  test('switch downstream nodes are excluded (conservative)', () => {
    const g = workflow(
      [node('root', 'switch'), node('case1', 'code'), node('case2', 'code')],
      [edge('root', 'case1', 'x'), edge('root', 'case2', 'y')],
    )

    const must = getMustRunNodeNames(g)
    expect(must.has('root')).toBe(true)
    expect(must.has('case1')).toBe(false)
    expect(must.has('case2')).toBe(false)
  })

  test('code before switch: prefix nodes are must-run', () => {
    const g = workflow(
      [node('pre', 'code'), node('sw', 'switch'), node('leaf', 'code')],
      [edge('pre', 'sw'), edge('sw', 'leaf', 'a')],
    )

    const must = getMustRunNodeNames(g)
    expect(must.has('pre')).toBe(true)
    expect(must.has('sw')).toBe(true)
    expect(must.has('leaf')).toBe(false)
  })

  test('nested switches: downstream of inner switch excluded', () => {
    const g = workflow(
      [node('root', 'switch'), node('mid', 'switch'), node('deep', 'code')],
      [edge('root', 'mid', 'a'), edge('mid', 'deep', 'b')],
    )

    const must = getMustRunNodeNames(g)
    expect(must.has('root')).toBe(true)
    expect(must.has('mid')).toBe(false)
    expect(must.has('deep')).toBe(false)
  })

  test('single node workflow: the node is must-run', () => {
    const g = workflow([node('only', 'code')], [])
    expect(getMustRunNodeNames(g)).toEqual(new Set(['only']))
  })

  test('disconnected: each root seeds must-run in its component', () => {
    const g = workflow(
      [node('r1', 'code'), node('r2', 'code'), node('x', 'code')],
      [edge('r1', 'x')],
    )

    const must = getMustRunNodeNames(g)
    expect(must.has('r1')).toBe(true)
    expect(must.has('r2')).toBe(true)
    expect(must.has('x')).toBe(true)
  })
})
