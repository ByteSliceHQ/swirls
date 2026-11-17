/**
 * SQL block collection and schema inference for stream node query blocks.
 * Infers stream table schema from same-file graph output nodes (leaf node output schemas).
 */

import type {
  NodeDecl,
  PostgresDecl,
  SourceRange,
  SwirlsFile,
  WorkflowDecl,
} from '@swirls/language'
import { BRACE_PLACEHOLDER_RE } from '@swirls/language/postgres/sql-utils'

import { positionInRange } from '../ts-service/virtual-docs'

export interface SqlBlockInfo {
  code: string
  innerRange: SourceRange
  workflowName: string
  nodeName: string
  graph: WorkflowDecl
  node: NodeDecl
  /** Stream `query` vs postgres `select` / `insert` / `update` / `delete`. */
  sqlField: 'query' | 'select' | 'insert' | 'update' | 'delete'
  /** Set when `node` is `type: postgres` (for schema / hover). */
  postgresBlocks: PostgresDecl[]
}

/** JSON schema–like object (type, properties, etc.) from AST. */
type SchemaLike = Record<string, unknown>

function flattenSchemaPaths(schema: SchemaLike, prefix = ''): string[] {
  const paths: string[] = []

  if (schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    return paths
  }

  for (const [key, value] of Object.entries(schema.properties)) {
    if (!value || typeof value !== 'object') {
      continue
    }

    const child = value as SchemaLike
    const childPath = prefix ? `${prefix}.${key}` : key

    if (child.type === 'object' && child.properties && typeof child.properties === 'object') {
      paths.push(...flattenSchemaPaths(child, childPath))
    } else {
      paths.push(childPath)
    }
  }

  return paths
}

function getLeafNodeNames(graph: WorkflowDecl): Set<string> {
  const sources = new Set(graph.edges.map((e) => e.source))
  return new Set(graph.nodes.filter((n) => !sources.has(n.name)).map((n) => n.name))
}

/**
 * Compute stream table "columns" from a graph's leaf node output schemas.
 * Returns dot-delimited paths like ["node_a.field1", "node_b.value"].
 */
function computeStreamSchemaFromGraph(graph: WorkflowDecl): string[] {
  const leafNames = getLeafNodeNames(graph)
  const paths: string[] = []

  for (const node of graph.nodes) {
    if (!leafNames.has(node.name)) {
      continue
    }

    const outputSchema = node.outputSchema

    if (!outputSchema || typeof outputSchema !== 'object') {
      continue
    }

    const nodePaths = flattenSchemaPaths(outputSchema as SchemaLike, node.name)
    paths.push(...nodePaths)
  }

  return paths
}

/**
 * Resolve stream name to a top-level `stream` block in the same file.
 * Returns column paths from the version row JSON Schema, or from the referenced graph's leaf outputs.
 *
 * `versionPin` — reader `version:` (`vN`); when omitted, defaults to the stream's active `version` pointer.
 */
export function resolveStreamSchema(
  ast: SwirlsFile,
  streamName: string,
  versionPin?: string,
): string[] | null {
  for (const s of ast.streams ?? []) {
    if (s.name !== streamName) {
      continue
    }

    const active = (versionPin ?? s.version ?? '').trim()
    const vv = active ? s.versions.find((x) => x.key === active) : undefined

    if (vv?.schema != null && typeof vv.schema === 'object') {
      const paths = flattenSchemaPaths(vv.schema as SchemaLike, '')

      if (paths.length > 0) {
        return paths
      }
    }

    const graph = ast.workflows.find((g) => g.name === s.workflowName)

    if (!graph) {
      return null
    }

    return computeStreamSchemaFromGraph(graph)
  }

  return null
}

/**
 * Expected row shape from a stream node's outputSchema.items (when outputSchema.type === 'array').
 * Used to validate that the SQL SELECT result columns match the declared schema.
 */
interface StreamNodeOutputRowSchema {
  /** All property names in outputSchema.items.properties. */
  propertyNames: string[]
  /** Subset that are required. */
  requiredNames: string[]
}

/**
 * Extract expected row shape from a stream node's outputSchema when it describes an array of rows.
 * Uses outputSchema.items when outputSchema.type === 'array'. Returns null otherwise.
 */
export function getStreamNodeOutputRowSchema(node: NodeDecl): StreamNodeOutputRowSchema | null {
  const outputSchema = node.outputSchema

  if (!outputSchema || typeof outputSchema !== 'object') {
    return null
  }

  if (outputSchema.type !== 'array') {
    return null
  }

  const items = outputSchema.items

  if (!items || typeof items !== 'object') {
    return null
  }

  const itemsObj = items as Record<string, unknown>
  const itemProps = itemsObj.properties

  if (!itemProps || typeof itemProps !== 'object') {
    return null
  }

  const propertyNames = Object.keys(itemProps)
  const required = itemsObj.required

  const requiredNames = Array.isArray(required)
    ? (required as string[]).filter((r) => typeof r === 'string')
    : []

  return { propertyNames, requiredNames }
}

/**
 * Collect all SQL blocks from the AST (e.g. stream node query blocks).
 */
export function collectSqlBlocks(ast: SwirlsFile): SqlBlockInfo[] {
  const blocks: SqlBlockInfo[] = []
  const pgBlocks = ast.postgres ?? []

  for (const graph of ast.workflows) {
    for (const node of graph.nodes) {
      for (const [key, value] of Object.entries(node.configFields)) {
        if (key === 'query' && value?.kind === 'sql_block' && value.innerRange) {
          blocks.push({
            code: value.code,
            innerRange: value.innerRange,
            workflowName: graph.name,
            nodeName: node.name,
            graph,
            node,
            sqlField: 'query',
            postgresBlocks: [],
          })
        }

        if (
          node.type === 'postgres' &&
          (key === 'select' || key === 'insert' || key === 'update' || key === 'delete') &&
          value?.kind === 'sql_block' &&
          value.innerRange
        ) {
          blocks.push({
            code: value.code,
            innerRange: value.innerRange,
            workflowName: graph.name,
            nodeName: node.name,
            graph,
            node,
            sqlField: key,
            postgresBlocks: pgBlocks,
          })
        }
      }
    }
  }

  return blocks
}

export function findSqlBlockAtPosition(
  blocks: SqlBlockInfo[],
  line: number,
  character: number,
): SqlBlockInfo | null {
  for (const block of blocks) {
    if (positionInRange(line, character, block.innerRange)) {
      return block
    }
  }

  return null
}

/**
 * If `offset` falls inside `{{key}}` in SQL `code`, return `key`.
 */
export function findBracePlaceholderKeyAtCodeOffset(code: string, offset: number): string | null {
  BRACE_PLACEHOLDER_RE.lastIndex = 0
  let m: RegExpExecArray | null = BRACE_PLACEHOLDER_RE.exec(code)

  while (m !== null) {
    const start = m.index
    const end = start + (m[0]?.length ?? 0)

    if (offset >= start && offset < end) {
      return m[1] ?? null
    }

    m = BRACE_PLACEHOLDER_RE.exec(code)
  }

  return null
}
