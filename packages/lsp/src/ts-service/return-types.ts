import type {
  ConfigValue,
  NodeDecl,
  PostgresDecl,
  StreamDecl,
  StreamVersionDecl,
  SwirlsFile,
  WorkflowDecl,
} from '@swirls/language'
import type { WorkspaceResourceIndex } from '@swirls/language/workspace'
import {
  getGraphRefFromConfigFields,
  getLoopBodyWorkflowDecl,
  getNamedSchemaMap,
  getRootNode,
  integrationParamsReturnTypePreamble,
  integrationParamsReturnTypeString,
  postgresParamsReturnTypeString,
  resolveNodeDecision,
} from './context-types'
import { jsonSchemaToTsType } from './schema-to-ts'

/** Minimal block shape needed to resolve expected return type (avoids circular dependency on virtual-docs). */
interface TsBlockForReturnType {
  configKey: string
  node: NodeDecl
  allWorkflows: WorkflowDecl[]
  postgresBlocks?: PostgresDecl[]
  connections?: SwirlsFile['connections']
  actions?: SwirlsFile['actions']
  workspace?: import('@swirls/language/workspace').WorkspaceResourceIndex
  readWorkspaceFile?: import('./integration-types').WorkspaceFileReader
  /** Top-level `stream { versions { … } }` parent when typing per-version `@ts`. */
  streamDecl?: StreamDecl
  /** Version entry (`vN { }`) for `prepare` typing. */
  streamVersionDecl?: StreamVersionDecl
  /** Full AST; used to resolve `schema: name` references. */
  fileAst?: SwirlsFile
}

/**
 * Resolve the subgraph root node's inputSchema to a TypeScript type string.
 * Used for graph node `input` blocks.
 */
function getSubgraphInputReturnType(
  node: NodeDecl,
  allWorkflows: WorkflowDecl[],
  fileAst?: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): string | undefined {
  if (node.type !== 'workflow' && node.type !== 'graph') {
    return undefined
  }

  const workflowName = getGraphRefFromConfigFields(
    node.configFields as Record<string, { kind: string; value?: unknown }>,
  )

  if (!workflowName) {
    return undefined
  }

  const graph = allWorkflows.find((g) => g.name === workflowName)

  if (!graph) {
    return undefined
  }

  const rootNode = getRootNode(graph)

  const lit = resolveNodeInputSchemaLiteral(rootNode, fileAst, workspace)
  if (!lit) {
    return undefined
  }

  return jsonSchemaToTsType(lit)
}

function resolveNodeInputSchemaLiteral(
  node: NodeDecl | undefined,
  fileAst: SwirlsFile | undefined,
  workspace?: WorkspaceResourceIndex,
): Record<string, unknown> | undefined {
  if (!node) {
    return undefined
  }
  if (node.inputSchema && typeof node.inputSchema === 'object') {
    return node.inputSchema as Record<string, unknown>
  }
  if (node.inputSchemaRef) {
    const L = getNamedSchemaMap(fileAst, workspace).get(node.inputSchemaRef)
    if (L) {
      return L
    }
  }
  return undefined
}

function resolveNodeOutputSchemaLiteral(
  node: NodeDecl,
  fileAst: SwirlsFile | undefined,
  workspace?: WorkspaceResourceIndex,
): Record<string, unknown> | undefined {
  if (node.outputSchema && typeof node.outputSchema === 'object') {
    return node.outputSchema as Record<string, unknown>
  }
  if (node.outputSchemaRef) {
    const L = getNamedSchemaMap(fileAst, workspace).get(node.outputSchemaRef)
    if (L) {
      return L
    }
  }
  return undefined
}

function getLoopBodyInputReturnType(
  node: NodeDecl,
  allWorkflows: WorkflowDecl[],
  fileAst?: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): string | undefined {
  if (node.type !== 'map' && node.type !== 'while') {
    return undefined
  }
  const body = getLoopBodyWorkflowDecl(node, allWorkflows)
  const rootNode = body ? getRootNode(body) : undefined
  const lit = resolveNodeInputSchemaLiteral(rootNode, fileAst, workspace)
  if (!lit) {
    return undefined
  }
  return jsonSchemaToTsType(lit)
}

/**
 * Resolve switch node cases to a union of string literal types.
 * Used for switch node `router` blocks.
 */
function getSwitchCasesUnionType(node: NodeDecl): string | undefined {
  if (node.type !== 'switch') {
    return undefined
  }

  const casesCv = node.configFields.cases

  if (!casesCv || casesCv.kind !== 'array') {
    return undefined
  }

  const labels = casesCv.value
    .filter(
      (c): c is ConfigValue & { kind: 'string'; value: string } =>
        c.kind === 'string',
    )
    .map((c) => c.value)

  if (labels.length === 0) {
    return undefined
  }

  return labels.map((label) => JSON.stringify(label)).join(' | ')
}

