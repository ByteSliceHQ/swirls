import { decisionOutputSchema } from '@swirls/definition/decision'
import type {
  ConfigValue,
  ConnectionDecl,
  DatabaseDecl,
  JsonSchemaLiteral,
  MigrationDecl,
  NodeDecl,
  PostgresDecl,
  StreamDecl,
  SwirlsFile,
  WorkflowDecl,
} from '@swirls/language'
import {
  getLeafNodes,
  getLineageNodeNames,
  getMustRunNodeNames,
  getRootNode,
  resolveDecisionDefinition,
  resolveNamedSchemasFromDecls,
} from '@swirls/language'
import type { WorkspaceResourceIndex } from '@swirls/language/workspace'

import { EMBEDDED_EMPTY_SECRETS, EMBEDDED_OPEN_OBJECT } from './emitted-ts-literals'
import { integrationOutputTypeString, type WorkspaceFileReader } from './integration-types'
import { inferOutputTypeForNode } from './postgres-types'
import { type DbClientScopeKind, renderDbContextField } from './prisma-client-types'
import { jsonSchemaToTsType } from './schema-to-ts'

export { getRootNode } from '@swirls/language'
export {
  integrationParamsReturnTypePreamble,
  integrationParamsReturnTypeString,
} from './integration-types'
export {
  getPostgresPlaceholderTsTypeString,
  postgresParamsReturnTypeString,
} from './postgres-types'

export function getNamedSchemaMap(
  fileAst: SwirlsFile | undefined,
  workspace?: WorkspaceResourceIndex,
): Map<string, JsonSchemaLiteral> {
  const merged = new Map<string, JsonSchemaLiteral>()

  if (workspace) {
    for (const [name, lit] of workspace.schemaLiterals) {
      merged.set(name, lit)
    }
  }

  if (fileAst?.schemas?.length) {
    for (const [name, lit] of resolveNamedSchemasFromDecls(fileAst.schemas ?? []).map) {
      merged.set(name, lit)
    }
  }

  return merged
}

export function mergedWorkflowDecls(
  fileAst: SwirlsFile | undefined,
  workspace?: WorkspaceResourceIndex,
): WorkflowDecl[] {
  const byName = new Map<string, WorkflowDecl>()

  if (workspace) {
    for (const [name, workflow] of workspace.workflowBlocks) {
      byName.set(name, workflow)
    }
  }

  for (const workflow of fileAst?.workflows ?? []) {
    byName.set(workflow.name, workflow)
  }

  return [...byName.values()]
}

/**
 * Prefer an inline JSON Schema object on the node; otherwise resolve `ref` from top-level `schema { }` names.
 */
function resolveLit(
  obj: Record<string, unknown> | undefined,
  ref: string | undefined,
  refMap: Map<string, JsonSchemaLiteral>,
): JsonSchemaLiteral | undefined {
  if (obj !== undefined && typeof obj === 'object' && !Array.isArray(obj)) {
    return obj as JsonSchemaLiteral
  }

  if (ref) {
    return refMap.get(ref)
  }

  return undefined
}

function streamPinnedRowLit(
  streamDecl: StreamDecl | undefined,
  versionCv: ConfigValue | undefined,
  refMap: Map<string, JsonSchemaLiteral>,
): JsonSchemaLiteral | undefined {
  const pin =
    versionCv?.kind === 'string' &&
    typeof versionCv.value === 'string' &&
    versionCv.value.trim() !== ''
      ? versionCv.value.trim()
      : undefined

  if (!streamDecl || !pin) {
    return undefined
  }

  const sv = streamDecl.versions.find((v) => v.key === pin)

  if (!sv) {
    return undefined
  }

  return resolveLit(sv.schema as Record<string, unknown> | undefined, sv.schemaRef, refMap)
}

/** Inline mirror of {@link Content} from `@swirls/definition/schemas` for `Extract<>` in `formatted` fields. */
const SWIRLS_CONTENT_TYPE_TS = `type Content =
  | { kind: 'text'; text: string; data?: unknown }
  | { kind: 'markdown'; markdown: string; data?: unknown }
  | { kind: 'html'; html: string; data?: unknown }
  | {
      kind: 'image'
      url: string
      mime?: string
      alt?: string
      data?: unknown
    }
  | {
      kind: 'video'
      url: string
      mime?: string
      poster?: string
      data?: unknown
    }
  | { kind: 'audio'; url: string; mime?: string; data?: unknown }
  | { kind: 'json'; value: unknown }
  | { kind: 'mixed'; parts: Content[] }
`

