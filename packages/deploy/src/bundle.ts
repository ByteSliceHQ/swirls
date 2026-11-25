import { z } from 'zod'

import { type DecisionDefinition, decisionOutputSchema } from '@swirls/definition/decision'
import { parseDeploymentDefinition } from '@swirls/definition/deployment-definition'
import {
  agentNodeConfigSchema,
  integrationNodeConfigSchema,
  reviewConfigSchema,
} from '@swirls/definition/schemas'
import type {
  ActionDecl,
  ConfigValue,
  JsonSchemaLiteral,
  LanguageHost,
  Diagnostic,
  SecretsDecl,
  SwirlsFile,
  WorkflowDecl,
} from '@swirls/language'
import {
  agentContextToDeploymentPayload,
  agentSandboxToDeploymentPayload,
  agentSuggestionsToDeploymentPayload,
  agentWalletToDeploymentPayload,
  channelResponsePolicyToDeploymentPayload,
  extractSqlParams,
  inlineNamedSchemaRefs,
  parseDurationSeconds,
  resolveActionInputSchema,
  resolveActionOutputSchema,
  resolveAgentProvider,
  resolveDecisionDefinition,
  resolveNamedSchemasFromDecls,
  validateViewExecutionCycles,
} from '@swirls/language'
import {
  buildWorkspaceResourceIndex,
  parseSwirlsFile,
  type WorkspaceResourceIndex,
} from '@swirls/language/workspace'

import { collectSwirlsFiles } from './collect-swirls-files'
import { compileComputerRecipe } from './computer/recipe'
import { type DeployBundleFs, deployBundleToWorkspaceFileSystem } from './fs'
import { uuidv7 } from './ids'
import {
  buildActionSchemaLiterals,
  buildActionsByName,
  inlineIntegrationActionConfig,
} from './inline-integration-action'
import {
  buildConfigValueKindsFromNodeDecl,
  buildWorkflowNodeConfigFromNodeDecl,
  flattenInlineSubgraphsInGraph,
} from './node-config'
import { normalizeHeaderName } from './normalize-header-name'
import { compileOperationBlock } from './operation'
import { sha256Hex } from './sha256'
import { stripEditorMetadata } from './strip-metadata'

function configValueToDeploymentString(cv: ConfigValue): string | undefined {
  switch (cv.kind) {
    case 'string':
    case 'number':
    case 'null':
    case 'boolean':
      return String(cv.value)
    default:
      return undefined
  }
}

/** Inline @ts block body for deployment stream fields (file refs must be inlined separately). */
function streamTsBlockCode(cv: ConfigValue | undefined): string | undefined {
  if (!cv || cv.kind !== 'ts_block') {
    return undefined
  }

  const c = cv.code?.trim()
  return c || undefined
}

function sqlBlockCode(cv: ConfigValue | undefined): string | undefined {
  if (!cv || cv.kind !== 'sql_block') {
    return undefined
  }

  const c = cv.code?.trim()
  return c || undefined
}

function streamPrepareCode(cv: ConfigValue | undefined): string {
  return streamTsBlockCode(cv) ?? ''
}

/**
 * Extract the typed `@ts` body of a `migration` block's `operation`.
 *
 * `ts_file_ref` operations are inlined into `ts_block` at parse time by
 * `inlineTsFileRefs` (the same path streams/workflows use), so reaching a
 * `ts_file_ref` here means the AST was bundled without that inlining pass —
 * we throw a clear error rather than silently dropping the body.
 */
function migrationOperationCode(cv: ConfigValue | undefined, migrationName: string): string {
  if (cv?.kind === 'ts_block') {
    const code = cv.code?.trim()

    if (code) {
      return code
    }

    throw new Error(`Migration "${migrationName}" has an empty operation: @ts { … } block`)
  }

  if (cv?.kind === 'ts_file_ref') {
    throw new Error(
      `Migration "${migrationName}" operation references an un-inlined @ts file "${cv.path}"; inline ts file refs before bundling`,
    )
  }

  throw new Error(`Migration "${migrationName}" must define operation: @ts { … }`)
}

function brandTokenMapToPayload(
  map: Record<string, { value: string } | undefined>,
): Record<string, string> {
  const payload: Record<string, string> = {}

  for (const [key, entry] of Object.entries(map)) {
    if (entry === undefined) {
      continue
    }

    payload[key] = entry.value
  }

  return payload
}

function omitCredentialFieldsFromConfigFields(
  fields: Record<string, ConfigValue>,
): Record<string, ConfigValue> {
  const { auth: _auth, connection: _connection, ...rest } = fields
  return rest
}

function httpAuthRefFromConfigFields(
  nodeType: string,
  fields: Record<string, ConfigValue>,
): string | undefined {
  if (nodeType !== 'http') {
    return undefined
  }

  const auth = fields.auth

  if (!auth || auth.kind !== 'string') {
    return undefined
  }

  return auth.value
}

function nodeConnectionRefFromConfigFields(
  nodeType: string,
  fields: Record<string, ConfigValue>,
): string | undefined {
  if (nodeType !== 'http' && nodeType !== 'integration') {
    return undefined
  }

  const connection = fields.connection

  if (!connection || connection.kind !== 'string') {
    return undefined
  }

  return connection.value
}

function nodeActionRefFromConfigFields(
  nodeType: string,
  fields: Record<string, ConfigValue>,
): string | undefined {
  if (nodeType !== 'integration') {
    return undefined
  }

  const action = fields.action

  if (!action || action.kind !== 'string') {
    return undefined
  }

  return action.value
}

