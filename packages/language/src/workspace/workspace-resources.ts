import { join } from 'pathe'

import type { ActionDecl } from '../action/ast'
import type { AgentDecl } from '../agent/ast'
import type { JsonSchemaLiteral } from '../ast'
import type { SchemaDecl, SourceRange, WorkflowDecl } from '../ast'
import type { ChannelDecl } from '../channel/ast'
import type { ComputerDecl } from '../computer/ast'
import type { ConnectionDecl } from '../connection/ast'
import type { ConnectorDecl } from '../connector/ast'
import type { DatabaseDecl } from '../database/ast'
import type { DecisionDecl } from '../decision'
import type { DiskDecl } from '../disk/ast'
import type { McpDecl } from '../mcp/ast'
import type { OperationDecl } from '../operation/ast'
import { type ParseResult, parse as parseSource } from '../parser'
import type { PostgresDecl } from '../postgres/ast'
import type { QueryDecl } from '../query/ast'
import { resolveNamedSchemasFromDecls } from '../schema'
import type { SkillDecl } from '../skill/ast'
import { collectSwirlsFiles } from './collect'
import { nodeWorkspaceFileSystem, type SwirlsWorkspaceFileSystem } from './sandbox'

/** One declaration site for a top-level resource in the workspace. */
export type DeclSite = {
  relativePath: string
  /** 1-based line from the AST range */
  line: number
  /** Full declaration span when indexed from a parsed AST range. */
  range?: SourceRange
}

export type ResourceDeclMap = Map<string, DeclSite[]>

export type WorkspaceSecretEntry = {
  vars: string[]
  sites: DeclSite[]
  /** When `managed`, platform supplies values (Enterprise). */
  type?: 'managed'
}

export type WorkspaceResourceIndex = {
  decisions?: ResourceDeclMap
  decisionBlocks?: Map<string, DecisionDecl>
  forms: ResourceDeclMap
  webhooks: ResourceDeclMap
  schedules: ResourceDeclMap
  workflows: ResourceDeclMap
  streams: ResourceDeclMap
  /** Top-level `view` block declaration sites. */
  views: ResourceDeclMap
  auths: ResourceDeclMap
  connections: ResourceDeclMap
  /** Top-level `action` block declaration sites. */
  actions: ResourceDeclMap
  postgres: ResourceDeclMap
  /** Top-level `database` block declaration sites. */
  databases: ResourceDeclMap
  /** Top-level `migration` block declaration sites. */
  migrations: ResourceDeclMap
  /** Top-level `disk` block declaration sites. */
  disk: ResourceDeclMap
  /** Top-level `computer` block declaration sites. */
  computer: ResourceDeclMap
  /** Top-level `operation` block declaration sites. */
  operation: ResourceDeclMap
  /** Top-level `skill` block declaration sites. */
  skill: ResourceDeclMap
  /** Top-level `agent` block declaration sites. */
  agent: ResourceDeclMap
  /** Top-level `mcp` block declaration sites. */
  mcp: ResourceDeclMap
  /** Top-level `network` block declaration sites. */
  networks?: ResourceDeclMap
  /** Top-level `channel` block declaration sites. */
  channels: ResourceDeclMap
  /** Top-level `query` block declaration sites. */
  queries: ResourceDeclMap
  /** Top-level `connector` block declaration sites. */
  connector: ResourceDeclMap
  /** Top-level `app` block declaration sites. */
  apps: ResourceDeclMap
  /** Top-level `mock` block declaration sites. */
  mocks: ResourceDeclMap
  /** Top-level `playbook` block declaration sites. */
  playbooks: ResourceDeclMap
  schemas: ResourceDeclMap
  secrets: Map<string, WorkspaceSecretEntry>
  /** Resolved JSON Schema literals for all named schemas in the workspace (follows schemaRef chains). */
  schemaLiterals: Map<string, JsonSchemaLiteral>
  /** Workflow bodies for cross-file validation (last declaration wins if duplicates; doctor reports dupes). */
  workflowBlocks: Map<string, WorkflowDecl>
  /** Postgres block bodies for cross-file node validation. */
  postgresBlocks: Map<string, PostgresDecl>
  /** Database block bodies for cross-file `migration` reference validation. */
  databaseBlocks: Map<string, DatabaseDecl>
  /** Disk block bodies for cross-file node validation. */
  diskBlocks: Map<string, DiskDecl>
  /** Computer block bodies for cross-file `shell` validation. */
  computerBlocks: Map<string, ComputerDecl>
  /** Operation declarations by name, for `type: device` node references. */
  operationBlocks: Map<string, OperationDecl>
  /** Skill block bodies for cross-file validation. */
  skillBlocks: Map<string, SkillDecl>
  /** Agent block bodies for cross-file validation. */
  agentBlocks: Map<string, AgentDecl>
  /** MCP block bodies for cross-file validation (agent mcp ref resolution). */
  mcpBlocks: Map<string, McpDecl>
  /** Channel block bodies for cross-file validation. */
  channelBlocks: Map<string, ChannelDecl>
  /** Query block bodies for cross-file validation. */
  queryBlocks: Map<string, QueryDecl>
  /** Connection block bodies for cross-file validation (provider-match check). */
  connectionBlocks: Map<string, ConnectionDecl>
  /** Connector block bodies for cross-file validation (channel connector ref resolution). */
  connectorBlocks: Map<string, ConnectorDecl>
  /** Action block bodies for cross-file integration node validation. */
  actionBlocks: Map<string, ActionDecl>
}

