import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Location, Position } from 'vscode-languageserver'
import type { TextDocument } from 'vscode-languageserver-textdocument'

import {
  type NodeDecl,
  type SourceRange,
  type SwirlsFile,
  type WorkflowDecl,
} from '@swirls/language'
import type { DeclSite, WorkspaceResourceIndex } from '@swirls/language/workspace'

import { getDeclarationAtPosition, getWordAtPosition } from './hover'
import { parse } from './parse-cache'
import { positionInRange } from './ts-service/virtual-docs'

type DefinitionContext = {
  workspaceIndex: WorkspaceResourceIndex
  workspaceRoot: string
}

function toLspRange(range: SourceRange) {
  return {
    start: { line: range.start.line - 1, character: range.start.column - 1 },
    end: { line: range.end.line - 1, character: range.end.column - 1 },
  }
}

function location(uri: string, range: SourceRange): Location {
  return { uri, range: toLspRange(range) }
}

function locationFromSite(site: DeclSite, ctx: DefinitionContext): Location {
  const targetUri = pathToFileURL(join(ctx.workspaceRoot, site.relativePath)).href

  if (site.range) {
    return location(targetUri, site.range)
  }

  const line = site.line
  return {
    uri: targetUri,
    range: {
      start: { line: line - 1, character: 0 },
      end: { line: line - 1, character: 1 },
    },
  }
}