function workflowDeclUsesOutputFormat(graph: WorkflowDecl): boolean {
  return graph.nodes.some((n) => Boolean(n.outputFormat?.trim()))
}

function formattedFieldTs(fmt: string | undefined | null): string | undefined {
  const t = fmt?.trim()

  if (!t) {
    return undefined
  }

  switch (t) {
    case 'markdown':
      return `Extract<Content, { kind: 'markdown' }>`
    case 'html':
      return `Extract<Content, { kind: 'html' }>`
    case 'text':
      return `Extract<Content, { kind: 'text' }>`
    case 'image':
      return `Extract<Content, { kind: 'image' }>`
    case 'video':
      return `Extract<Content, { kind: 'video' }>`
    case 'audio':
      return `Extract<Content, { kind: 'audio' }>`
    case 'json':
      return `Extract<Content, { kind: 'json' }>`
    case 'mixed':
      return `Extract<Content, { kind: 'mixed' }>`
    default:
      return 'Content'
  }
}

function nodeShapeWithFormatted(inner: string, fmt: string | undefined | null): string {
  const narrow = formattedFieldTs(fmt)

  if (!narrow) {
    return `{ ${inner} }`
  }

  return `{ ${inner}; formatted?: ${narrow} }`
}

function reviewSchemaLit(
  node: NodeDecl | undefined,
  refMap: Map<string, JsonSchemaLiteral>,
): JsonSchemaLiteral | undefined {
  if (!node?.reviewConfig || typeof node.reviewConfig !== 'object' || node.reviewConfig === null) {
    return undefined
  }

  const rc = node.reviewConfig as Record<string, unknown>
  return resolveLit(
    rc.schema as Record<string, unknown> | undefined,
    typeof rc.schemaRef === 'string' ? rc.schemaRef : undefined,
    refMap,
  )
}

function secretsTypeForNode(node: NodeDecl | undefined): string {
  if (!node) {
    return EMBEDDED_OPEN_OBJECT
  }

  const map = node.secretsMap

  if (map == null || Object.keys(map).length === 0) {
    return EMBEDDED_EMPTY_SECRETS
  }

  const blocks = Object.entries(map).map(([blockName, vars]) => {
    const blockKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(blockName)
      ? blockName
      : JSON.stringify(blockName)

    const varLines = vars.map((v) =>
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)
        ? `      ${v}?: string`
        : `      ${JSON.stringify(v)}?: string`,
    )

    return `    ${blockKey}: {\n${varLines.join('\n')}\n    }`
  })

  return `{\n${blocks.join('\n')}\n  }`
}

/**
 * The `context.db` section of a preamble: namespace declarations to prepend
 * plus the `db` field to add to `SwirlsContext`. Null when the block gets no
 * `context.db` at runtime.
 */
interface DbSection {
  declarations: string
  dbField: string
}

function isDatabaseOperationScope(value: string): value is DbClientScopeKind {
  return (
    value === 'query' ||
    value === 'insert' ||
    value === 'update' ||
    value === 'delete' ||
    value === 'transaction'
  )
}

/**
 * Mirror of the executor's capability topology for `context.db`:
 * - plain @ts blocks (any node config run through `runCode`) get the full
 *   client on every deployed database, no `$transaction`;
 * - a governed `database` node's `run` body gets only its declared database,
 *   narrowed to the declared `operation`;
 * - a `database` node's `condition` runs with no bridge at all — no `db`.
 */
function dbSectionForNode(
  node: NodeDecl | undefined,
  configKey: string | undefined,
  databases: DatabaseDecl[],
): DbSection | null {
  if (databases.length === 0) {
    return null
  }

  let scope: DbClientScopeKind = 'code'
  let visible = databases

  if (node?.type === 'database') {
    if (configKey === 'condition') {
      return null
    }

    if (configKey === 'run') {
      const dbCv = node.configFields.database
      const dbName = dbCv?.kind === 'string' ? dbCv.value : undefined
      visible = databases.filter((d) => d.name === dbName)

      if (visible.length === 0) {
        return null
      }

      const opCv = node.configFields.operation
      const op = opCv?.kind === 'string' ? opCv.value : undefined

      if (op === undefined || !isDatabaseOperationScope(op)) {
        return null
      }

      scope = op
    }
  }

  const rendered = renderDbContextField(
    visible.map((d) => ({ name: d.name, schemaSource: d.schemaSource })),
    scope,
  )

  if (!rendered) {
    return null
  }

  return {
    declarations: rendered.declarations,
    dbField: `\n  db: ${rendered.dbType}`,
  }
}