function pushSite(map: ResourceDeclMap, name: string, site: DeclSite) {
  const arr = map.get(name)

  if (arr) {
    arr.push(site)
  } else {
    map.set(name, [site])
  }
}

function mergeSecretVars(
  secrets: Map<string, WorkspaceSecretEntry>,
  name: string,
  vars: string[],
  site: DeclSite,
  type?: 'managed',
) {
  const e = secrets.get(name)

  if (!e) {
    secrets.set(name, { vars: [...vars], sites: [site], type })
    return
  }

  e.sites.push(site)
  const set = new Set([...e.vars, ...vars])
  e.vars = [...set]

  if (type === 'managed') {
    e.type = 'managed'
  }
}

function siteFromRange(relativePath: string, range: SourceRange): DeclSite {
  return {
    relativePath,
    line: range.start.line,
    range,
  }
}

const emptyDeclMap = (): ResourceDeclMap => new Map()

export function emptyWorkspaceResourceIndex(): WorkspaceResourceIndex {
  return {
    forms: emptyDeclMap(),
    webhooks: emptyDeclMap(),
    schedules: emptyDeclMap(),
    workflows: emptyDeclMap(),
    streams: emptyDeclMap(),
    views: emptyDeclMap(),
    auths: emptyDeclMap(),
    connections: emptyDeclMap(),
    actions: emptyDeclMap(),
    postgres: emptyDeclMap(),
    databases: emptyDeclMap(),
    migrations: emptyDeclMap(),
    disk: emptyDeclMap(),
    computer: emptyDeclMap(),
    operation: emptyDeclMap(),
    skill: emptyDeclMap(),
    agent: emptyDeclMap(),
    decisions: emptyDeclMap(),
    decisionBlocks: new Map(),
    mcp: emptyDeclMap(),
    networks: emptyDeclMap(),
    channels: emptyDeclMap(),
    queries: emptyDeclMap(),
    connector: emptyDeclMap(),
    apps: emptyDeclMap(),
    mocks: emptyDeclMap(),
    playbooks: emptyDeclMap(),
    schemas: emptyDeclMap(),
    secrets: new Map(),
    schemaLiterals: new Map(),
    workflowBlocks: new Map(),
    postgresBlocks: new Map(),
    databaseBlocks: new Map(),
    diskBlocks: new Map(),
    computerBlocks: new Map(),
    operationBlocks: new Map(),
    skillBlocks: new Map(),
    agentBlocks: new Map(),
    mcpBlocks: new Map(),
    channelBlocks: new Map(),
    queryBlocks: new Map(),
    connectionBlocks: new Map(),
    connectorBlocks: new Map(),
    actionBlocks: new Map(),
  }
}

/**
 * Legacy compatibility: synthetic workspace index containing only stream names
 * (no declaration sites). Prefer {@link buildWorkspaceResourceIndex}.
 */
export function workspaceIndexFromStreamNames(names: Set<string>): WorkspaceResourceIndex {
  const idx = emptyWorkspaceResourceIndex()

  for (const n of names) {
    idx.streams.set(n, [])
  }

  return idx
}

/** Union local names with workspace declaration keys (for multi-file validation). */
export function nameLookup(local: Set<string>, ws?: ResourceDeclMap | Set<string>): Set<string> {
  if (!ws) {
    return local
  }

  const keyList = ws instanceof Set ? [...ws] : [...ws.keys()]

  if (keyList.length === 0) {
    return local
  }

  return new Set([...local, ...keyList])
}