/**
 * Resolve code node outputSchema to a TypeScript type string.
 * Used for `code` blocks.
 */
function getOutputSchemaReturnType(
  node: NodeDecl,
  fileAst?: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): string | undefined {
  const lit = resolveNodeOutputSchemaLiteral(node, fileAst, workspace)
  if (!lit) {
    return undefined
  }

  return jsonSchemaToTsType(lit)
}

/**
 * Return preamble type aliases that must precede `__ExpectedReturn` in the virtual TS file.
 * GraphQL integration `params` blocks emit recursive input-object aliases as separate declarations.
 */
export function getExpectedReturnTypePreamble(
  block: TsBlockForReturnType,
): string | undefined {
  if (block.configKey === 'params' && block.node.type === 'integration') {
    return integrationParamsReturnTypePreamble(
      block.node,
      block.connections,
      block.actions,
      block.workspace,
      block.readWorkspaceFile,
    )
  }
  return undefined
}

/**
 * Return the expected TypeScript return type for a TS block, or undefined if unconstrained.
 * - input + graph node: subgraph root inputSchema type
 * - prompt + ai node: string
 * - router + switch node: union of case label string literals
 * - code + node with outputSchema: outputSchema type
 * - params + postgres node: object type from table schema and {{placeholders}} (select, insert, update, delete)
 * - objective + parallel node: string
 * - query + search node: string
 * - searchQueries + parallel node: string[]
 * - urls + parallel node: string[]
 */
export function getExpectedReturnType(
  block: TsBlockForReturnType,
): string | undefined {
  switch (block.configKey) {
    case 'model':
      return ['decision', 'ai', 'agent'].includes(block.node.type)
        ? 'string'
        : undefined
    case 'state': {
      const decision = resolveNodeDecision(
        block.node,
        block.fileAst,
        block.workspace,
      )
      return decision ? jsonSchemaToTsType(decision.inputSchema) : undefined
    }
    case 'input': {
      if (block.node.type === 'workflow' || block.node.type === 'graph') {
        return getSubgraphInputReturnType(
          block.node,
          block.allWorkflows,
          block.fileAst,
          block.workspace,
        )
      }
      if (block.node.type === 'while') {
        return getLoopBodyInputReturnType(
          block.node,
          block.allWorkflows,
          block.fileAst,
          block.workspace,
        )
      }
      return undefined
    }
    case 'items': {
      if (block.node.type === 'map' || block.node.type === 'fanout') {
        const t = getLoopBodyInputReturnType(
          block.node,
          block.allWorkflows,
          block.fileAst,
          block.workspace,
        )
        return t ? `${t}[]` : undefined
      }
      return undefined
    }
    case 'update': {
      if (block.node.type === 'while') {
        return getLoopBodyInputReturnType(
          block.node,
          block.allWorkflows,
          block.fileAst,
          block.workspace,
        )
      }
      return undefined
    }
    case 'prompt': {
      if (block.node.type === 'ai') {
        return 'string'
      }
      return undefined
    }
    case 'router': {
      if (block.node.type === 'switch') {
        return getSwitchCasesUnionType(block.node)
      }
      return undefined
    }
    case 'code':
      return getOutputSchemaReturnType(
        block.node,
        block.fileAst,
        block.workspace,
      )
    case 'condition':
      return 'boolean'
    case 'prepare': {
      const sv = block.streamVersionDecl
      if (!sv) {
        return undefined
      }
      if (sv.schema && typeof sv.schema === 'object') {
        return jsonSchemaToTsType(sv.schema as Record<string, unknown>)
      }
      if (sv.schemaRef) {
        const L = getNamedSchemaMap(block.fileAst, block.workspace).get(
          sv.schemaRef,
        )
        if (L) {
          return jsonSchemaToTsType(L)
        }
      }
      return undefined
    }
    case 'params': {
      if (block.postgresBlocks && block.node.type === 'postgres') {
        return postgresParamsReturnTypeString(block.node, block.postgresBlocks)
      }
      if (block.node.type === 'integration') {
        return integrationParamsReturnTypeString(
          block.node,
          block.connections,
          block.actions,
          block.workspace,
          block.readWorkspaceFile,
        )
      }
      return undefined
    }
    case 'objective': {
      if (block.node.type === 'parallel') {
        return 'string'
      }
      return undefined
    }
    case 'query': {
      if (block.node.type === 'search') {
        return 'string'
      }
      return undefined
    }
    case 'searchQueries': {
      if (block.node.type === 'parallel') {
        return 'string[]'
      }
      return undefined
    }
    case 'urls': {
      if (block.node.type === 'parallel') {
        return 'string[]'
      }
      return undefined
    }
    default:
      return undefined
  }
}