/**
 * Get the referenced graph name from a graph-type node's config (configFields.graph).
 */
export function getGraphRefFromConfigFields(
  configFields: Record<string, { kind: string; value?: unknown }>,
): string | undefined {
  const workflowCv = configFields.workflow ?? configFields.graph

  if (workflowCv?.kind === 'string' && typeof workflowCv.value === 'string') {
    return workflowCv.value
  }

  return undefined
}

/**
 * Resolve the inner graph body for a loop orchestration node.
 */
export function getLoopBodyWorkflowDecl(
  node: NodeDecl,
  allWorkflows: WorkflowDecl[],
): WorkflowDecl | undefined {
  if (node.type !== 'map' && node.type !== 'fanout' && node.type !== 'while') {
    return undefined
  }

  if (node.subgraph) {
    return {
      name: `${node.name}__loop_body`,
      label: '',
      nodes: node.subgraph.nodes,
      edges: node.subgraph.edges,
      flowRange: node.subgraph.flowRange,
      range: node.subgraph.range,
    }
  }

  const ref = getGraphRefFromConfigFields(
    node.configFields as Record<string, { kind: string; value?: unknown }>,
  )

  return ref ? allWorkflows.find((g) => g.name === ref) : undefined
}

/**
 * TypeScript for per-leaf outputs on `context.output`.
 * Leaves in {@link getMustRunNodeNames} are required keys; others are optional (switch / may-run).
 */
function leafPartialOutputsTsType(
  graph: WorkflowDecl,
  fileAst: SwirlsFile | undefined,
  workspace?: WorkspaceResourceIndex,
): string {
  const refMap = getNamedSchemaMap(fileAst, workspace)
  const leafNodes = getLeafNodes(graph)

  if (leafNodes.length === 0) {
    return EMBEDDED_OPEN_OBJECT
  }

  const mustRun = getMustRunNodeNames(graph)
  const entries: string[] = []

  for (const node of leafNodes) {
    const safeName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.name)
      ? node.name
      : JSON.stringify(node.name)

    const optional = mustRun.has(node.name) ? '' : '?'

    const lit =
      nodeDecisionOutput(node, fileAst, workspace) ??
      resolveLit(
        node.outputSchema as Record<string, unknown> | undefined,
        node.outputSchemaRef,
        refMap,
      )

    const tsType =
      lit && typeof lit === 'object'
        ? jsonSchemaToTsType(lit as Record<string, unknown>)
        : 'unknown'

    entries.push(`${safeName}${optional}: ${tsType}`)
  }

  return `{ ${entries.join('; ')} }`
}

function inferNodeOutputType(
  node: NodeDecl | undefined,
  postgresBlocks: PostgresDecl[],
  connections: ConnectionDecl[] = [],
  actions: SwirlsFile['actions'] = [],
  workspace?: WorkspaceResourceIndex,
  readWorkspaceFile?: WorkspaceFileReader,
): string | undefined {
  if (!node) {
    return undefined
  }

  if (node.type === 'integration') {
    return integrationOutputTypeString(node, connections, actions, workspace, readWorkspaceFile)
  }

  return inferOutputTypeForNode(node, postgresBlocks)
}

/**
 * - context.nodes.root is { input: RootInput; output?: RootOutput }: trigger payload on .input; root node result on .output after the root runs.
 * - Non-root nodes additionally get context.nodes.<name>.output for each upstream ancestor, typed from outputSchema.
 * - Graph (subgraph) nodes get output type inferred from the referenced graph's leaf node output schemas.
 *
 * Upstream entries are required because the executor only runs a node when its incoming edges are
 * satisfied; `context.output` on nested subgraph types uses {@link getMustRunNodeNames} for leaf keys.
 */