export type WorkspaceDuplicate = {
  kind: string
  name: string
  sites: DeclSite[]
}

const RESOURCE_MAP_KINDS: Array<{
  key: keyof Pick<
    WorkspaceResourceIndex,
    | 'forms'
    | 'webhooks'
    | 'schedules'
    | 'workflows'
    | 'streams'
    | 'views'
    | 'auths'
    | 'connections'
    | 'actions'
    | 'postgres'
    | 'databases'
    | 'migrations'
    | 'disk'
    | 'computer'
    | 'operation'
    | 'agent'
    | 'decisions'
    | 'mcp'
    | 'networks'
    | 'channels'
    | 'queries'
    | 'connector'
    | 'apps'
    | 'mocks'
    | 'playbooks'
    | 'schemas'
  >
  label: string
}> = [
  { key: 'forms', label: 'form' },
  { key: 'webhooks', label: 'webhook' },
  { key: 'schedules', label: 'schedule' },
  { key: 'workflows', label: 'workflow' },
  { key: 'streams', label: 'stream' },
  { key: 'views', label: 'view' },
  { key: 'auths', label: 'auth' },
  { key: 'connections', label: 'connection' },
  { key: 'actions', label: 'action' },
  { key: 'postgres', label: 'postgres' },
  { key: 'databases', label: 'database' },
  { key: 'migrations', label: 'migration' },
  { key: 'disk', label: 'disk' },
  { key: 'computer', label: 'computer' },
  { key: 'operation', label: 'operation' },
  { key: 'agent', label: 'agent' },
  { key: 'decisions', label: 'decision' },
  { key: 'mcp', label: 'mcp' },
  { key: 'networks', label: 'network' },
  { key: 'channels', label: 'channel' },
  { key: 'queries', label: 'query' },
  { key: 'connector', label: 'connector' },
  { key: 'apps', label: 'app' },
  { key: 'mocks', label: 'mock' },
  { key: 'playbooks', label: 'playbook' },
  { key: 'schemas', label: 'schema' },
]

/** Names declared more than once across the workspace (same policy as deploy merge). */
export function workspaceDuplicates(idx: WorkspaceResourceIndex): WorkspaceDuplicate[] {
  const out: WorkspaceDuplicate[] = []

  for (const { key, label } of RESOURCE_MAP_KINDS) {
    const m = idx[key]

    if (!m) {
      continue
    }

    for (const [name, sites] of m) {
      if (sites.length > 1) {
        out.push({ kind: label, name, sites })
      }
    }
  }

  for (const [name, entry] of idx.secrets) {
    if (entry.sites.length > 1) {
      out.push({ kind: 'secret', name, sites: entry.sites })
    }
  }

  return out
}

/**
 * Parse-only scan of all `.swirls` files under `cwd` to index top-level resources
 * and resolved schema literals (for cross-file `schemaRef`).
 *
 * A long-lived caller that rebuilds the index as files change (the language
 * server) passes `parse` from a `createParseCache`, so a rebuild re-parses only
 * the files whose text changed. One-shot callers leave it out.
 */