function recordConflict(seen: Map<string, string>, kind: string, name: string, filePath: string) {
  const key = `${kind}:${name}`
  const prev = seen.get(key)

  if (prev !== undefined) {
    throw new Error(
      `Duplicate ${kind} name "${name}" in "${filePath}" and "${prev}". Each resource name must be unique across all .swirls files in this project.`,
    )
  }

  seen.set(key, filePath)
}

function markSourcePath<T extends { range?: unknown }>(decl: T, filePath: string): T {
  Object.assign(decl as Record<string, unknown>, { sourcePath: filePath })
  return decl
}

function markWorkflowSourcePath(workflow: SwirlsFile['workflows'][number], filePath: string) {
  markSourcePath(workflow, filePath)

  for (const node of workflow.nodes) {
    markSourcePath(node, filePath)

    for (const subNode of node.subgraph?.nodes ?? []) {
      markSourcePath(subNode, filePath)
    }
  }

  return workflow
}

function formatDeploymentDiagnostic(diagnostic: Diagnostic): string {
  const line = diagnostic.range.start.line
  const column = diagnostic.range.start.column
  return `${diagnostic.message} (line ${line}, column ${column})`
}

function assertNoMergedViewExecutionCycles(ast: SwirlsFile): void {
  const diagnostics = validateViewExecutionCycles(ast).filter((d) => d.severity !== 'warning')

  if (diagnostics.length === 0) {
    return
  }

  throw new Error(
    `Deployment contains view execution cycle(s):\n${diagnostics
      .map(formatDeploymentDiagnostic)
      .join('\n')}`,
  )
}

function secretVarsForRef(
  secrets: SecretsDecl[] | undefined,
  secretsRef?: string,
): string[] | undefined {
  const ref = secretsRef?.trim()

  if (!ref) {
    return undefined
  }

  const blk = secrets?.find((s) => s.name === ref)
  return blk?.vars
}

function mergedSecretsForAgentNode(opts: {
  nodeSecrets?: Record<string, string[]>
  agentSecretsRef?: string
  vars?: string[]
}): Record<string, string[]> | undefined {
  const ref = opts.agentSecretsRef?.trim()
  const vars = opts.vars

  const inferred =
    ref && vars && vars.length > 0 ? { [ref]: vars } : ({} as Record<string, string[]>)

  const nodeMap = opts.nodeSecrets ?? {}
  const merged = { ...inferred, ...nodeMap }
  return Object.keys(merged).length > 0 ? merged : undefined
}

export interface MergeProjectOptions {
  /**
   * The runtime's provider catalog, `@openui` checker and harness catalog.
   * Without it those runtime-specific checks are skipped.
   */
  host?: LanguageHost
}

export interface BuildDefinitionOptions {
  /** Makes the id of every resource and node. Defaults to a UUIDv7. */
  newId?: () => string
}

/**
 * Parse every `.swirls` file under `cwd` and merge into a single bundle.
 * Fails on duplicate top-level resource names (forms, webhooks, schedules, workflows, streams, triggers, secret, auth).
 */