export function generateContextTypePreamble(
  graph: WorkflowDecl,
  nodeName: string,
  allWorkflows: WorkflowDecl[],
  postgresBlocks: PostgresDecl[] = [],
  streams: StreamDecl[] = [],
  loopParent?: NodeDecl,
  /** `while` node when typing `condition` / `update` on the parent graph */
  loopHost?: NodeDecl,
  fileAst?: SwirlsFile,
  connections: ConnectionDecl[] = [],
  actions: SwirlsFile['actions'] = [],
  workspace?: WorkspaceResourceIndex,
  databases: DatabaseDecl[] = [],
  configKey?: string,
  readWorkspaceFile?: WorkspaceFileReader,
): string {
  const refMap = getNamedSchemaMap(fileAst, workspace)
  const upstream = getLineageNodeNames(graph, nodeName)
  const rootNode = getRootNode(graph)
  const currentNode = graph.nodes.find((n) => n.name === nodeName)
  const typeLines: string[] = []
  const nodeEntries: string[] = []
  const isDownstream = Boolean(rootNode && upstream.includes(rootNode.name))
  const isRootContext = nodeName === rootNode?.name
  const rootFmt = rootNode?.outputFormat

  const rootInputLit = resolveLit(
    rootNode?.inputSchema as Record<string, unknown> | undefined,
    rootNode?.inputSchemaRef,
    refMap,
  )

  const rootOutputLit = resolveLit(
    rootNode?.outputSchema as Record<string, unknown> | undefined,
    rootNode?.outputSchemaRef,
    refMap,
  )

  const hasRootInput = rootInputLit !== undefined && typeof rootInputLit === 'object'
  const hasRootOutput = rootOutputLit !== undefined && typeof rootOutputLit === 'object'

  const inferredRootOutput = !hasRootOutput
    ? inferNodeOutputType(
        rootNode,
        postgresBlocks,
        connections,
        actions,
        workspace,
        readWorkspaceFile,
      )
    : undefined

  if (hasRootInput) {
    typeLines.push(
      `type RootInput = ${jsonSchemaToTsType(rootInputLit as Record<string, unknown>)}`,
    )

    if (isRootContext) {
      nodeEntries.push(`    root: ${nodeShapeWithFormatted('input: RootInput', rootFmt)}`)
    } else if (isDownstream && hasRootOutput) {
      typeLines.push(
        `type RootOutput = ${jsonSchemaToTsType(rootOutputLit as Record<string, unknown>)}`,
      )

      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted('input: RootInput; output: RootOutput', rootFmt)}`,
      )
    } else if (isDownstream && inferredRootOutput) {
      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted(`input: RootInput; output: ${inferredRootOutput}`, rootFmt)}`,
      )
    } else if (isDownstream) {
      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted('input: RootInput; output?: unknown', rootFmt)}`,
      )
    } else {
      nodeEntries.push(`    root: ${nodeShapeWithFormatted('input: RootInput', rootFmt)}`)
    }
  } else if (isRootContext) {
    nodeEntries.push(
      `    root: ${nodeShapeWithFormatted('input: { [key: string]: unknown }', rootFmt)}`,
    )
  } else if (isDownstream && hasRootOutput) {
    typeLines.push(
      `type RootOutput = ${jsonSchemaToTsType(rootOutputLit as Record<string, unknown>)}`,
    )

    nodeEntries.push(`    root: ${nodeShapeWithFormatted('output: RootOutput', rootFmt)}`)
  } else if (isDownstream && inferredRootOutput) {
    nodeEntries.push(
      `    root: ${nodeShapeWithFormatted(`output: ${inferredRootOutput}`, rootFmt)}`,
    )
  } else {
    nodeEntries.push(`    root: ${nodeShapeWithFormatted('[key: string]: unknown', rootFmt)}`)
  }

  // Non-root nodes also get upstream output types (skip root — already merged into root entry above)
  for (const name of upstream) {
    const node = graph.nodes.find((n) => n.name === name)

    if (node?.isRoot === true || name === rootNode?.name) {
      continue
    }

    if (node?.type === 'workflow' || node?.type === 'graph') {
      const childGraphName = getGraphRefFromConfigFields(
        node.configFields as Record<string, { kind: string; value?: unknown }>,
      )

      const childGraph = childGraphName
        ? allWorkflows.find((g) => g.name === childGraphName)
        : undefined

      if (childGraph) {
        const subgraphType = leafPartialOutputsTsType(childGraph, fileAst, workspace)
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`
        typeLines.push(`type ${typeName} = ${subgraphType}`)

        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(`output: ${typeName}`, node.outputFormat)}`,
        )
      } else {
        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted('output: unknown', node.outputFormat)}`,
        )
      }
    } else if (node?.type === 'map' || node?.type === 'fanout') {
      const bodyGraph = getLoopBodyWorkflowDecl(node, allWorkflows)

      if (bodyGraph) {
        const leafT = leafPartialOutputsTsType(bodyGraph, fileAst, workspace)
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`
        typeLines.push(`type ${typeName} = ${leafT}[]`)

        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(`output: ${typeName}`, node.outputFormat)}`,
        )
      } else {
        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted('output: unknown[]', node.outputFormat)}`,
        )
      }
    } else if (node?.type === 'while') {
      const bodyGraph = getLoopBodyWorkflowDecl(node, allWorkflows)

      if (bodyGraph) {
        const leafT = leafPartialOutputsTsType(bodyGraph, fileAst, workspace)
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`
        typeLines.push(`type ${typeName} = { iterations: number; lastOutput: ${leafT} }`)

        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(`output: ${typeName}`, node.outputFormat)}`,
        )
      } else {
        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(
            'output: { iterations: number; lastOutput: unknown }',
            node.outputFormat,
          )}`,
        )
      }
    } else if (node?.type === 'stream') {
      const streamRef = node.configFields.stream
      const streamName = streamRef?.kind === 'string' ? String(streamRef.value) : undefined
      const streamDecl = streamName ? streams.find((s) => s.name === streamName) : undefined
      const versionCv = node.configFields.version

      const streamSchemaLit =
        streamDecl !== undefined ? streamPinnedRowLit(streamDecl, versionCv, refMap) : undefined

      if (streamSchemaLit && typeof streamSchemaLit === 'object') {
        const itemType = jsonSchemaToTsType(streamSchemaLit as Record<string, unknown>)
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`
        typeLines.push(`type ${typeName} = ${itemType}`)

        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(`output: ${typeName}[]`, node.outputFormat)}`,
        )
      } else {
        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted('output: unknown[]', node.outputFormat)}`,
        )
      }
    } else {
      const outLit =
        nodeDecisionOutput(node, fileAst, workspace) ??
        resolveLit(
          node?.outputSchema as Record<string, unknown> | undefined,
          node?.outputSchemaRef,
          refMap,
        )

      if (outLit && typeof outLit === 'object') {
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`

        typeLines.push(
          `type ${typeName} = ${jsonSchemaToTsType(outLit as Record<string, unknown>)}`,
        )

        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(`output: ${typeName}`, node?.outputFormat)}`,
        )
      } else {
        const inferred = inferNodeOutputType(
          node,
          postgresBlocks,
          connections,
          actions,
          workspace,
          readWorkspaceFile,
        )

        nodeEntries.push(
          `    ${name}: ${nodeShapeWithFormatted(`output: ${inferred ?? 'unknown'}`, node?.outputFormat)}`,
        )
      }
    }
  }

  // Build context.reviews type (mirror UI: upstream + current node when they have reviewConfig.schema)
  const reviewEntries: string[] = []
  const upstreamForReviews = getLineageNodeNames(graph, nodeName)

  for (const name of upstreamForReviews) {
    const node = graph.nodes.find((n) => n.name === name)
    const schema = reviewSchemaLit(node, refMap)

    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Review`

      typeLines.push(`type ${typeName} = ${jsonSchemaToTsType(schema as Record<string, unknown>)}`)
      reviewEntries.push(`    ${name}: ${typeName}`)
    }
  }

  if (
    currentNode?.reviewConfig &&
    typeof currentNode.reviewConfig === 'object' &&
    currentNode.reviewConfig !== null
  ) {
    const schema = reviewSchemaLit(currentNode, refMap)

    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      const typeName = `${nodeName.charAt(0).toUpperCase()}${nodeName.slice(1)}Review`

      if (!reviewEntries.some((e) => e.startsWith(`    ${nodeName}:`))) {
        typeLines.push(
          `type ${typeName} = ${jsonSchemaToTsType(schema as Record<string, unknown>)}`,
        )

        reviewEntries.push(`    ${nodeName}: ${typeName}`)
      }
    }
  }

  const reviewsType =
    reviewEntries.length > 0 ? `{\n${reviewEntries.join('\n')}\n  }` : '{ [key: string]: unknown }'

  if (workflowDeclUsesOutputFormat(graph)) {
    typeLines.unshift(SWIRLS_CONTENT_TYPE_TS)
  }

  const nodesType = `{\n${nodeEntries.join('\n')}\n  }`
  const typePreamble = typeLines.length > 0 ? `${typeLines.join('\n')}\n\n` : ''

  const secretsField =
    currentNode?.type === 'shell'
      ? ''
      : `\n  secrets: ${secretsTypeForNode(
          configKey === 'model' || currentNode?.type === 'decision' ? undefined : currentNode,
        )}`

  let iterationField = ''

  if (
    loopParent &&
    (loopParent.type === 'map' || loopParent.type === 'fanout' || loopParent.type === 'while')
  ) {
    const iterRoot = rootNode

    const iterLit = resolveLit(
      iterRoot?.inputSchema as Record<string, unknown> | undefined,
      iterRoot?.inputSchemaRef,
      refMap,
    )

    const iterT =
      iterLit && typeof iterLit === 'object'
        ? jsonSchemaToTsType(iterLit as Record<string, unknown>)
        : 'unknown'

    const prevT = leafPartialOutputsTsType(graph, fileAst, workspace)

    if (loopParent.type === 'map') {
      iterationField = `\n  iteration: { index: number; item: ${iterT}; total: number; previous?: ${prevT} }`
    } else if (loopParent.type === 'fanout') {
      iterationField = `\n  iteration: { index: number; item: ${iterT}; total: number }`
    } else {
      iterationField = `\n  iteration: { index: number; input: ${iterT}; previous?: ${prevT} }`
    }
  } else if (loopHost?.type === 'while') {
    const bodyGraph = getLoopBodyWorkflowDecl(loopHost, allWorkflows)
    const iterRoot = bodyGraph ? getRootNode(bodyGraph) : undefined

    const iterLit = resolveLit(
      iterRoot?.inputSchema as Record<string, unknown> | undefined,
      iterRoot?.inputSchemaRef,
      refMap,
    )

    const iterT =
      iterLit && typeof iterLit === 'object'
        ? jsonSchemaToTsType(iterLit as Record<string, unknown>)
        : 'unknown'

    const prevT = bodyGraph
      ? leafPartialOutputsTsType(bodyGraph, fileAst, workspace)
      : EMBEDDED_OPEN_OBJECT

    iterationField = `\n  iteration: { index: number; input: ${iterT}; previous?: ${prevT} }`
  }

  const dbSection = dbSectionForNode(currentNode, configKey, databases)
  const dbDeclarations = dbSection ? `${dbSection.declarations}\n\n` : ''
  const dbField = dbSection?.dbField ?? ''

  return `${dbDeclarations}${typePreamble}type SwirlsContext = {
  nodes: ${nodesType}
  reviews: ${reviewsType}${secretsField}
  meta: { triggerId: string | null; triggerType: string | null }${iterationField}${dbField}
}
declare const context: SwirlsContext
declare const nodes: SwirlsContext['nodes']
declare const reviews: SwirlsContext['reviews']
`
}

