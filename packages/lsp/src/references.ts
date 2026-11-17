import {
  type NodeDecl,
  parse,
  type SourceRange,
  type SwirlsFile,
} from '@swirls/language'
import type { Location, Position } from 'vscode-languageserver'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import { getDefinition } from './definition'
import { getDeclarationAtPosition } from './hover'

function toLspRange(range: SourceRange): {
  start: Location['range']['start']
  end: Location['range']['end']
} {
  return {
    start: { line: range.start.line - 1, character: range.start.column - 1 },
    end: { line: range.end.line - 1, character: range.end.column - 1 },
  }
}

function collectNodesDepthFirst(nodes: NodeDecl[], out: NodeDecl[]): void {
  for (const n of nodes) {
    out.push(n)
    if (n.subgraph?.nodes?.length) {
      collectNodesDepthFirst(n.subgraph.nodes, out)
    }
  }
}

function allGraphNodes(ast: SwirlsFile): NodeDecl[] {
  const out: NodeDecl[] = []
  for (const g of ast.workflows) {
    collectNodesDepthFirst(g.nodes, out)
  }
  return out
}

function pushRange(
  locations: Location[],
  uri: string,
  range: SourceRange | undefined,
): void {
  if (range) {
    locations.push({ uri, range: toLspRange(range) })
  }
}

function pushNamedRanges(
  locations: Location[],
  uri: string,
  names: string[] | undefined,
  ranges: SourceRange[] | undefined,
  targetName: string,
): void {
  if (!names || !ranges) {
    return
  }
  for (let i = 0; i < names.length; i++) {
    if (names[i] === targetName) {
      pushRange(locations, uri, ranges[i])
    }
  }
}

function resolveDeclaration(
  document: TextDocument,
  position: Position,
  uri: string,
  ast: SwirlsFile,
) {
  let swirlsDecl = getDeclarationAtPosition(document, position, ast)
  if (!swirlsDecl) {
    const def = getDefinition(document, position, uri)
    if (def) {
      const anchor = Array.isArray(def) ? def[0] : def
      swirlsDecl = getDeclarationAtPosition(document, anchor.range.start, ast)
    }
  }
  return swirlsDecl
}

function collectWorkflowReferences(
  ast: SwirlsFile,
  uri: string,
  workflowName: string,
  locations: Location[],
): void {
  for (const channel of ast.channels ?? []) {
    channel.workflows?.forEach((name, index) => {
      if (name === workflowName) {
        pushRange(locations, uri, channel.workflowsRanges?.[index])
      }
    })
  }
  for (const policy of ast.policies) {
    for (const grant of policy.grants) {
      if (grant.workflow === workflowName) {
        pushRange(locations, uri, grant.agentRange)
      }
    }
  }
  for (const t of ast.triggers) {
    if (t.workflowName === workflowName) {
      pushRange(locations, uri, t.range)
    }
  }

  for (const node of allGraphNodes(ast)) {
    const workflowConfig = node.configFields.workflow ?? node.configFields.graph
    if (
      workflowConfig?.kind === 'string' &&
      workflowConfig.value === workflowName
    ) {
      pushRange(locations, uri, workflowConfig.range)
    }
  }

  for (const s of ast.streams ?? []) {
    if (s.workflowName === workflowName) {
      pushRange(locations, uri, s.workflowNameRange)
    }
  }

  for (const v of ast.views ?? []) {
    for (const col of v.computed) {
      if (col.workflowName === workflowName) {
        pushRange(locations, uri, col.workflowNameRange)
      }
    }
  }

  for (const pol of ast.policies ?? []) {
    for (const grant of pol.grants) {
      pushNamedRanges(
        locations,
        uri,
        grant.workflows,
        grant.workflowsRanges,
        workflowName,
      )
      pushNamedRanges(
        locations,
        uri,
        grant.tools,
        grant.toolsRanges,
        workflowName,
      )
    }
  }

  for (const app of ast.apps ?? []) {
    for (const page of app.pages) {
      pushNamedRanges(
        locations,
        uri,
        page.reviews,
        page.reviewsRanges,
        workflowName,
      )
    }
  }

  for (const pb of ast.playbooks ?? []) {
    for (const caseDecl of pb.cases) {
      if (caseDecl.workflow === workflowName) {
        pushRange(locations, uri, caseDecl.workflowRange)
      }
    }
    for (const evalDecl of pb.evals) {
      if (evalDecl.workflow === workflowName) {
        pushRange(locations, uri, evalDecl.workflowRange)
      }
    }
  }

  for (const mock of ast.mocks ?? []) {
    if (mock.workflow === workflowName) {
      pushRange(locations, uri, mock.workflowRange)
    }
  }
}

/**
 * Return all reference locations for the symbol at the given position.
 * For a node: the definition (node block) plus every edge that uses it as source or target.
 * Optionally includes the definition when includeDeclaration is true (LSP convention).
 */