export function mergeProjectSwirlsFiles(
  fs: DeployBundleFs,
  cwd: string,
  options?: MergeProjectOptions,
): SwirlsFile {
  const paths = collectSwirlsFiles(fs, cwd)
  const fileSystem = deployBundleToWorkspaceFileSystem(fs)

  const workspace = buildWorkspaceResourceIndex({
    cwd,
    fileSystem,
  })

  const merged: SwirlsFile = {
    schemas: [],
    forms: [],
    webhooks: [],
    schedules: [],
    workflows: [],
    streams: [],
    views: [],
    triggers: [],
    secrets: [],
    auths: [],
    postgres: [],
    databases: [],
    migrations: [],
    disk: [],
    computer: [],
    operations: [],
    skill: [],
    agent: [],
    decisions: [],
    mcp: [],
    networks: [],
    channels: [],
    queries: [],
    connections: [],
    connector: [],
    actions: [],
    roles: [],
    policies: [],
    apps: [],
    mocks: [],
    playbooks: [],
  }

  const seen = new Map<string, string>()

  for (const filePath of paths) {
    const ast = parseSwirlsFile({
      cwd,
      relativePath: filePath,
      fileSystem,
      workspace,
      host: options?.host,
    })

    if (!ast) {
      // parseSwirlsFile returns null only when the file cannot be read. The
      // path came from scanning this same filesystem, so skipping here would
      // silently deploy a bundle missing every schedule, trigger, stream, and
      // workflow the file defines — with outcome "success".
      throw new Error(
        `Failed to read "${filePath}" while bundling the deployment. The file was found while scanning the workspace but could not be read, so the deploy was aborted instead of silently dropping the resources it defines.`,
      )
    }

    for (const d of ast.decisions ?? []) {
      recordConflict(seen, 'decision', d.name, filePath)
      merged.decisions!.push(markSourcePath(d, filePath))
    }

    for (const f of ast.forms) {
      recordConflict(seen, 'form', f.name, filePath)
      merged.forms.push(markSourcePath(f, filePath))
    }

    for (const w of ast.webhooks) {
      recordConflict(seen, 'webhook', w.name, filePath)
      merged.webhooks.push(markSourcePath(w, filePath))
    }

    for (const s of ast.schedules) {
      recordConflict(seen, 'schedule', s.name, filePath)
      merged.schedules.push(markSourcePath(s, filePath))
    }

    for (const g of ast.workflows) {
      recordConflict(seen, 'workflow', g.name, filePath)
      merged.workflows.push(markWorkflowSourcePath(g, filePath))
    }

    for (const s of ast.streams ?? []) {
      recordConflict(seen, 'stream', s.name, filePath)
      merged.streams.push(markSourcePath(s, filePath))
    }

    for (const v of ast.views ?? []) {
      recordConflict(seen, 'view', v.name, filePath)
      merged.views.push(markSourcePath(v, filePath))
    }

    for (const t of ast.triggers) {
      recordConflict(seen, 'trigger', t.name, filePath)
      merged.triggers.push(markSourcePath(t, filePath))
    }

    for (const s of ast.secrets ?? []) {
      recordConflict(seen, 'secret', s.name, filePath)
      merged.secrets.push(markSourcePath(s, filePath))
    }

    for (const a of ast.auths ?? []) {
      recordConflict(seen, 'auth', a.name, filePath)
      merged.auths.push(markSourcePath(a, filePath))
    }

    for (const p of ast.postgres ?? []) {
      recordConflict(seen, 'postgres', p.name, filePath)
      merged.postgres.push(markSourcePath(p, filePath))
    }

    for (const d of ast.databases ?? []) {
      recordConflict(seen, 'database', d.name, filePath)
      merged.databases.push(markSourcePath(d, filePath))
    }

    for (const m of ast.migrations ?? []) {
      recordConflict(seen, 'migration', m.name, filePath)
      merged.migrations.push(markSourcePath(m, filePath))
    }

    for (const a of ast.disk ?? []) {
      recordConflict(seen, 'disk', a.name, filePath)
      merged.disk.push(markSourcePath(a, filePath))
    }

    for (const computer of ast.computer ?? []) {
      recordConflict(seen, 'computer', computer.name, filePath)
      merged.computer.push(markSourcePath(computer, filePath))
    }

    for (const operation of ast.operations ?? []) {
      recordConflict(seen, 'operation', operation.name, filePath)
      merged.operations.push(markSourcePath(operation, filePath))
    }

    for (const s of ast.skill ?? []) {
      recordConflict(seen, 'skill', s.name, filePath)
      merged.skill.push(markSourcePath(s, filePath))
    }

    for (const a of ast.agent ?? []) {
      recordConflict(seen, 'agent', a.name, filePath)
      merged.agent.push(markSourcePath(a, filePath))
    }

    for (const m of ast.mcp ?? []) {
      recordConflict(seen, 'mcp', m.name, filePath)
      merged.mcp.push(markSourcePath(m, filePath))
    }

    for (const network of ast.networks ?? []) {
      recordConflict(seen, 'network', network.name, filePath)
      merged.networks?.push(markSourcePath(network, filePath))
    }

    for (const ch of ast.channels ?? []) {
      recordConflict(seen, 'channel', ch.name, filePath)
      merged.channels.push(markSourcePath(ch, filePath))
    }

    for (const q of ast.queries ?? []) {
      recordConflict(seen, 'query', q.name, filePath)
      merged.queries.push(markSourcePath(q, filePath))
    }

    for (const c of ast.connections ?? []) {
      recordConflict(seen, 'connection', c.name, filePath)
      merged.connections.push(markSourcePath(c, filePath))
    }

    for (const c of ast.connector ?? []) {
      recordConflict(seen, 'connector', c.name, filePath)
      merged.connector.push(markSourcePath(c, filePath))
    }

    for (const a of ast.actions ?? []) {
      recordConflict(seen, 'action', a.name, filePath)
      merged.actions.push(markSourcePath(a, filePath))
    }

    for (const sch of ast.schemas ?? []) {
      recordConflict(seen, 'schema', sch.name, filePath)
      merged.schemas.push(markSourcePath(sch, filePath))
    }

    for (const role of ast.roles ?? []) {
      recordConflict(seen, 'role', role.name, filePath)
      merged.roles.push(markSourcePath(role, filePath))
    }

    for (const p of ast.policies ?? []) {
      merged.policies.push(markSourcePath(p, filePath))
    }

    for (const app of ast.apps ?? []) {
      recordConflict(seen, 'app', app.name, filePath)
      merged.apps.push(markSourcePath(app, filePath))
    }

    for (const mock of ast.mocks ?? []) {
      recordConflict(seen, 'mock', mock.name, filePath)
      merged.mocks.push(markSourcePath(mock, filePath))
    }

    for (const playbook of ast.playbooks ?? []) {
      recordConflict(seen, 'playbook', playbook.name, filePath)
      merged.playbooks.push(markSourcePath(playbook, filePath))
    }

    if (ast.version !== undefined && merged.version === undefined) {
      merged.version = ast.version
    }
  }

  return merged
}

