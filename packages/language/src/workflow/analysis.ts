import type { NodeDecl, WorkflowDecl } from '../ast'

/**
 * Find nodes with no incoming edges (workflow roots). A disconnected workflow may have several.
 */
function getRootNodeNames(workflow: WorkflowDecl): string[] {
  const targets = new Set(workflow.edges.map((e) => e.target))
  return workflow.nodes.filter((n) => !targets.has(n.name)).map((n) => n.name)
}

/**
 * Find the workflow's root node (the first node with no incoming edges).
 * When multiple roots exist (disconnected workflow), returns the first in declaration order.
 */
export function getRootNode(workflow: WorkflowDecl): NodeDecl | undefined {
  const targets = new Set(workflow.edges.map((e) => e.target))
  return workflow.nodes.find((n) => !targets.has(n.name))
}

/**
 * Get leaf nodes of a workflow (nodes with no outgoing edges).
 */
export function getLeafNodes(workflow: WorkflowDecl): NodeDecl[] {
  const sourceNodeNames = new Set(workflow.edges.map((e) => e.source))
  return workflow.nodes.filter((n) => !sourceNodeNames.has(n.name))
}

/**
 * Build the set of all ancestor node names (full lineage): direct upstream plus their ancestors, transitively.
 */
export function getLineageNodeNames(workflow: WorkflowDecl, nodeName: string): string[] {
  const lineage = new Set<string>()
  const worklist: string[] = [nodeName]
  const seen = new Set<string>([nodeName])

  while (worklist.length > 0) {
    const current = worklist.pop()!

    for (const edge of workflow.edges) {
      if (edge.target === current) {
        lineage.add(edge.source)

        if (!seen.has(edge.source)) {
          seen.add(edge.source)
          worklist.push(edge.source)
        }
      }
    }
  }

  return [...lineage]
}

/**
 * Names of nodes reachable forward from any outgoing edge of a `switch` node.
 * Used conservatively: everything on a switch branch is treated as may-run for typing.
 */
function getNamesBelowAnySwitch(workflow: WorkflowDecl): Set<string> {
  const switchNames = new Set(workflow.nodes.filter((n) => n.type === 'switch').map((n) => n.name))
  const below = new Set<string>()
  const adj = new Map<string, string[]>()

  for (const e of workflow.edges) {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  }

  function dfs(name: string) {
    if (below.has(name)) {
      return
    }

    below.add(name)

    for (const t of adj.get(name) ?? []) {
      dfs(t)
    }
  }

  for (const e of workflow.edges) {
    if (switchNames.has(e.source)) {
      dfs(e.target)
    }
  }

  return below
}

const mustRunCache = new WeakMap<WorkflowDecl, ReadonlySet<string>>()

/**
 * Node names that run on every successful workflow completion, regardless of switch outcomes.
 *
 * **Conservative:** Any node reachable from a `switch` node's outgoing edge is treated as
 * may-run (excluded from this set), even when a diamond rejoin would make a join node
 * unconditional in practice. This over-approximates optional keys for `context.output` /
 * stream `context.nodes` — sound but may mark some always-run nodes as optional.
 *
 * Switch nodes themselves are included when their predecessors are must-run.
 *
 * Results are memoized per `workflow` object reference.
 */
function computeMustRunNodeNames(workflow: WorkflowDecl): Set<string> {
  const belowSwitch = getNamesBelowAnySwitch(workflow)
  const incoming = new Map<string, string[]>()

  for (const n of workflow.nodes) {
    incoming.set(n.name, [])
  }

  for (const e of workflow.edges) {
    incoming.get(e.target)?.push(e.source)
  }

  const mustRun = new Set<string>()
  const roots = getRootNodeNames(workflow)

  for (const r of roots) {
    mustRun.add(r)
  }

  let changed = true

  while (changed) {
    changed = false

    for (const node of workflow.nodes) {
      if (mustRun.has(node.name)) {
        continue
      }

      if (belowSwitch.has(node.name)) {
        continue
      }

      const parents = incoming.get(node.name) ?? []

      if (parents.length === 0) {
        continue
      }

      if (parents.every((p) => mustRun.has(p))) {
        mustRun.add(node.name)
        changed = true
      }
    }
  }

  return mustRun
}

export function getMustRunNodeNames(workflow: WorkflowDecl): ReadonlySet<string> {
  const cached = mustRunCache.get(workflow)

  if (cached) {
    return cached
  }

  const result = computeMustRunNodeNames(workflow)
  mustRunCache.set(workflow, result)
  return result
}