export function getReferences(
  document: TextDocument,
  position: Position,
  uri: string,
  includeDeclaration: boolean,
): Location[] {
  const result = parse(document.getText())

  if (result.errors.length > 0) {
    return []
  }

  const swirlsDecl = resolveDeclaration(document, position, uri, result.ast)

  if (!swirlsDecl) {
    return []
  }

  const locations: Location[] = []
  const ast = result.ast

  if (swirlsDecl.type === 'node') {
    const { decl: node, graph } = swirlsDecl

    if (includeDeclaration) {
      locations.push({ uri, range: toLspRange(node.range) })
    }

    for (const edge of graph.edges) {
      if (edge.source === node.name || edge.target === node.name) {
        locations.push({ uri, range: toLspRange(edge.range) })
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'graph') {
    const workflowDecl = swirlsDecl.decl

    if (includeDeclaration) {
      locations.push({ uri, range: toLspRange(workflowDecl.range) })
    }

    collectWorkflowReferences(ast, uri, workflowDecl.name, locations)

    return locations
  }

  if (swirlsDecl.type === 'decision') {
    if (includeDeclaration) {
      pushRange(
        locations,
        uri,
        ast.decisions?.find((d) => d.name === swirlsDecl.decl.name)?.range,
      )
    }
    for (const node of allGraphNodes(ast)) {
      const field = node.configFields.decision
      if (
        node.type === 'decision' &&
        field?.kind === 'string' &&
        field.value === swirlsDecl.decl.name
      ) {
        pushRange(locations, uri, field.range)
      }
    }
    return locations
  }

  if (swirlsDecl.type === 'agent') {
    const agentDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, agentDecl.range)
    }

    for (const ch of ast.channels ?? []) {
      if (ch.agent === agentDecl.name) {
        pushRange(locations, uri, ch.agentRange)
      }
    }

    for (const pol of ast.policies ?? []) {
      for (const grant of pol.grants) {
        if (grant.agent === agentDecl.name) {
          pushRange(locations, uri, grant.agentRange)
        }
      }
    }

    for (const node of allGraphNodes(ast)) {
      const agentField = node.configFields.agent
      if (
        agentField?.kind === 'string' &&
        agentField.value === agentDecl.name
      ) {
        pushRange(locations, uri, agentField.range)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'skill') {
    const skillDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, skillDecl.range)
    }

    for (const ag of ast.agent ?? []) {
      pushNamedRanges(
        locations,
        uri,
        ag.skills,
        ag.skillsRanges,
        skillDecl.name,
      )
      for (const prof of ag.profiles) {
        pushNamedRanges(
          locations,
          uri,
          prof.skills,
          prof.skillsRanges,
          skillDecl.name,
        )
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'disk') {
    const diskDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, diskDecl.range)
    }

    for (const ag of ast.agent ?? []) {
      pushNamedRanges(locations, uri, ag.disks, ag.disksRanges, diskDecl.name)
    }

    for (const node of allGraphNodes(ast)) {
      const diskField = node.configFields.disk
      if (diskField?.kind === 'string' && diskField.value === diskDecl.name) {
        pushRange(locations, uri, diskField.range)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'mcp') {
    const mcpDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, mcpDecl.range)
    }

    for (const ag of ast.agent ?? []) {
      pushNamedRanges(locations, uri, ag.mcp, ag.mcpRanges, mcpDecl.name)
      for (const prof of ag.profiles) {
        pushNamedRanges(locations, uri, prof.mcp, prof.mcpRanges, mcpDecl.name)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'connection') {
    const connDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, connDecl.range)
    }

    for (const ch of ast.channels ?? []) {
      if (ch.connection === connDecl.name) {
        pushRange(locations, uri, ch.connectionRange)
      }
    }

    for (const node of allGraphNodes(ast)) {
      const connField = node.configFields.connection
      if (connField?.kind === 'string' && connField.value === connDecl.name) {
        pushRange(locations, uri, connField.range)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'connector') {
    const connectorDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, connectorDecl.range)
    }

    for (const ch of ast.channels ?? []) {
      if (ch.connector === connectorDecl.name) {
        pushRange(locations, uri, ch.connectorRange)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'channel') {
    const channelDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, channelDecl.range)
    }

    for (const app of ast.apps ?? []) {
      for (const page of app.pages) {
        if (page.channel === channelDecl.name) {
          pushRange(locations, uri, page.channelRange)
        }
        pushNamedRanges(
          locations,
          uri,
          page.threads,
          page.threadsRanges,
          channelDecl.name,
        )
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'action') {
    const actionDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, actionDecl.range)
    }

    for (const node of allGraphNodes(ast)) {
      const actionField = node.configFields.action
      if (
        actionField?.kind === 'string' &&
        actionField.value === actionDecl.name
      ) {
        pushRange(locations, uri, actionField.range)
      }
    }

    for (const mock of ast.mocks ?? []) {
      if (mock.action === actionDecl.name) {
        pushRange(locations, uri, mock.actionRange)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'mock') {
    const mockDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, mockDecl.range)
    }

    for (const pb of ast.playbooks ?? []) {
      if (pb.mocks === mockDecl.name) {
        pushRange(locations, uri, pb.mocksRange)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'stream') {
    const streamDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, streamDecl.range)
    }

    for (const v of ast.views ?? []) {
      for (const streamRef of v.streams) {
        if (streamRef.name === streamDecl.name) {
          pushRange(locations, uri, streamRef.range)
        }
      }
    }

    for (const node of allGraphNodes(ast)) {
      const streamField = node.configFields.stream
      if (
        streamField?.kind === 'string' &&
        streamField.value === streamDecl.name
      ) {
        pushRange(locations, uri, streamField.range)
      }
    }

    return locations
  }

  if (swirlsDecl.type === 'role') {
    const roleDecl = swirlsDecl.decl

    if (includeDeclaration) {
      pushRange(locations, uri, roleDecl.range)
    }

    for (const pol of ast.policies ?? []) {
      for (const grant of pol.grants) {
        if (grant.role === roleDecl.name) {
          pushRange(locations, uri, grant.roleRange)
        }
      }
    }

    return locations
  }

  // Other declaration types: only include the definition when requested.
  if (
    includeDeclaration &&
    swirlsDecl.decl &&
    'range' in swirlsDecl.decl &&
    swirlsDecl.decl.range
  ) {
    locations.push({ uri, range: toLspRange(swirlsDecl.decl.range) })
  }

  return locations
}