function buildDeploymentWorkflowPayload(
  g: WorkflowDecl,
  ctx: {
    decisionsByName: Map<string, DecisionDefinition>
    agentsByName: Map<string, NonNullable<SwirlsFile['agent']>[number]>
    secrets: SecretsDecl[] | undefined
    actionsByName: Map<string, ActionDecl>
    schemaLiterals: Map<string, JsonSchemaLiteral>
    workspace?: WorkspaceResourceIndex
    newId: () => string
  },
) {
  const { newId } = ctx

  let executionTokenTtlSeconds: number | undefined

  if (g.executionTokenTtl !== undefined) {
    const parsedTtlSeconds = parseDurationSeconds(g.executionTokenTtl)

    if (parsedTtlSeconds === null || parsedTtlSeconds < 5 * 60 || parsedTtlSeconds > 24 * 60 * 60) {
      throw new Error(
        `Workflow "${g.name}": executionTokenTtl must be a quoted whole-number duration between 5m and 24h`,
      )
    }

    executionTokenTtlSeconds = parsedTtlSeconds
  }

  const workflowId = newId()
  const nameToNodeId = new Map<string, string>()

  for (const n of g.nodes) {
    nameToNodeId.set(n.name, newId())
  }

  const nodes = g.nodes.map((n) => {
    const id = nameToNodeId.get(n.name)

    if (!id) {
      throw new Error(`Workflow "${g.name}": internal error resolving node id`)
    }

    let reviewParsed: z.infer<typeof reviewConfigSchema> | null = null

    if (n.reviewConfig !== undefined) {
      const r = reviewConfigSchema.safeParse(n.reviewConfig)

      if (!r.success) {
        throw new Error(
          `Workflow "${g.name}", node "${n.name}": invalid review config\n${z.prettifyError(r.error)}`,
        )
      }

      reviewParsed = r.data
    }

    const authRef = httpAuthRefFromConfigFields(n.type, n.configFields)
    const connectionRef = nodeConnectionRefFromConfigFields(n.type, n.configFields)
    const actionRef = nodeActionRefFromConfigFields(n.type, n.configFields)

    let persistConfig = buildWorkflowNodeConfigFromNodeDecl({
      type: n.type,
      configFields: omitCredentialFieldsFromConfigFields(n.configFields),
    })

    if (persistConfig.type === 'decision') {
      const definition = ctx.decisionsByName.get(persistConfig.decision)

      if (!definition) {
        throw new Error(`Unknown decision: ${persistConfig.decision}`)
      }

      const block = ctx.secrets?.find((s) => s.name === definition.secrets)

      if (!block || !block.vars.includes('TYPESAFE_API_KEY')) {
        throw new Error(
          `Decision ${definition.name} requires an explicit secret block declaring TYPESAFE_API_KEY`,
        )
      }

      persistConfig = { ...persistConfig, definition }
    }

    if (n.type === 'integration') {
      const parsedIntegration = integrationNodeConfigSchema.safeParse(persistConfig)

      if (parsedIntegration.success) {
        persistConfig = inlineIntegrationActionConfig(parsedIntegration.data, {
          actionsByName: ctx.actionsByName,
          schemaLiterals: ctx.schemaLiterals,
          workspace: ctx.workspace,
          workflowName: g.name,
          nodeName: n.name,
        })
      }
    }

    const configValueKinds = buildConfigValueKindsFromNodeDecl({
      type: n.type,
      configFields: omitCredentialFieldsFromConfigFields(n.configFields),
    })

    let secretsMapPayload: Record<string, string[]> | undefined = n.secretsMap

    if (persistConfig.type === 'decision' && persistConfig.definition) {
      secretsMapPayload = {
        [persistConfig.definition.secrets]: ['TYPESAFE_API_KEY'],
      }
    }

    if (n.type === 'agent') {
      const parsedCfg = agentNodeConfigSchema.safeParse(persistConfig)

      if (parsedCfg.success) {
        const agentDecl = ctx.agentsByName.get(parsedCfg.data.agent.trim())
        const ref = agentDecl?.secretsRef

        secretsMapPayload = mergedSecretsForAgentNode({
          nodeSecrets: n.secretsMap ?? undefined,
          agentSecretsRef: ref,
          vars: secretVarsForRef(ctx.secrets, ref),
        })
      }
    }

    return {
      id,
      name: n.name,
      type: n.type,
      label: n.label,
      description: n.description,
      isRoot: n.isRoot,
      config: persistConfig,
      reviewConfig: reviewParsed,
      inputSchema: n.inputSchema ?? undefined,
      outputSchema:
        persistConfig.type === 'decision' && persistConfig.definition
          ? decisionOutputSchema(persistConfig.definition)
          : (n.outputSchema ?? undefined),
      ...(secretsMapPayload != null ? { secretsMap: secretsMapPayload } : {}),
      ...(authRef !== undefined ? { authRef } : {}),
      ...(connectionRef !== undefined ? { connectionRef } : {}),
      ...(actionRef !== undefined ? { actionRef } : {}),
      ...(configValueKinds != null ? { configValueKinds } : {}),
      ...(n.outputFormat !== undefined && n.outputFormat !== ''
        ? { outputFormat: n.outputFormat }
        : {}),
    }
  })

  const edges = g.edges.map((e) => {
    const sourceNodeId = nameToNodeId.get(e.source)
    const targetNodeId = nameToNodeId.get(e.target)

    if (!sourceNodeId || !targetNodeId) {
      throw new Error(
        `Workflow "${g.name}": edge references unknown node (source="${e.source}", target="${e.target}")`,
      )
    }

    return {
      id: newId(),
      sourceNodeId,
      targetNodeId,
      label: e.label,
    }
  })

  return {
    id: workflowId,
    name: g.name,
    label: g.label,
    description: g.description,
    ...(g.concurrency !== undefined ? { concurrency: g.concurrency } : {}),
    ...(executionTokenTtlSeconds !== undefined ? { executionTokenTtlSeconds } : {}),
    nodes,
    edges,
  }
}

/**
 * Strip editor metadata, assign stable UUIDs, and build the API deployment definition shape.
 */