export function buildWorkspaceResourceIndex(args: {
  cwd: string
  fileSystem?: SwirlsWorkspaceFileSystem
  parse?: (source: string) => ParseResult
}): WorkspaceResourceIndex {
  const fileSystem = args.fileSystem ?? nodeWorkspaceFileSystem
  const parse = args.parse ?? parseSource
  const paths = collectSwirlsFiles({ cwd: args.cwd, fileSystem })
  const idx = emptyWorkspaceResourceIndex()
  const allSchemas: SchemaDecl[] = []

  for (const relativePath of paths) {
    const fullPath = join(args.cwd, relativePath)
    let content: string

    try {
      content = fileSystem.readFileSync(fullPath, 'utf-8')
    } catch {
      continue
    }

    const { ast, errors } = parse(content)

    if (errors.length > 0 || !ast) {
      continue
    }

    for (const f of ast.forms ?? []) {
      pushSite(idx.forms, f.name, siteFromRange(relativePath, f.range))
    }

    for (const w of ast.webhooks ?? []) {
      pushSite(idx.webhooks, w.name, siteFromRange(relativePath, w.range))
    }

    for (const s of ast.schedules ?? []) {
      pushSite(idx.schedules, s.name, siteFromRange(relativePath, s.range))
    }

    for (const w of ast.workflows ?? []) {
      pushSite(idx.workflows, w.name, siteFromRange(relativePath, w.range))
      idx.workflowBlocks.set(w.name, w)
    }

    for (const s of ast.streams ?? []) {
      pushSite(idx.streams, s.name, siteFromRange(relativePath, s.range))
    }

    for (const v of ast.views ?? []) {
      pushSite(idx.views, v.name, siteFromRange(relativePath, v.range))
    }

    for (const a of ast.auths ?? []) {
      pushSite(idx.auths, a.name, siteFromRange(relativePath, a.range))
    }

    for (const c of ast.connections ?? []) {
      pushSite(idx.connections, c.name, siteFromRange(relativePath, c.range))
      idx.connectionBlocks.set(c.name, c)
    }

    for (const a of ast.actions ?? []) {
      pushSite(idx.actions, a.name, siteFromRange(relativePath, a.range))
      idx.actionBlocks.set(a.name, a)
    }

    for (const p of ast.postgres ?? []) {
      pushSite(idx.postgres, p.name, siteFromRange(relativePath, p.range))
      idx.postgresBlocks.set(p.name, p)
    }

    for (const db of ast.databases ?? []) {
      pushSite(idx.databases, db.name, siteFromRange(relativePath, db.range))
      idx.databaseBlocks.set(db.name, db)
    }

    for (const m of ast.migrations ?? []) {
      pushSite(idx.migrations, m.name, siteFromRange(relativePath, m.range))
    }

    for (const a of ast.disk ?? []) {
      pushSite(idx.disk, a.name, siteFromRange(relativePath, a.range))
      idx.diskBlocks.set(a.name, a)
    }

    for (const computer of ast.computer ?? []) {
      pushSite(idx.computer, computer.name, siteFromRange(relativePath, computer.range))
      idx.computerBlocks.set(computer.name, computer)
    }

    for (const operation of ast.operations ?? []) {
      pushSite(idx.operation, operation.name, siteFromRange(relativePath, operation.range))
      idx.operationBlocks.set(operation.name, operation)
    }

    for (const s of ast.skill ?? []) {
      pushSite(idx.skill, s.name, siteFromRange(relativePath, s.range))
      idx.skillBlocks.set(s.name, s)
    }

    for (const d of ast.decisions ?? []) {
      pushSite(idx.decisions!, d.name, siteFromRange(relativePath, d.range))
      idx.decisionBlocks!.set(d.name, d)
    }

    for (const a of ast.agent ?? []) {
      pushSite(idx.agent, a.name, siteFromRange(relativePath, a.range))
      idx.agentBlocks.set(a.name, a)
    }

    for (const m of ast.mcp ?? []) {
      pushSite(idx.mcp, m.name, siteFromRange(relativePath, m.range))
      idx.mcpBlocks.set(m.name, m)
    }

    for (const network of ast.networks ?? []) {
      if (idx.networks) {
        pushSite(idx.networks, network.name, siteFromRange(relativePath, network.range))
      }
    }

    for (const ch of ast.channels ?? []) {
      pushSite(idx.channels, ch.name, siteFromRange(relativePath, ch.range))
      idx.channelBlocks.set(ch.name, ch)
    }

    for (const q of ast.queries ?? []) {
      pushSite(idx.queries, q.name, siteFromRange(relativePath, q.range))
      idx.queryBlocks.set(q.name, q)
    }

    for (const c of ast.connector ?? []) {
      pushSite(idx.connector, c.name, siteFromRange(relativePath, c.range))
      idx.connectorBlocks.set(c.name, c)
    }

    for (const a of ast.apps ?? []) {
      pushSite(idx.apps, a.name, siteFromRange(relativePath, a.range))
    }

    for (const m of ast.mocks ?? []) {
      pushSite(idx.mocks, m.name, siteFromRange(relativePath, m.range))
    }

    for (const p of ast.playbooks ?? []) {
      pushSite(idx.playbooks, p.name, siteFromRange(relativePath, p.range))
    }

    for (const sch of ast.schemas ?? []) {
      pushSite(idx.schemas, sch.name, siteFromRange(relativePath, sch.range))
    }

    for (const sec of ast.secrets ?? []) {
      mergeSecretVars(
        idx.secrets,
        sec.name,
        sec.vars,
        siteFromRange(relativePath, sec.range),
        sec.type,
      )
    }

    allSchemas.push(...(ast.schemas ?? []))
  }

  idx.schemaLiterals = resolveNamedSchemasFromDecls(allSchemas).map

  return idx
}