/**
 * Preamble for a top-level `migration` block's `operation` @ts body. Mirrors
 * the migrate-runner: empty node/review/secret context, and `context.db`
 * scoped to the migration's target database with the full action set (the
 * runner's bridge dispatches every model call against the target client; the
 * `$tx` control channel is refused, so no `$transaction`).
 */
export function generateMigrationContextPreamble(
  migration: MigrationDecl,
  databases: DatabaseDecl[],
): string {
  const target = databases.filter((d) => d.name === migration.database)

  const rendered =
    target.length > 0
      ? renderDbContextField(
          target.map((d) => ({ name: d.name, schemaSource: d.schemaSource })),
          'migration',
        )
      : null

  const dbDeclarations = rendered ? `${rendered.declarations}\n\n` : ''
  const dbField = rendered ? `\n  db: ${rendered.dbType}` : ''

  return `${dbDeclarations}type SwirlsContext = {
  nodes: { [key: string]: never }
  reviews: { [key: string]: never }
  secrets: { [key: string]: never }
  meta: { triggerId: string | null; triggerType: string | null }${dbField}
}
declare const context: SwirlsContext
declare const nodes: SwirlsContext['nodes']
declare const reviews: SwirlsContext['reviews']
`
}

/**
 * Minimal SwirlsContext for stream `condition` / `prepare` when the referenced graph cannot be resolved.
 */