export function buildDeploymentDefinitionPayload(
  merged: SwirlsFile,
  options?: BuildDefinitionOptions,
): {
  definition: Record<string, unknown>
  parseError: z.ZodError | null
} {
  const newId = options?.newId ?? uuidv7

  assertNoMergedViewExecutionCycles(merged)

  const inlined = inlineNamedSchemaRefs(merged)
  const stripped = stripEditorMetadata(inlined) as SwirlsFile

  const { map: resolvedSchemaLiterals } = resolveNamedSchemasFromDecls(merged.schemas ?? [])

  const schemasPayload = (merged.schemas ?? []).map((decl) => {
    const literal = resolvedSchemaLiterals.get(decl.name)

    if (literal === undefined) {
      throw new Error(`Schema "${decl.name}" could not be resolved — fix schema declarations`)
    }

    return {
      id: newId(),
      name: decl.name,
      label: decl.label,
      description: decl.description,
      schema: literal,
    }
  })

  const forms = stripped.forms.map((f) => ({
    id: newId(),
    name: f.name,
    label: f.label,
    description: f.description,
    schema: f.schema ?? undefined,
    enabled: f.enabled,
    visibility: f.visibility,
    authName: f.authRef?.name,
  }))

  const webhooks = stripped.webhooks.map((w) => ({
    id: newId(),
    name: w.name,
    label: w.label,
    description: w.description,
    schema: w.schema ?? undefined,
    enabled: w.enabled,
    secretRefBlock: w.secretRef?.blockName,
    secretRefVar: w.secretRef?.varName,
    headerName: w.header ? normalizeHeaderName(w.header.value) : undefined,
  }))

  const schedules = stripped.schedules.map((s) => ({
    id: newId(),
    name: s.name,
    label: s.label,
    description: s.description,
    cron: s.cron,
    timezone: s.timezone,
    enabled: s.enabled,
  }))

  const agentsByName = new Map((stripped.agent ?? []).map((a) => [a.name, a]))
  const actionsByName = buildActionsByName(stripped)
  const actionSchemaLiterals = buildActionSchemaLiterals(stripped)

  const decisionBlocks = (merged.decisions ?? []).map((d) =>
    resolveDecisionDefinition(d, resolvedSchemaLiterals),
  )

  const deployCtx = {
    decisionsByName: new Map(decisionBlocks.map((d) => [d.name, d])),
    agentsByName,
    secrets: stripped.secrets,
    actionsByName,
    schemaLiterals: actionSchemaLiterals,
    newId,
  }

  const workflows = stripped.workflows.flatMap((decl) => {
    const { graph: flatGraph, synthesizedGraphs } = flattenInlineSubgraphsInGraph(decl)
    return [
      buildDeploymentWorkflowPayload(flatGraph, deployCtx),
      // Inline map/fanout/while subgraphs are flattened into synthetic graphs. They
      // are carried to the worker via `preloadedWorkflows` and intentionally
      // marked synthetic so deploy never persists them as workflow snapshots
      // (otherwise they'd surface as bogus entries in the workflow list / UI).
      ...synthesizedGraphs.map((g) => ({
        ...buildDeploymentWorkflowPayload(g, deployCtx),
        synthetic: true,
      })),
    ]
  })

  const formByName = new Map(forms.map((f) => [f.name, f.id]))
  const webhookByName = new Map(webhooks.map((w) => [w.name, w.id]))
  const scheduleByName = new Map(schedules.map((s) => [s.name, s.id]))
  const workflowByName = new Map(workflows.map((g) => [g.name, g.id]))

  const triggers: Array<{
    id: string
    name: string
    resourceType: string
    resourceId: string
    workflowId: string
    enabled?: boolean
  }> = []

  for (const t of stripped.triggers) {
    const workflowId = workflowByName.get(t.workflowName)

    if (!workflowId) {
      throw new Error(`Trigger "${t.name}": references unknown workflow "${t.workflowName}"`)
    }

    let resourceId: string | undefined

    switch (t.resourceType) {
      case 'form':
        resourceId = formByName.get(t.resourceName)
        break
      case 'webhook':
        resourceId = webhookByName.get(t.resourceName)
        break
      case 'schedule':
        resourceId = scheduleByName.get(t.resourceName)
        break
      default:
        throw new Error(`Trigger "${t.name}": unsupported resource type "${t.resourceType}"`)
    }

    if (!resourceId) {
      throw new Error(
        `Trigger "${t.name}": references unknown ${t.resourceType} "${t.resourceName}"`,
      )
    }

    triggers.push({
      id: newId(),
      name: t.name,
      resourceType: t.resourceType,
      resourceId,
      workflowId,
      enabled: t.enabled,
    })
  }

  const secretBlocks = (stripped.secrets ?? []).map((s) => ({
    id: newId(),
    name: s.name,
    label: s.label,
    description: s.description,
    type: s.type,
    vars: s.vars,
  }))

  const authBlocks = (stripped.auths ?? []).map((a) => {
    const config: Record<string, string> = {}

    for (const [k, v] of Object.entries(a.configFields)) {
      if (k === 'type' || k === 'secrets') {
        continue
      }

      const s = configValueToDeploymentString(v)

      if (s !== undefined) {
        config[k] = s
      }
    }

    return {
      id: newId(),
      name: a.name,
      label: a.label,
      description: a.description,
      authType: a.authType,
      secretBlockName: a.secretsRef,
      config,
    }
  })

  const postgresBlocks = (stripped.postgres ?? []).map((p) => ({
    id: newId(),
    name: p.name,
    secretsRef: p.secretsRef,
    connection: p.connection,
    connectionIsLiteral: p.connectionIsLiteral,
    ...(p.networkRef !== undefined ? { networkRef: p.networkRef } : {}),
    tables: p.tables.map((t) => ({
      name: t.name,
      schema: t.schema,
    })),
  }))

  const databaseBlocks = (stripped.databases ?? []).map((d) => {
    const schema = d.schemaSource ?? ''

    if (schema.trim().length === 0) {
      throw new Error(`Database "${d.name}" must define a non-empty schema: @prisma { … }`)
    }

    return {
      id: newId(),
      name: d.name,
      label: d.label,
      description: d.description,
      schema,
      schemaChecksum: sha256Hex(schema),
      connections: (d.connections ?? []).map((connection) => ({
        id: newId(),
        name: connection.name,
        label: connection.label,
        description: connection.description,
      })),
    }
  })

  const declaredDatabaseNames = new Set(databaseBlocks.map((d) => d.name))
  const seenDatabaseOrder = new Set<string>()

  const databaseMigrations = (stripped.migrations ?? []).map((m) => {
    if (!declaredDatabaseNames.has(m.database)) {
      throw new Error(`Migration "${m.name}" references undeclared database "${m.database}"`)
    }

    const orderKey = `${m.database}#${m.order}`

    if (seenDatabaseOrder.has(orderKey)) {
      throw new Error(
        `Migration "${m.name}" reuses order ${m.order} for database "${m.database}"; (database, order) pairs must be unique`,
      )
    }

    seenDatabaseOrder.add(orderKey)
    return {
      id: newId(),
      name: m.name,
      database: m.database,
      order: m.order,
      operationCode: migrationOperationCode(m.operation, m.name),
    }
  })

  const diskBlocks = (stripped.disk ?? []).map((a) => ({
    id: newId(),
    name: a.name,
    label: a.label,
    region: a.region,
  }))

  const skillBlocks = (stripped.skill ?? []).map((s) => ({
    id: newId(),
    name: s.name,
    skillName: s.skillName,
  }))

  const agentBlocks = (stripped.agent ?? []).map((a) => ({
    id: newId(),
    name: a.name,
    label: a.label,
    description: a.description,
    provider: resolveAgentProvider(a.provider),
    model: a.model,
    secretsRef: a.secretsRef,
    secretVars: secretVarsForRef(stripped.secrets ?? [], a.secretsRef),
    defaultSystemCode: a.systemCode,
    temperature: a.temperature,
    maxTokens: a.maxTokens,
    maxSteps: a.maxSteps,
    tools: a.tools,
    skills: a.skills,
    mcp: a.mcp,
    team: a.team,
    computer: a.computer,
    disks: a.disks,
    sandbox: agentSandboxToDeploymentPayload(a.sandbox),
    wallet: agentWalletToDeploymentPayload(a.wallet),
    context: agentContextToDeploymentPayload(a.context),
    roles: (a.profiles ?? []).map((r) => ({
      name: r.name,
      description: r.description,
      systemCode: r.systemCode,
      tools: r.tools,
      skills: r.skills,
      mcp: r.mcp,
      sandbox: agentSandboxToDeploymentPayload(r.sandbox),
    })),
    suggestions: agentSuggestionsToDeploymentPayload(a.suggestions),
  }))

  const computersBoundByAgents = new Set(
    agentBlocks.flatMap((agent) => (agent.computer ? [agent.computer] : [])),
  )

  const computerBlocks = (stripped.computer ?? []).map((computer) => {
    const compiled = compileComputerRecipe({
      name: computer.name,
      label: computer.label,
      description: computer.description,
      software: computer.software,
      disks: computer.disks,
      resources: computer.resources,
      ...(computer.harness
        ? {
            harness: {
              type: computer.harness.type,
              provider: computer.harness.provider,
            },
          }
        : {}),
      boundByAgent: computersBoundByAgents.has(computer.name),
    })

    return {
      id: newId(),
      ...compiled,
    }
  })

  const operationBlocks = (stripped.operations ?? []).map((operation) => ({
    id: newId(),
    ...compileOperationBlock(operation),
  }))

  const streams = (stripped.streams ?? []).map((s) => {
    const versionsPayload: Record<
      string,
      { schema: unknown; conditionCode?: string; prepareCode: string }
    > = {}

    for (const v of s.versions) {
      if (v.schema == null) {
        throw new Error(`Stream "${s.name}" version "${v.key}" must define a schema`)
      }

      if (versionsPayload[v.key] !== undefined) {
        throw new Error(`Stream "${s.name}" has duplicate version key "${v.key}"`)
      }

      versionsPayload[v.key] = {
        schema: v.schema,
        conditionCode: streamTsBlockCode(v.condition),
        prepareCode: streamPrepareCode(v.prepare),
      }
    }

    if (Object.keys(versionsPayload).length === 0) {
      throw new Error(`Stream "${s.name}" must declare versions { }`)
    }

    const active = (s.version ?? '').trim()

    if (!active || versionsPayload[active] === undefined) {
      throw new Error(`Stream "${s.name}" has invalid active version "${s.version ?? ''}"`)
    }

    return {
      id: newId(),
      name: s.name,
      label: s.label,
      description: s.description,
      enabled: s.enabled,
      workflowName: s.workflowName,
      version: active,
      versions: versionsPayload,
    }
  })

  const views = (stripped.views ?? []).map((v) => {
    if (v.schema == null) {
      throw new Error(`View "${v.name}" must define a schema`)
    }

    const columnsCode = streamTsBlockCode(v.columns)

    if (!columnsCode) {
      throw new Error(`View "${v.name}" must define columns: @ts { … }`)
    }

    const seenComputed = new Set<string>()

    const computed = (v.computed ?? []).map((col) => {
      if (seenComputed.has(col.name)) {
        throw new Error(`View "${v.name}" has duplicate computed column "${col.name}"`)
      }

      seenComputed.add(col.name)

      const inputCode = streamTsBlockCode(col.input)

      if (!inputCode) {
        throw new Error(
          `View "${v.name}" computed column "${col.name}" must define input: @ts { … }`,
        )
      }

      return {
        name: col.name,
        workflowName: col.workflowName,
        inputCode,
        outputCode: streamTsBlockCode(col.output),
      }
    })

    return {
      id: newId(),
      name: v.name,
      label: v.label,
      description: v.description,
      enabled: v.enabled,
      streams: v.streams.map((s) => s.name),
      schema: v.schema,
      columnsCode,
      computed,
    }
  })

  const channelsByName = new Map(
    (stripped.channels ?? []).map((channel) => [channel.name, channel]),
  )

  const apps = (stripped.apps ?? []).map((a) => ({
    id: newId(),
    name: a.name,
    label: a.label ?? a.name,
    ...(a.description !== undefined ? { description: a.description } : {}),
    ...(a.icon !== undefined ? { icon: a.icon } : {}),
    ...(a.brand !== undefined
      ? {
          brand: {
            ...(a.brand.accent !== undefined ? { accent: a.brand.accent } : {}),
            ...(a.brand.logo !== undefined ? { logo: a.brand.logo } : {}),
            ...(a.brand.theme !== undefined ? { theme: a.brand.theme } : {}),
            ...(a.brand.tokens !== undefined
              ? {
                  tokens: {
                    ...(a.brand.tokens.light !== undefined
                      ? { light: brandTokenMapToPayload(a.brand.tokens.light) }
                      : {}),
                    ...(a.brand.tokens.dark !== undefined
                      ? { dark: brandTokenMapToPayload(a.brand.tokens.dark) }
                      : {}),
                  },
                }
              : {}),
            ...(a.brand.avatar !== undefined
              ? {
                  avatar: {
                    ...(a.brand.avatar.variant !== undefined
                      ? { variant: a.brand.avatar.variant }
                      : {}),
                    ...(a.brand.avatar.colors !== undefined
                      ? { colors: [...a.brand.avatar.colors] }
                      : {}),
                    ...(a.brand.avatar.shape !== undefined ? { shape: a.brand.avatar.shape } : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(a.landing !== undefined
      ? {
          landing: {
            ...(a.landing.layout !== undefined ? { layout: a.landing.layout } : {}),
            ...(a.landing.image !== undefined ? { image: a.landing.image } : {}),
            ...(a.landing.title !== undefined ? { title: a.landing.title } : {}),
            ...(a.landing.subtitle !== undefined ? { subtitle: a.landing.subtitle } : {}),
            ...(a.landing.signInTitle !== undefined ? { signInTitle: a.landing.signInTitle } : {}),
            ...(a.landing.signInHint !== undefined ? { signInHint: a.landing.signInHint } : {}),
            ...(a.landing.footer !== undefined ? { footer: a.landing.footer } : {}),
            ...(a.landing.discover !== undefined
              ? {
                  discover: {
                    ...(a.landing.discover.index !== undefined
                      ? { index: a.landing.discover.index }
                      : {}),
                    ...(a.landing.discover.metaTitle !== undefined
                      ? { metaTitle: a.landing.discover.metaTitle }
                      : {}),
                    ...(a.landing.discover.metaDescription !== undefined
                      ? { metaDescription: a.landing.discover.metaDescription }
                      : {}),
                    ...(a.landing.discover.keywords !== undefined
                      ? { keywords: a.landing.discover.keywords }
                      : {}),
                    ...(a.landing.discover.ogImage !== undefined
                      ? { ogImage: a.landing.discover.ogImage }
                      : {}),
                    ...(a.landing.discover.canonical !== undefined
                      ? { canonical: a.landing.discover.canonical }
                      : {}),
                    ...(a.landing.discover.locale !== undefined
                      ? { locale: a.landing.discover.locale }
                      : {}),
                    ...(a.landing.discover.summary !== undefined
                      ? { summary: a.landing.discover.summary }
                      : {}),
                    ...(a.landing.discover.audience !== undefined
                      ? { audience: a.landing.discover.audience }
                      : {}),
                    ...(a.landing.discover.capabilities !== undefined
                      ? { capabilities: a.landing.discover.capabilities }
                      : {}),
                    ...(a.landing.discover.faq !== undefined
                      ? {
                          faq: a.landing.discover.faq.items.map((item) => ({
                            question: item.question,
                            answer: item.answer,
                          })),
                        }
                      : {}),
                    ...(a.landing.discover.organization !== undefined
                      ? { organization: a.landing.discover.organization }
                      : {}),
                    ...(a.landing.discover.organizationUrl !== undefined
                      ? { organizationUrl: a.landing.discover.organizationUrl }
                      : {}),
                    ...(a.landing.discover.applicationCategory !== undefined
                      ? {
                          applicationCategory: a.landing.discover.applicationCategory,
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(a.audience !== undefined
      ? {
          audience: {
            admission: a.audience.admission,
            ...(a.audience.auth !== undefined ? { auth: a.audience.auth } : {}),
            ...(a.audience.idp !== undefined ? { idp: a.audience.idp } : {}),
            ...(a.audience.allowDomains !== undefined
              ? { allowDomains: a.audience.allowDomains }
              : {}),
            ...(a.audience.denyDomains !== undefined
              ? { denyDomains: a.audience.denyDomains }
              : {}),
          },
        }
      : {}),
    ...(a.shell !== undefined
      ? {
          shell: {
            ...(a.shell.preset !== undefined ? { preset: a.shell.preset } : {}),
            ...(a.shell.regions.length > 0
              ? {
                  regions: a.shell.regions.map((r) => ({
                    name: r.name,
                    props: r.props,
                  })),
                }
              : {}),
          },
        }
      : {}),
    ...(a.nav !== undefined
      ? {
          nav: {
            sections: a.nav.sections.map((section) => ({
              title: section.title,
              entries: section.entries.map((entry) => ({
                pageName: entry.pageName,
                ...(entry.label !== undefined ? { label: entry.label } : {}),
              })),
            })),
          },
        }
      : {}),
    pages: a.pages.map((page) => {
      const channelDecl = page.channel !== undefined ? channelsByName.get(page.channel) : undefined
      return {
        name: page.name,
        ...(page.label !== undefined ? { label: page.label } : {}),
        ...(page.icon !== undefined ? { icon: page.icon } : {}),
        ...(page.viewport === 'full' ? { viewport: 'full' as const } : {}),
        ...(page.render !== undefined ? { openui: page.render.content } : {}),
        ...(page.channel !== undefined ? { channel: page.channel } : {}),
        ...(channelDecl?.agent !== undefined ? { agent: channelDecl.agent } : {}),
        ...(page.threads !== undefined ? { threads: page.threads } : {}),
        ...(page.reviews !== undefined ? { reviews: page.reviews } : {}),
      }
    }),
  }))

  const queryBlocks = (stripped.queries ?? []).map((q) => {
    const sql = sqlBlockCode(q.sql)

    if (!sql) {
      throw new Error(`Query "${q.name}" must define sql: @sql { … }`)
    }

    if (!q.database) {
      throw new Error(`Query "${q.name}" must declare database: <name>`)
    }

    return {
      id: newId(),
      name: q.name,
      label: q.label,
      description: q.description,
      enabled: q.enabled,
      database: q.database,
      sql,
      params: extractSqlParams(sql),
    }
  })

  const channelBlocks = (stripped.channels ?? []).map((c) => ({
    id: newId(),
    name: c.name,
    label: c.label,
    description: c.description,
    platform: c.platform,
    agent: c.agent,
    workflows: c.workflows,
    enabled: c.enabled,
    ...(c.connection !== undefined ? { connectionRef: c.connection } : {}),
    ...(c.connector !== undefined ? { connectorRef: c.connector } : {}),
    mode: c.mode,
    ...channelResponsePolicyToDeploymentPayload(c),
  }))

  const connectionBlocks = (stripped.connections ?? []).map((c) => ({
    id: newId(),
    name: c.name,
    label: c.label,
    description: c.description,
    provider: c.provider,
    ...(c.baseUrl !== undefined ? { baseUrl: c.baseUrl } : {}),
    ...(c.authRef !== undefined ? { authRef: c.authRef } : {}),
    ...(c.networkRef !== undefined ? { networkRef: c.networkRef } : {}),
  }))

  const mcpBlocks = (stripped.mcp ?? []).map((m) => ({
    id: newId(),
    name: m.name,
    label: m.label,
    description: m.description,
    url: m.url,
    auth: m.auth,
    ...(m.networkRef !== undefined ? { networkRef: m.networkRef } : {}),
  }))

  const networkBlocks = (stripped.networks ?? []).map((network) => ({
    id: newId(),
    name: network.name,
    label: network.label,
    description: network.description,
    expose: {
      apps: network.expose?.apps.map((ref) => ref.name) ?? [],
      channels: network.expose?.channels.map((ref) => ref.name) ?? [],
      forms: network.expose?.forms.map((ref) => ref.name) ?? [],
      webhooks: network.expose?.webhooks.map((ref) => ref.name) ?? [],
      services: network.expose?.services.map((ref) => ref.name) ?? [],
      databases:
        network.expose?.databases.map((database) => ({
          database: database.database,
          connections: database.connections.map((ref) => ref.name),
        })) ?? [],
    },
  }))

  const connectorBlocks = (stripped.connector ?? []).map((c) => ({
    id: newId(),
    name: c.name,
    label: c.label,
    description: c.description,
  }))

  const actionBlocks = (stripped.actions ?? []).map((a) => {
    const ws = {
      schemaLiterals: actionSchemaLiterals,
    } as WorkspaceResourceIndex

    const inputSchema = resolveActionInputSchema(a, ws)
    const outputSchema = resolveActionOutputSchema(a, ws)
    return {
      id: newId(),
      name: a.name,
      label: a.label,
      description: a.description,
      provider: a.provider,
      method: a.method,
      path: a.path,
      ...(a.encoding !== undefined ? { encoding: a.encoding } : {}),
      ...(a.scopes !== undefined ? { scopes: a.scopes } : {}),
      ...(inputSchema !== undefined ? { inputSchema } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
    }
  })

  const roles = (stripped.roles ?? []).map((r) => ({
    name: r.name,
    description: r.description,
    match: r.match.map((c) => ({
      claim: c.claim,
      op: c.op,
      values: c.values,
    })),
  }))

  const policies = (stripped.policies ?? []).map((p) => ({
    grants: p.grants.map((g) => ({
      effect: g.effect,
      role: g.role,
      ...(g.workflow !== undefined ? { workflow: g.workflow } : { agent: g.agent }),
      ...(g.workflows !== undefined ? { workflows: g.workflows } : {}),
      ...(g.tools !== undefined ? { tools: g.tools } : {}),
    })),
    ...(p.files
      ? {
          files: {
            retention: p.files.retention,
          },
        }
      : {}),
  }))

  const mockBlocks = (stripped.mocks ?? []).map((m) => ({
    id: newId(),
    ...m,
  }))

  const playbookBlocks = (stripped.playbooks ?? []).map((p) => ({
    id: newId(),
    ...p,
  }))

  const definition: Record<string, unknown> = {
    ...(stripped.version !== undefined ? { version: stripped.version } : {}),
    forms,
    webhooks,
    schedules,
    workflows,
    schemas: schemasPayload,
    triggers,
    secretBlocks,
    authBlocks,
    postgresBlocks,
    databaseBlocks,
    databaseMigrations,
    diskBlocks,
    computerBlocks,
    operationBlocks,
    skillBlocks,
    agentBlocks,
    decisionBlocks: decisionBlocks.map((d) => ({ ...d, id: newId() })),
    queryBlocks,
    channelBlocks,
    connectionBlocks,
    mcpBlocks,
    networkBlocks,
    connectorBlocks,
    actionBlocks,
    streams,
    views,
    apps,
    roles,
    policies,
    mockBlocks,
    playbookBlocks,
  }

  const parsed = parseDeploymentDefinition(definition)

  if (!parsed.success) {
    return { definition, parseError: parsed.error }
  }

  return { definition, parseError: null }
}