function resolveNamed(
  localDecl: { range: SourceRange } | undefined,
  sites: DeclSite[] | undefined,
  currentUri: string,
  ctx?: DefinitionContext,
): Location | Location[] | null {
  if (localDecl) {
    return location(currentUri, localDecl.range)
  }

  if (!ctx || !sites?.length) {
    return null
  }

  const locs = sites.map((site) => locationFromSite(site, ctx))

  if (locs.length === 1) {
    return locs[0] ?? null
  }

  return locs
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

function findNodeInWorkflow(workflow: WorkflowDecl, nodeName: string): NodeDecl | undefined {
  const nodes: NodeDecl[] = []
  collectNodesDepthFirst(workflow.nodes, nodes)
  return nodes.find((n) => n.name === nodeName)
}

function resolveWorkflowNode(
  ast: SwirlsFile,
  workflowName: string,
  nodeName: string,
  currentUri: string,
  ctx?: DefinitionContext,
): Location | Location[] | null {
  const localWorkflow = ast.workflows.find((w) => w.name === workflowName)

  if (localWorkflow) {
    const node = findNodeInWorkflow(localWorkflow, nodeName)
    return node ? location(currentUri, node.range) : null
  }

  if (!ctx) {
    return null
  }

  const workflowDecl = ctx.workspaceIndex.workflowBlocks.get(workflowName)

  if (!workflowDecl) {
    return null
  }

  const node = findNodeInWorkflow(workflowDecl, nodeName)

  if (!node) {
    return null
  }

  const sites = ctx.workspaceIndex.workflows.get(workflowName)
  const site = sites?.[sites.length - 1]

  if (!site) {
    return null
  }

  const targetUri = pathToFileURL(join(ctx.workspaceRoot, site.relativePath)).href
  return location(targetUri, node.range)
}

function tryPlaybookExpectNodeDefinition(
  ast: SwirlsFile,
  workflowName: string,
  expect: { assertions: Array<{ kind: string; node?: string; range: SourceRange }> } | undefined,
  inRange: (r: SourceRange | undefined) => r is SourceRange,
  uri: string,
  ctx?: DefinitionContext,
): Location | Location[] | null {
  if (!expect) {
    return null
  }

  for (const assertion of expect.assertions) {
    if (
      (assertion.kind === 'nodeOutput' || assertion.kind === 'nodeStatus') &&
      assertion.node &&
      inRange(assertion.range)
    ) {
      return resolveWorkflowNode(ast, workflowName, assertion.node, uri, ctx)
    }
  }

  return null
}

/**
 * Go-to-definition for references to top-level Swirls resources (schema, graph,
 * secret, auth, agent) using AST ref ranges. Runs before symbol/name resolution so
 * property values win over ambiguous identifiers. Also resolves agent `secrets:`,
 * agent/profile `skills: [ … ]`, agent `disks: [ … ]`, agent/role `tools: [ … ]`
 * entries, agent `team: [ … ]`, and `agent:` on graph nodes.
 */
function tryStandaloneResourceDefinition(
  position: Position,
  ast: SwirlsFile,
  uri: string,
  ctx?: DefinitionContext,
): Location | Location[] | null {
  const line = position.line
  const character = position.character
  const idx = ctx?.workspaceIndex

  const inRange = (r: SourceRange | undefined): r is SourceRange =>
    Boolean(r && positionInRange(line, character, r))

  const tryToolsListToGraph = (
    names: string[] | undefined,
    ranges: SourceRange[] | undefined,
  ): Location | Location[] | null => {
    if (!names?.length || !ranges?.length || names.length !== ranges.length) {
      return null
    }

    for (let i = 0; i < ranges.length; i++) {
      if (!inRange(ranges[i])) {
        continue
      }

      const name = names[i]

      if (name === undefined) {
        continue
      }

      const target = ast.workflows.find((x) => x.name === name)
      return resolveNamed(target, idx?.workflows.get(name), uri, ctx)
    }

    return null
  }

  for (const d of ast.decisions ?? []) {
    if (inRange(d.fieldRanges.secrets) && typeof d.fields.secrets === 'string') {
      const name = d.fields.secrets
      const target = ast.secrets.find((s) => s.name === name)
      return resolveNamed(target, idx?.secrets.get(name)?.sites, uri, ctx)
    }

    if (inRange(d.fieldRanges.inputSchema) && typeof d.fields.inputSchema === 'string') {
      const name = d.fields.inputSchema
      return resolveNamed(
        ast.schemas.find((s) => s.name === name),
        idx?.schemas.get(name),
        uri,
        ctx,
      )
    }
  }

  for (const s of ast.schemas) {
    if (s.schemaRef && inRange(s.schemaRefRange)) {
      const target = ast.schemas.find((x) => x.name === s.schemaRef)
      return resolveNamed(target, idx?.schemas.get(s.schemaRef), uri, ctx)
    }
  }

  for (const f of ast.forms) {
    if (f.schemaRef && inRange(f.schemaRefRange)) {
      const target = ast.schemas.find((x) => x.name === f.schemaRef)
      return resolveNamed(target, idx?.schemas.get(f.schemaRef), uri, ctx)
    }

    if (f.authRef && inRange(f.authRef.range)) {
      const authName = f.authRef.name
      const target = ast.auths.find((x) => x.name === authName)
      return resolveNamed(target, idx?.auths.get(authName), uri, ctx)
    }
  }

  for (const w of ast.webhooks) {
    if (w.schemaRef && inRange(w.schemaRefRange)) {
      const target = ast.schemas.find((x) => x.name === w.schemaRef)
      return resolveNamed(target, idx?.schemas.get(w.schemaRef), uri, ctx)
    }

    if (w.secretRef && inRange(w.secretRef.range)) {
      const blockName = w.secretRef.blockName
      const target = ast.secrets.find((x) => x.name === blockName)
      return resolveNamed(target, idx?.secrets.get(blockName)?.sites, uri, ctx)
    }
  }

  for (const st of ast.streams ?? []) {
    for (const version of st.versions) {
      if (version.schemaRef && inRange(version.schemaRefRange)) {
        const target = ast.schemas.find((x) => x.name === version.schemaRef)
        return resolveNamed(target, idx?.schemas.get(version.schemaRef), uri, ctx)
      }
    }

    if (st.workflowName && inRange(st.workflowNameRange)) {
      const target = ast.workflows.find((x) => x.name === st.workflowName)
      return resolveNamed(target, idx?.workflows.get(st.workflowName), uri, ctx)
    }
  }

  for (const v of ast.views ?? []) {
    if (v.schemaRef && inRange(v.schemaRefRange)) {
      const target = ast.schemas.find((x) => x.name === v.schemaRef)
      return resolveNamed(target, idx?.schemas.get(v.schemaRef), uri, ctx)
    }

    for (const streamRef of v.streams) {
      if (inRange(streamRef.range)) {
        const target = (ast.streams ?? []).find((x) => x.name === streamRef.name)
        return resolveNamed(target, idx?.streams.get(streamRef.name), uri, ctx)
      }
    }

    for (const col of v.computed) {
      if (col.workflowNameRange && inRange(col.workflowNameRange)) {
        const target = ast.workflows.find((x) => x.name === col.workflowName)
        return resolveNamed(target, idx?.workflows.get(col.workflowName), uri, ctx)
      }
    }
  }

  for (const c of ast.connections ?? []) {
    if (c.authRef && inRange(c.authRefRange)) {
      const target = ast.auths.find((x) => x.name === c.authRef)
      return resolveNamed(target, idx?.auths.get(c.authRef), uri, ctx)
    }
  }

  for (const ch of ast.channels ?? []) {
    const workflowLocation = tryToolsListToGraph(ch.workflows, ch.workflowsRanges)

    if (workflowLocation) {
      return workflowLocation
    }

    if (ch.agent && ch.agentRange && inRange(ch.agentRange)) {
      const target = (ast.agent ?? []).find((x) => x.name === ch.agent)
      return resolveNamed(target, idx?.agent.get(ch.agent), uri, ctx)
    }

    if (ch.connection && ch.connectionRange && inRange(ch.connectionRange)) {
      const target = (ast.connections ?? []).find((x) => x.name === ch.connection)
      return resolveNamed(target, idx?.connections.get(ch.connection), uri, ctx)
    }

    if (ch.connector && ch.connectorRange && inRange(ch.connectorRange)) {
      const target = (ast.connector ?? []).find((x) => x.name === ch.connector)
      return resolveNamed(target, idx?.connector.get(ch.connector), uri, ctx)
    }
  }

  for (const app of ast.apps ?? []) {
    for (const page of app.pages) {
      if (page.channel && page.channelRange && inRange(page.channelRange)) {
        const target = (ast.channels ?? []).find((x) => x.name === page.channel)
        return resolveNamed(target, idx?.channels.get(page.channel), uri, ctx)
      }

      if (page.threads?.length && page.threadsRanges?.length === page.threads.length) {
        for (let i = 0; i < page.threadsRanges.length; i++) {
          if (!inRange(page.threadsRanges[i])) {
            continue
          }

          const channelName = page.threads[i]

          if (channelName === undefined) {
            continue
          }

          const target = (ast.channels ?? []).find((x) => x.name === channelName)
          return resolveNamed(target, idx?.channels.get(channelName), uri, ctx)
        }
      }

      const reviewLoc = tryToolsListToGraph(page.reviews, page.reviewsRanges)

      if (reviewLoc) {
        return reviewLoc
      }
    }
  }

  for (const pol of ast.policies ?? []) {
    for (const grant of pol.grants) {
      // Roles are nested; no workspace index map — local-only.
      if (inRange(grant.roleRange)) {
        const target = (ast.roles ?? []).find((x) => x.name === grant.role)
        return target ? location(uri, target.range) : null
      }

      if (grant.workflow && inRange(grant.agentRange)) {
        const target = ast.workflows.find((x) => x.name === grant.workflow)
        return resolveNamed(target, idx?.workflows.get(grant.workflow), uri, ctx)
      }

      if (grant.agent && grant.agent !== '*' && inRange(grant.agentRange)) {
        const target = (ast.agent ?? []).find((x) => x.name === grant.agent)
        return resolveNamed(target, idx?.agent.get(grant.agent), uri, ctx)
      }

      const grantWorkflowLoc = tryToolsListToGraph(grant.workflows, grant.workflowsRanges)

      if (grantWorkflowLoc) {
        return grantWorkflowLoc
      }

      const grantToolsLoc = tryToolsListToGraph(grant.tools, grant.toolsRanges)

      if (grantToolsLoc) {
        return grantToolsLoc
      }
    }
  }

  for (const p of ast.postgres) {
    if (p.secretsRef && inRange(p.secretsRefRange)) {
      const secretsRef = p.secretsRef
      const target = ast.secrets.find((x) => x.name === secretsRef)
      return resolveNamed(target, idx?.secrets.get(secretsRef)?.sites, uri, ctx)
    }
  }

  for (const a of ast.auths) {
    if (a.secretsRef && inRange(a.secretsRefRange)) {
      const secretsRef = a.secretsRef
      const target = ast.secrets.find((x) => x.name === secretsRef)
      return resolveNamed(target, idx?.secrets.get(secretsRef)?.sites, uri, ctx)
    }
  }

  const tryTeamListToAgent = (
    names: string[] | undefined,
    ranges: SourceRange[] | undefined,
  ): Location | Location[] | null => {
    if (!names?.length || !ranges?.length || names.length !== ranges.length) {
      return null
    }

    for (let i = 0; i < ranges.length; i++) {
      if (!inRange(ranges[i])) {
        continue
      }

      const name = names[i]

      if (name === undefined) {
        continue
      }

      const target = (ast.agent ?? []).find((x) => x.name === name)
      return resolveNamed(target, idx?.agent.get(name), uri, ctx)
    }

    return null
  }

  const trySkillsListToSkill = (
    names: string[] | undefined,
    ranges: SourceRange[] | undefined,
  ): Location | Location[] | null => {
    if (!names?.length || !ranges?.length || names.length !== ranges.length) {
      return null
    }

    for (let i = 0; i < ranges.length; i++) {
      if (!inRange(ranges[i])) {
        continue
      }

      const name = names[i]

      if (name === undefined) {
        continue
      }

      const target = (ast.skill ?? []).find((x) => x.name === name)
      return resolveNamed(target, idx?.skill.get(name), uri, ctx)
    }

    return null
  }

  const tryDisksListToDisk = (
    names: string[] | undefined,
    ranges: SourceRange[] | undefined,
  ): Location | Location[] | null => {
    if (!names?.length || !ranges?.length || names.length !== ranges.length) {
      return null
    }

    for (let i = 0; i < ranges.length; i++) {
      if (!inRange(ranges[i])) {
        continue
      }

      const name = names[i]

      if (name === undefined) {
        continue
      }

      const target = (ast.disk ?? []).find((x) => x.name === name)
      return resolveNamed(target, idx?.disk.get(name), uri, ctx)
    }

    return null
  }

  const tryMcpListToMcp = (
    names: string[] | undefined,
    ranges: SourceRange[] | undefined,
  ): Location | Location[] | null => {
    if (!names?.length || !ranges?.length || names.length !== ranges.length) {
      return null
    }

    for (let i = 0; i < ranges.length; i++) {
      if (!inRange(ranges[i])) {
        continue
      }

      const name = names[i]

      if (name === undefined) {
        continue
      }

      const target = (ast.mcp ?? []).find((x) => x.name === name)
      return resolveNamed(target, idx?.mcp.get(name), uri, ctx)
    }

    return null
  }

  for (const ag of ast.agent ?? []) {
    if (ag.secretsRef && inRange(ag.secretsRefRange)) {
      const secretsRef = ag.secretsRef
      const target = ast.secrets.find((x) => x.name === secretsRef)
      return resolveNamed(target, idx?.secrets.get(secretsRef)?.sites, uri, ctx)
    }

    const agentToolsLoc = tryToolsListToGraph(ag.tools, ag.toolsRanges)

    if (agentToolsLoc) {
      return agentToolsLoc
    }

    const agentTeamLoc = tryTeamListToAgent(ag.team, ag.teamRanges)

    if (agentTeamLoc) {
      return agentTeamLoc
    }

    const agentSkillsLoc = trySkillsListToSkill(ag.skills, ag.skillsRanges)

    if (agentSkillsLoc) {
      return agentSkillsLoc
    }

    const agentDisksLoc = tryDisksListToDisk(ag.disks, ag.disksRanges)

    if (agentDisksLoc) {
      return agentDisksLoc
    }

    const agentMcpLoc = tryMcpListToMcp(ag.mcp, ag.mcpRanges)

    if (agentMcpLoc) {
      return agentMcpLoc
    }

    for (const role of ag.profiles ?? []) {
      const roleToolsLoc = tryToolsListToGraph(role.tools, role.toolsRanges)

      if (roleToolsLoc) {
        return roleToolsLoc
      }

      const roleSkillsLoc = trySkillsListToSkill(role.skills, role.skillsRanges)

      if (roleSkillsLoc) {
        return roleSkillsLoc
      }

      const roleMcpLoc = tryMcpListToMcp(role.mcp, role.mcpRanges)

      if (roleMcpLoc) {
        return roleMcpLoc
      }
    }
  }

  for (const n of allGraphNodes(ast)) {
    if (n.inputSchemaRef && inRange(n.inputSchemaRefRange)) {
      const schemaRef = n.inputSchemaRef
      const target = ast.schemas.find((x) => x.name === schemaRef)
      return resolveNamed(target, idx?.schemas.get(schemaRef), uri, ctx)
    }

    if (n.outputSchemaRef && inRange(n.outputSchemaRefRange)) {
      const schemaRef = n.outputSchemaRef
      const target = ast.schemas.find((x) => x.name === schemaRef)
      return resolveNamed(target, idx?.schemas.get(schemaRef), uri, ctx)
    }

    const rc = n.reviewConfig as Record<string, unknown> | undefined

    const reviewSchemaRef =
      rc?.schemaRef !== undefined && typeof rc.schemaRef === 'string' ? rc.schemaRef : undefined

    if (reviewSchemaRef && inRange(n.reviewSchemaRefRange)) {
      const target = ast.schemas.find((x) => x.name === reviewSchemaRef)
      return resolveNamed(target, idx?.schemas.get(reviewSchemaRef), uri, ctx)
    }

    for (const entry of n.secretsMapBlockRanges ?? []) {
      if (positionInRange(line, character, entry.range)) {
        const target = ast.secrets.find((x) => x.name === entry.blockName)
        return resolveNamed(target, idx?.secrets.get(entry.blockName)?.sites, uri, ctx)
      }
    }

    const authField = n.configFields.auth

    if (authField?.kind === 'string' && inRange(authField.range)) {
      const target = ast.auths.find((x) => x.name === authField.value)
      return resolveNamed(target, idx?.auths.get(authField.value), uri, ctx)
    }

    const decisionField = n.configFields.decision

    if (n.type === 'decision' && decisionField?.kind === 'string' && inRange(decisionField.range)) {
      return resolveNamed(
        ast.decisions?.find((d) => d.name === decisionField.value),
        idx?.decisions?.get(decisionField.value),
        uri,
        ctx,
      )
    }

    const agentField = n.configFields.agent

    if (agentField?.kind === 'string' && inRange(agentField.range)) {
      const target = ast.agent?.find((x) => x.name === agentField.value)
      return resolveNamed(target, idx?.agent.get(agentField.value), uri, ctx)
    }

    // Profiles are nested under agent; no workspace index map — local-only.
    const profileField = n.configFields.profile

    if (profileField?.kind === 'string' && inRange(profileField.range)) {
      const agentName = agentField?.kind === 'string' ? agentField.value : undefined

      if (agentName) {
        const agentDecl = ast.agent?.find((x) => x.name === agentName)
        const profile = agentDecl?.profiles?.find((p) => p.name === profileField.value)
        return profile ? location(uri, profile.range) : null
      }

      return null
    }

    const streamField = n.configFields.stream

    if (streamField?.kind === 'string' && inRange(streamField.range)) {
      const target = (ast.streams ?? []).find((x) => x.name === streamField.value)
      return resolveNamed(target, idx?.streams.get(streamField.value), uri, ctx)
    }

    const postgresField = n.configFields.postgres

    if (postgresField?.kind === 'string' && inRange(postgresField.range)) {
      const target = ast.postgres.find((x) => x.name === postgresField.value)
      return resolveNamed(target, idx?.postgres.get(postgresField.value), uri, ctx)
    }

    const diskField = n.configFields.disk

    if (diskField?.kind === 'string' && inRange(diskField.range)) {
      const target = (ast.disk ?? []).find((x) => x.name === diskField.value)
      return resolveNamed(target, idx?.disk.get(diskField.value), uri, ctx)
    }

    const connectionField = n.configFields.connection

    if (connectionField?.kind === 'string' && inRange(connectionField.range)) {
      const target = (ast.connections ?? []).find((x) => x.name === connectionField.value)
      return resolveNamed(target, idx?.connections.get(connectionField.value), uri, ctx)
    }

    const actionField = n.configFields.action

    if (actionField?.kind === 'string' && inRange(actionField.range)) {
      const target = (ast.actions ?? []).find((x) => x.name === actionField.value)
      return resolveNamed(target, idx?.actions.get(actionField.value), uri, ctx)
    }

    const workflowField = n.configFields.workflow ?? n.configFields.graph

    if (workflowField?.kind === 'string' && inRange(workflowField.range)) {
      const target = ast.workflows.find((x) => x.name === workflowField.value)
      return resolveNamed(target, idx?.workflows.get(workflowField.value), uri, ctx)
    }
  }

  for (const pb of ast.playbooks ?? []) {
    if (pb.mocks && pb.mocksRange && inRange(pb.mocksRange)) {
      const target = (ast.mocks ?? []).find((x) => x.name === pb.mocks)
      return resolveNamed(target, idx?.mocks.get(pb.mocks), uri, ctx)
    }

    for (const caseDecl of pb.cases) {
      if (caseDecl.workflowRange && inRange(caseDecl.workflowRange)) {
        const target = ast.workflows.find((x) => x.name === caseDecl.workflow)
        return resolveNamed(target, idx?.workflows.get(caseDecl.workflow), uri, ctx)
      }

      const expectNodeLoc = tryPlaybookExpectNodeDefinition(
        ast,
        caseDecl.workflow,
        caseDecl.expect,
        inRange,
        uri,
        ctx,
      )

      if (expectNodeLoc) {
        return expectNodeLoc
      }
    }

    for (const evalDecl of pb.evals) {
      if (evalDecl.workflowRange && inRange(evalDecl.workflowRange)) {
        const target = ast.workflows.find((x) => x.name === evalDecl.workflow)
        return resolveNamed(target, idx?.workflows.get(evalDecl.workflow), uri, ctx)
      }

      const expectNodeLoc = tryPlaybookExpectNodeDefinition(
        ast,
        evalDecl.workflow,
        evalDecl.expect,
        inRange,
        uri,
        ctx,
      )

      if (expectNodeLoc) {
        return expectNodeLoc
      }
    }
  }

  for (const mock of ast.mocks ?? []) {
    if (mock.action && mock.actionRange && inRange(mock.actionRange)) {
      const target = (ast.actions ?? []).find((x) => x.name === mock.action)
      return resolveNamed(target, idx?.actions.get(mock.action), uri, ctx)
    }

    if (mock.workflow && mock.workflowRange && inRange(mock.workflowRange)) {
      const target = ast.workflows.find((x) => x.name === mock.workflow)
      return resolveNamed(target, idx?.workflows.get(mock.workflow), uri, ctx)
    }

    if (mock.node && mock.nodeRange && mock.workflow && inRange(mock.nodeRange)) {
      return resolveWorkflowNode(ast, mock.workflow, mock.node, uri, ctx)
    }
  }

  return null
}

/** Cross-file fallback for trigger binding lines (`form: X -> Y`). */
function tryCrossFileTriggerBinding(
  document: TextDocument,
  position: Position,
  uri: string,
  ctx?: DefinitionContext,
): Location | Location[] | null {
  if (!ctx) {
    return null
  }

  const word = getWordAtPosition(document, position)

  if (!word) {
    return null
  }

  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: 1 << 20 },
  })

  const trimmed = lineText.trim()

  if (!/^\s*(form|webhook|schedule)\s*:\s*[a-zA-Z0-9_]+\s*->\s*[a-zA-Z0-9_]+/.test(trimmed)) {
    return null
  }

  const bindingMatch = trimmed.match(
    /(form|webhook|schedule)\s*:\s*([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)/,
  )

  if (!bindingMatch) {
    return null
  }

  const [, resourceType, resourceName, workflowName] = bindingMatch
  const idx = ctx.workspaceIndex

  if (word === resourceName) {
    if (resourceType === 'form') {
      return resolveNamed(undefined, idx.forms.get(resourceName), uri, ctx)
    }

    if (resourceType === 'webhook') {
      return resolveNamed(undefined, idx.webhooks.get(resourceName), uri, ctx)
    }

    if (resourceType === 'schedule') {
      return resolveNamed(undefined, idx.schedules.get(resourceName), uri, ctx)
    }
  }

  if (word === workflowName) {
    return resolveNamed(undefined, idx.workflows.get(workflowName), uri, ctx)
  }

  return null
}

/**
 * Return the definition location for the symbol at the given position.
 * Resolves references to top-level schema, graph, secret, auth, and agent resources
 * first (including agent/block `secrets:`, agent/profile `skills: [ … ]`, agent
 * `disks: [ … ]`, agent `tools: [ … ]`, and node `agent:`),
 * then uses AST and getDeclarationAtPosition so that node names on both
 * the definition line (`node entry {`) and edge lines (`recent -> summarize`)
 * resolve to the node's definition. Also handles form, webhook, schedule,
 * graph, and trigger declarations.
 */
export function getDefinition(
  document: TextDocument,
  position: Position,
  uri: string,
  ctx?: DefinitionContext,
): Location | Location[] | null {
  const result = parse(document.getText())

  const resourceLoc = tryStandaloneResourceDefinition(position, result.ast, uri, ctx)

  if (resourceLoc) {
    return resourceLoc
  }

  const swirlsDecl = getDeclarationAtPosition(document, position, result.ast)

  if (!swirlsDecl) {
    return tryCrossFileTriggerBinding(document, position, uri, ctx)
  }

  const decl = swirlsDecl.decl

  if (decl && 'range' in decl && decl.range) {
    return { uri, range: toLspRange(decl.range) }
  }

  return null
}
