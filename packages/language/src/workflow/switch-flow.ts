import type { Diagnostic, EdgeDecl, NodeDecl, SourceRange, WorkflowDecl } from '../ast'
import { getMustRunNodeNames } from './analysis'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function getSwitchCases(node: NodeDecl): string[] {
  const cv = node.configFields.cases

  if (!cv || cv.kind !== 'array') {
    return []
  }

  return cv.value.filter((v) => v.kind === 'string').map((v) => v.value)
}

function buildAdjacency(workflow: WorkflowDecl): Map<string, string[]> {
  const adj = new Map<string, string[]>()

  for (const n of workflow.nodes) {
    adj.set(n.name, [])
  }

  for (const e of workflow.edges) {
    adj.get(e.source)?.push(e.target)
  }

  return adj
}

/**
 * Nodes reachable from a switch case: first hop must use `label`, then any edges downstream.
 */
export function getBranchNodes(
  workflow: WorkflowDecl,
  switchName: string,
  label: string,
): Set<string> {
  const reachable = new Set<string>()
  const adj = buildAdjacency(workflow)

  const firstHop = workflow.edges
    .filter((e) => e.source === switchName && e.label === label)
    .map((e) => e.target)

  function dfs(name: string) {
    if (reachable.has(name)) {
      return
    }

    reachable.add(name)

    for (const t of adj.get(name) ?? []) {
      dfs(t)
    }
  }

  for (const start of firstHop) {
    dfs(start)
  }

  return reachable
}

/**
 * When a node sits on exactly one branch of a switch, returns that (switch, label) pair.
 */
export function getExclusiveSwitchBranches(
  nodeName: string,
  workflow: WorkflowDecl,
): Map<string, string> {
  const result = new Map<string, string>()
  const switchNodes = workflow.nodes.filter((n) => n.type === 'switch')

  for (const sw of switchNodes) {
    const cases = getSwitchCases(sw)
    const matching: string[] = []

    for (const c of cases) {
      if (getBranchNodes(workflow, sw.name, c).has(nodeName)) {
        matching.push(c)
      }
    }

    if (matching.length === 1) {
      result.set(sw.name, matching[0]!)
    }
  }

  return result
}

function getEdgeSwitchRequirements(edge: EdgeDecl, workflow: WorkflowDecl): Map<string, string> {
  const req = new Map<string, string>()
  const sourceNode = workflow.nodes.find((n) => n.name === edge.source)

  if (!sourceNode) {
    return req
  }

  if (sourceNode.type === 'switch') {
    if (edge.label) {
      req.set(sourceNode.name, edge.label)
    }

    return req
  }

  for (const [sw, label] of getExclusiveSwitchBranches(edge.source, workflow)) {
    req.set(sw, label)
  }

  return req
}

/**
 * Validates switch routing soundness: mutually exclusive joins and switch edge hygiene.
 */
export function validateSwitchFlow(workflow: WorkflowDecl): Diagnostic[] {
  const out: Diagnostic[] = []
  const mustRun = getMustRunNodeNames(workflow)
  const switchNodes = workflow.nodes.filter((n) => n.type === 'switch')
  const nodeByName = new Map(workflow.nodes.map((n) => [n.name, n]))

  for (const sw of switchNodes) {
    const cases = getSwitchCases(sw)
    const caseSet = new Set(cases)
    const outgoing = workflow.edges.filter((e) => e.source === sw.name)
    const coveredCases = new Set<string>()

    for (const e of outgoing) {
      if (!e.label) {
        out.push(
          diag(
            `Switch node "${sw.name}" outgoing edge to "${e.target}" must have a label matching a case`,
            e.range,
          ),
        )
      } else if (!caseSet.has(e.label)) {
        out.push(
          diag(
            `Switch node "${sw.name}" edge label "${e.label}" is not in cases [${cases.join(', ')}]`,
            e.range,
          ),
        )
      } else {
        coveredCases.add(e.label)
      }
    }

    for (const c of cases) {
      if (!coveredCases.has(c)) {
        out.push(
          diag(
            `Switch node "${sw.name}" has no outgoing edge for case "${c}"`,
            sw.range,
            'warning',
          ),
        )
      }
    }
  }

  const incomingByTarget = new Map<string, EdgeDecl[]>()

  for (const e of workflow.edges) {
    const list = incomingByTarget.get(e.target) ?? []
    list.push(e)
    incomingByTarget.set(e.target, list)
  }

  for (const [targetName, incoming] of incomingByTarget) {
    if (incoming.length < 2) {
      continue
    }

    const targetNode = nodeByName.get(targetName)
    const targetRange = targetNode?.range ?? workflow.range

    const directSwitchLabels = new Map<string, Set<string>>()

    for (const e of incoming) {
      const src = nodeByName.get(e.source)

      if (src?.type === 'switch' && e.label) {
        const labels = directSwitchLabels.get(src.name) ?? new Set()
        labels.add(e.label)
        directSwitchLabels.set(src.name, labels)
      }
    }

    for (const [swName, labels] of directSwitchLabels) {
      if (labels.size > 1) {
        out.push(
          diag(
            `Node "${targetName}" has incoming edges from switch "${swName}" with mutually exclusive labels (${[...labels].join(', ')}); use separate terminal paths per branch`,
            targetRange,
          ),
        )
      }
    }

    const labelsBySwitch = new Map<string, Set<string>>()

    for (const e of incoming) {
      for (const [sw, label] of getEdgeSwitchRequirements(e, workflow)) {
        const set = labelsBySwitch.get(sw) ?? new Set()
        set.add(label)
        labelsBySwitch.set(sw, set)
      }
    }

    for (const [swName, labels] of labelsBySwitch) {
      if (labels.size > 1) {
        out.push(
          diag(
            `Node "${targetName}" joins switch "${swName}" branches ${[...labels].map((l) => `"${l}"`).join(' and ')}; use separate terminal paths per branch`,
            targetRange,
          ),
        )
      }
    }

    for (const swName of labelsBySwitch.keys()) {
      const hasMustRunIncoming = incoming.some((e) => {
        if (nodeByName.get(e.source)?.type === 'switch') {
          return false
        }

        return mustRun.has(e.source)
      })

      const hasBranchExclusive = incoming.some((e) =>
        getExclusiveSwitchBranches(e.source, workflow).has(swName),
      )

      if (hasMustRunIncoming && hasBranchExclusive) {
        out.push(
          diag(
            `Node "${targetName}" joins must-run node(s) with switch "${swName}" branch-only node(s); downstream nodes on other branches will stall the scheduler`,
            targetRange,
          ),
        )
      }
    }
  }

  return out
}