export function generateStreamBlockMissingGraphPreamble(): string {
  return `type SwirlsContext = {
  nodes: ${EMBEDDED_OPEN_OBJECT}
  reviews: ${EMBEDDED_OPEN_OBJECT}
  secrets: ${EMBEDDED_OPEN_OBJECT}
  meta: { triggerId: string | null; triggerType: string | null }
  output: unknown
}
declare const context: SwirlsContext
declare const nodes: SwirlsContext['nodes']
declare const reviews: SwirlsContext['reviews']
`
}

/**
 * TypeScript preamble for top-level `stream { }` `condition` / `prepare` @ts blocks.
 * Matches runtime {@link buildStreamContext} in packages/engine: full graph node
 * outputs plus `output` (partial record keyed by leaf node name).
 *
 * Per-node {@link generateContextTypePreamble} relies on the scheduler lineage invariant
 * (upstream keys required). Stream preambles use static {@link getMustRunNodeNames} because
 * there is no current node — may-run branches are optional on `context.nodes`.
 */
export function generateStreamBlockContextPreamble(
  graph: WorkflowDecl,
  allWorkflows: WorkflowDecl[],
  postgresBlocks: PostgresDecl[] = [],
  streams: StreamDecl[] = [],
  fileAst?: SwirlsFile,
  connections: ConnectionDecl[] = [],
  actions: SwirlsFile['actions'] = [],
  workspace?: WorkspaceResourceIndex,
  readWorkspaceFile?: WorkspaceFileReader,
): string {
  const refMap = getNamedSchemaMap(fileAst, workspace)
  const mustRun = getMustRunNodeNames(graph)
  const rootNode = getRootNode(graph)
  const rootFmt = rootNode?.outputFormat
  const typeLines: string[] = []
  const nodeEntries: string[] = []

  const rootInputLit = resolveLit(
    rootNode?.inputSchema as Record<string, unknown> | undefined,
    rootNode?.inputSchemaRef,
    refMap,
  )

  const rootOutputLit = resolveLit(
    rootNode?.outputSchema as Record<string, unknown> | undefined,
    rootNode?.outputSchemaRef,
    refMap,
  )

  const hasRootInput = rootInputLit !== undefined && typeof rootInputLit === 'object'
  const hasRootOutput = rootOutputLit !== undefined && typeof rootOutputLit === 'object'

  const inferredRootOutput = !hasRootOutput
    ? inferNodeOutputType(
        rootNode,
        postgresBlocks,
        connections,
        actions,
        workspace,
        readWorkspaceFile,
      )
    : undefined

  if (hasRootInput && rootNode) {
    typeLines.push(
      `type RootInput = ${jsonSchemaToTsType(rootInputLit as Record<string, unknown>)}`,
    )

    if (hasRootOutput) {
      typeLines.push(
        `type RootOutput = ${jsonSchemaToTsType(rootOutputLit as Record<string, unknown>)}`,
      )

      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted('input: RootInput; output: RootOutput', rootFmt)}`,
      )
    } else if (inferredRootOutput) {
      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted(`input: RootInput; output: ${inferredRootOutput}`, rootFmt)}`,
      )
    } else {
      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted('input: RootInput; output?: unknown', rootFmt)}`,
      )
    }
  } else if (rootNode) {
    if (hasRootOutput) {
      typeLines.push(
        `type RootOutput = ${jsonSchemaToTsType(rootOutputLit as Record<string, unknown>)}`,
      )

      nodeEntries.push(`    root: ${nodeShapeWithFormatted('output: RootOutput', rootFmt)}`)
    } else if (inferredRootOutput) {
      nodeEntries.push(
        `    root: ${nodeShapeWithFormatted(`output: ${inferredRootOutput}`, rootFmt)}`,
      )
    } else {
      nodeEntries.push(`    root: ${nodeShapeWithFormatted('[key: string]: unknown', rootFmt)}`)
    }
  }

  for (const node of graph.nodes) {
    if (rootNode && node.name === rootNode.name) {
      continue
    }

    const name = node.name
    const safeName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ? name : JSON.stringify(name)
    const opt = mustRun.has(name) ? '' : '?'

    if (node.type === 'workflow' || node.type === 'graph') {
      const childGraphName = getGraphRefFromConfigFields(
        node.configFields as Record<string, { kind: string; value?: unknown }>,
      )

      const childGraph = childGraphName
        ? allWorkflows.find((g) => g.name === childGraphName)
        : undefined

      if (childGraph) {
        const subgraphType = leafPartialOutputsTsType(childGraph, fileAst, workspace)
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`
        typeLines.push(`type ${typeName} = ${subgraphType}`)

        nodeEntries.push(
          `    ${safeName}${opt}: ${nodeShapeWithFormatted(`output: ${typeName}`, node.outputFormat)}`,
        )
      } else {
        nodeEntries.push(
          `    ${safeName}${opt}: ${nodeShapeWithFormatted('output: unknown', node.outputFormat)}`,
        )
      }
    } else if (node.type === 'stream') {
      const streamRef = node.configFields.stream
      const streamName = streamRef?.kind === 'string' ? String(streamRef.value) : undefined
      const streamDecl = streamName ? streams.find((s) => s.name === streamName) : undefined

      const versionCv = node.configFields.version

      const streamSchemaLit =
        streamDecl !== undefined ? streamPinnedRowLit(streamDecl, versionCv, refMap) : undefined

      if (streamSchemaLit && typeof streamSchemaLit === 'object') {
        const itemType = jsonSchemaToTsType(streamSchemaLit as Record<string, unknown>)
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`
        typeLines.push(`type ${typeName} = ${itemType}`)

        nodeEntries.push(
          `    ${safeName}${opt}: ${nodeShapeWithFormatted(`output: ${typeName}[]`, node.outputFormat)}`,
        )
      } else {
        nodeEntries.push(
          `    ${safeName}${opt}: ${nodeShapeWithFormatted('output: unknown[]', node.outputFormat)}`,
        )
      }
    } else {
      const outLit =
        nodeDecisionOutput(node, fileAst, workspace) ??
        resolveLit(
          node.outputSchema as Record<string, unknown> | undefined,
          node.outputSchemaRef,
          refMap,
        )

      if (outLit && typeof outLit === 'object') {
        const typeName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Output`

        typeLines.push(
          `type ${typeName} = ${jsonSchemaToTsType(outLit as Record<string, unknown>)}`,
        )

        nodeEntries.push(
          `    ${safeName}${opt}: ${nodeShapeWithFormatted(`output: ${typeName}`, node.outputFormat)}`,
        )
      } else {
        const inferred = inferNodeOutputType(
          node,
          postgresBlocks,
          connections,
          actions,
          workspace,
          readWorkspaceFile,
        )

        nodeEntries.push(
          `    ${safeName}${opt}: ${nodeShapeWithFormatted(`output: ${inferred ?? 'unknown'}`, node.outputFormat)}`,
        )
      }
    }
  }

  if (workflowDeclUsesOutputFormat(graph)) {
    typeLines.unshift(SWIRLS_CONTENT_TYPE_TS)
  }

  const nodesType = `{\n${nodeEntries.join('\n')}\n  }`
  const typePreamble = typeLines.length > 0 ? `${typeLines.join('\n')}\n\n` : ''

  const secretsType = secretsTypeForNode(undefined)

  const outputTs = leafPartialOutputsTsType(graph, fileAst, workspace)

  return `${typePreamble}type SwirlsContext = {
  nodes: ${nodesType}
  reviews: ${EMBEDDED_OPEN_OBJECT}
  secrets: ${secretsType}
  meta: { triggerId: string | null; triggerType: string | null }
  output: ${outputTs}
}
declare const context: SwirlsContext
declare const nodes: SwirlsContext['nodes']
declare const reviews: SwirlsContext['reviews']
`
}

export function resolveNodeDecision(
  node: NodeDecl | undefined,
  fileAst?: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
) {
  if (node?.type !== 'decision') {
    return undefined
  }

  const ref = node.configFields.decision

  if (ref?.kind !== 'string') {
    return undefined
  }

  const decl =
    fileAst?.decisions?.find((d) => d.name === ref.value) ??
    workspace?.decisionBlocks?.get(ref.value)

  if (!decl) {
    return undefined
  }

  try {
    return resolveDecisionDefinition(decl, getNamedSchemaMap(fileAst, workspace))
  } catch {
    return undefined
  }
}

function nodeDecisionOutput(
  node: NodeDecl | undefined,
  fileAst?: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
) {
  const decl = resolveNodeDecision(node, fileAst, workspace)
  return decl ? decisionOutputSchema(decl) : undefined
}
