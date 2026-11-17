import type {
  NodeDecl,
  PostgresDecl,
  PostgresTableDecl,
} from '@swirls/language'
import {
  BRACE_PLACEHOLDER_RE,
  extractTablesFromSql,
  parseInsertExplicitColumns,
} from '@swirls/language/postgres/sql-utils'
import { jsonSchemaToTsType } from './schema-to-ts'
import {
  DISK_COPY_FILE_OUTPUT_TS,
  DISK_EXEC_OUTPUT_TS,
  FIRECRAWL_OUTPUT_TS,
  PARALLEL_EXTRACT_OUTPUT_TS,
  PARALLEL_FINDALL_OUTPUT_TS,
  PARALLEL_SEARCH_OUTPUT_TS,
  RESEND_OUTPUT_TS,
  SEARCH_OUTPUT_TS,
} from './vendor-output-types'

const SELECT_COLUMNS_RE = /\bSELECT\s+([\s\S]*?)\bFROM\b/i

/**
 * Extract a table name from a SQL string (simple heuristic, not a full parser).
 * Prefers `FROM` when both `INSERT INTO` and `FROM` match (same as legacy regex
 * order); for a statement-leading `UPDATE` the update target wins, since its
 * columns are what SET / WHERE placeholders bind against.
 */
function extractTableName(sql: string): string | undefined {
  const tables = extractTablesFromSql(sql)
  if (tables.length === 0) {
    return undefined
  }
  if (/^\s*UPDATE\b/i.test(sql)) {
    return tables[0]
  }
  if (tables.length >= 2) {
    return tables[1]
  }
  return tables[0]
}

/**
 * Extract column names from a SELECT clause. Returns undefined for `SELECT *`.
 */
function extractSelectColumns(sql: string): string[] | undefined {
  const m = SELECT_COLUMNS_RE.exec(sql)
  if (!m) {
    return undefined
  }
  const clause = m[1].trim()
  if (clause === '*') {
    return undefined
  }
  return clause
    .split(',')
    .map((c) =>
      c
        .trim()
        .replace(/.*\s+AS\s+/i, '')
        .replace(/.*\./, ''),
    )
    .filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c))
}

/**
 * Project a JSON Schema object type to only the specified columns.
 */
function projectSchemaToColumns(
  schema: Record<string, unknown>,
  columns: string[],
): Record<string, unknown> {
  const props = schema.properties as Record<string, unknown> | undefined
  if (!props) {
    return schema
  }

  const required = (schema.required as string[] | undefined) ?? []
  const projected: Record<string, unknown> = {}
  for (const col of columns) {
    if (col in props) {
      projected[col] = props[col]
    }
  }

  return {
    type: 'object',
    properties: projected,
    required: required.filter((r) => columns.includes(r)),
  }
}

/**
 * Locate the `postgres` block table declaration and SQL string for a `type: postgres` node.
 * Shared by projected row typing (`resolveTableSchema`) and full-row / param typing.
 */
function findPostgresTableDeclAndSqlForNode(
  node: NodeDecl,
  postgresBlocks: PostgresDecl[],
): { table: PostgresTableDecl; sql: string } | undefined {
  const fields = node.configFields as Record<
    string,
    { kind: string; value?: unknown; code?: string } | undefined
  >
  const blockName =
    fields.postgres?.kind === 'string'
      ? (fields.postgres.value as string)
      : undefined
  if (!blockName) {
    return undefined
  }

  const block = postgresBlocks.find((b) => b.name === blockName)
  if (!block) {
    return undefined
  }

  const sql =
    (fields.select?.kind === 'sql_block' ? fields.select.code : undefined) ??
    (fields.insert?.kind === 'sql_block' ? fields.insert.code : undefined) ??
    (fields.update?.kind === 'sql_block' ? fields.update.code : undefined) ??
    (fields.delete?.kind === 'sql_block' ? fields.delete.code : undefined)
  if (!sql) {
    return undefined
  }

  const tableName = extractTableName(sql)
  if (!tableName) {
    return undefined
  }

  const table = block.tables.find((t) => t.name === tableName)
  if (!table?.schema) {
    return undefined
  }

  return { table, sql }
}

/**
 * Resolve a projected table schema for a postgres node by matching the block
 * reference, table name, and selected columns from the SQL.
 */
function resolveTableSchema(
  node: NodeDecl,
  postgresBlocks: PostgresDecl[],
): Record<string, unknown> | undefined {
  const resolved = findPostgresTableDeclAndSqlForNode(node, postgresBlocks)
  if (!resolved) {
    return undefined
  }
  const { table, sql } = resolved

  const columns = extractSelectColumns(sql)
  if (!columns) {
    return table.schema as Record<string, unknown>
  }

  return projectSchemaToColumns(
    table.schema as Record<string, unknown>,
    columns,
  )
}

/**
 * Full row JSON Schema for the table referenced by the node's SQL (no SELECT projection).
 * Used for param / placeholder typing when a column appears in WHERE but not in the SELECT list.
 */
function resolveFullTableRowSchema(
  node: NodeDecl,
  postgresBlocks: PostgresDecl[],
): Record<string, unknown> | undefined {
  const resolved = findPostgresTableDeclAndSqlForNode(node, postgresBlocks)
  if (!resolved) {
    return undefined
  }
  return resolved.table.schema as Record<string, unknown>
}

/**
 * Text inside the first `VALUES ( ... )` row (balanced parens), for placeholder order.
 */
function extractFirstValuesRowInner(sql: string): string | undefined {
  const vm = /\bVALUES\b/i.exec(sql)
  if (!vm) {
    return undefined
  }
  let i = vm.index + vm[0].length
  while (i < sql.length && /\s/.test(sql[i]!)) {
    i++
  }
  if (sql[i] !== '(') {
    return undefined
  }
  let depth = 1
  const start = i + 1
  i++
  while (i < sql.length && depth > 0) {
    const ch = sql[i]!
    if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
    }
    i++
  }
  if (depth !== 0) {
    return undefined
  }
  return sql.slice(start, i - 1)
}

function extractPlaceholdersInOrderInSubstring(s: string): string[] {
  const keys: string[] = []
  BRACE_PLACEHOLDER_RE.lastIndex = 0
  let m: RegExpExecArray | null = BRACE_PLACEHOLDER_RE.exec(s)
  while (m !== null) {
    keys.push(m[1]!)
    m = BRACE_PLACEHOLDER_RE.exec(s)
  }
  return keys
}

/**
 * Map each `{{name}}` in the first VALUES row to the INSERT column at the same index
 * (when an explicit column list exists).
 */
function buildInsertPlaceholderToColumnName(
  sql: string,
  columns: string[] | null,
): Map<string, string> {
  const map = new Map<string, string>()
  if (!columns || columns.length === 0) {
    return map
  }
  const inner = extractFirstValuesRowInner(sql)
  const placeholders =
    inner !== undefined
      ? extractPlaceholdersInOrderInSubstring(inner)
      : extractPlaceholdersAfterValues(sql)
  for (let i = 0; i < placeholders.length && i < columns.length; i++) {
    const ph = placeholders[i]!
    const col = columns[i]!
    if (!map.has(ph)) {
      map.set(ph, col)
    }
  }
  return map
}

/**
 * Fallback when VALUES has no parentheses: collect placeholders after the VALUES keyword.
 */
function extractPlaceholdersAfterValues(sql: string): string[] {
  const vm = /\bVALUES\b/i.exec(sql)
  if (!vm) {
    return []
  }
  return extractPlaceholdersInOrderInSubstring(
    sql.slice(vm.index + vm[0].length),
  )
}

function allPlaceholderKeysFirstAppearance(sql: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  BRACE_PLACEHOLDER_RE.lastIndex = 0
  let m: RegExpExecArray | null = BRACE_PLACEHOLDER_RE.exec(sql)
  while (m !== null) {
    const k = m[1]!
    if (!seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
    m = BRACE_PLACEHOLDER_RE.exec(sql)
  }
  return out
}

function findSelectComparisonColumnForPlaceholder(
  sql: string,
  placeholderKey: string,
): string | undefined {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(placeholderKey)) {
    return undefined
  }
  const left = new RegExp(
    `\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*=\\s*\\{\\{${placeholderKey}\\}\\}`,
    'i',
  )
  const ml = left.exec(sql)
  if (ml) {
    return ml[1]
  }
  const right = new RegExp(
    `\\{\\{${placeholderKey}\\}\\}\\s*=\\s*\\b([a-zA-Z_][a-zA-Z0-9_]*)\\b`,
    'i',
  )
  const mr = right.exec(sql)
  return mr?.[1]
}

function tsFromSchemaProp(
  props: Record<string, unknown>,
  col: string | undefined,
): string | undefined {
  if (!col || !(col in props)) {
    return undefined
  }
  const sub = props[col]
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
    return 'unknown'
  }
  return jsonSchemaToTsType(sub as Record<string, unknown>)
}

/**
 * Infer a TypeScript output type for a node based on its type and config
 * when no explicit outputSchema is provided.
 */
function parallelOperation(
  node: NodeDecl,
): 'search' | 'extract' | 'findall' | undefined {
  const cv = node.configFields.operation
  if (!cv || cv.kind !== 'string') {
    return undefined
  }
  if (
    cv.value === 'search' ||
    cv.value === 'extract' ||
    cv.value === 'findall'
  ) {
    return cv.value
  }
  return undefined
}

export function inferOutputTypeForNode(
  node: NodeDecl | undefined,
  postgresBlocks: PostgresDecl[],
): string | undefined {
  if (!node) {
    return undefined
  }

  if (node.type === 'parallel') {
    const op = parallelOperation(node)
    if (op === 'search') {
      return PARALLEL_SEARCH_OUTPUT_TS
    }
    if (op === 'extract') {
      return PARALLEL_EXTRACT_OUTPUT_TS
    }
    if (op === 'findall') {
      return PARALLEL_FINDALL_OUTPUT_TS
    }
    return undefined
  }

  if (node.type === 'scrape') {
    return FIRECRAWL_OUTPUT_TS
  }

  if (node.type === 'search') {
    return SEARCH_OUTPUT_TS
  }

  if (node.type === 'email') {
    return RESEND_OUTPUT_TS
  }

  if (node.type === 'disk') {
    const op = node.configFields.operation
    if (op?.kind === 'string' && op.value === 'copy_file') {
      return DISK_COPY_FILE_OUTPUT_TS
    }
    return DISK_EXEC_OUTPUT_TS
  }

  if (node.type === 'postgres') {
    const fields = node.configFields as Record<
      string,
      { kind: string; code?: string } | undefined
    >

    const tableSchema = resolveTableSchema(node, postgresBlocks)

    if (fields.select) {
      if (tableSchema) {
        return `(${jsonSchemaToTsType(tableSchema)})[]`
      }
      return 'Record<string, unknown>[]'
    }
    if (fields.insert || fields.update || fields.delete) {
      return '{ executed: boolean } | { skipped: boolean }'
    }
  }

  return undefined
}

/**
 * Build `{ key: type; ... [key: string]: unknown }` from an array of typed placeholder entries.
 * The index signature allows arbitrary extra keys while constraining known placeholders.
 */
function paramsObjectType(parts: string[]): string {
  return `{ ${parts.join('; ')}; [key: string]: unknown }`
}

/**
 * Expected `return { ... }` type for a postgres node's `params` @ts block.
 * INSERT uses column-list positional mapping; SELECT / UPDATE / DELETE use
 * simple `column = {{key}}` comparison patterns (SET assignments and WHERE
 * comparisons share that shape). Includes an index signature so extra param
 * keys are allowed.
 */
export function postgresParamsReturnTypeString(
  node: NodeDecl,
  postgresBlocks: PostgresDecl[],
): string | undefined {
  if (node.type !== 'postgres') {
    return undefined
  }

  const fullSchema = resolveFullTableRowSchema(node, postgresBlocks)
  if (!fullSchema) {
    return undefined
  }
  const props = fullSchema.properties as Record<string, unknown> | undefined
  if (!props) {
    return undefined
  }

  const fields = node.configFields as Record<
    string,
    { kind: string; code?: string } | undefined
  >

  if (fields.insert?.kind === 'sql_block') {
    const sql = fields.insert.code!
    const keys = allPlaceholderKeysFirstAppearance(sql)
    if (keys.length === 0) {
      return undefined
    }
    const cols = parseInsertExplicitColumns(sql)
    const phToCol = buildInsertPlaceholderToColumnName(sql, cols)
    const parts: string[] = []
    for (const k of keys) {
      const col = phToCol.get(k)
      const t = tsFromSchemaProp(props, col) ?? 'unknown'
      parts.push(`${k}: ${t}`)
    }
    return paramsObjectType(parts)
  }

  const comparisonSql =
    (fields.select?.kind === 'sql_block' ? fields.select.code : undefined) ??
    (fields.update?.kind === 'sql_block' ? fields.update.code : undefined) ??
    (fields.delete?.kind === 'sql_block' ? fields.delete.code : undefined)

  if (comparisonSql) {
    const keys = allPlaceholderKeysFirstAppearance(comparisonSql)
    if (keys.length === 0) {
      return undefined
    }
    const parts: string[] = []
    for (const k of keys) {
      const col = findSelectComparisonColumnForPlaceholder(comparisonSql, k)
      const t = tsFromSchemaProp(props, col) ?? 'unknown'
      parts.push(`${k}: ${t}`)
    }
    return paramsObjectType(parts)
  }

  return undefined
}

/**
 * TypeScript type string for a `{{name}}` placeholder: inferred from SQL (INSERT column
 * position, or simple `column = {{name}}` patterns on SELECT / UPDATE / DELETE), not from
 * matching the param name to a column.
 */
export function getPostgresPlaceholderTsTypeString(
  node: NodeDecl,
  postgresBlocks: PostgresDecl[],
  placeholderKey: string,
): string | undefined {
  const row = resolveFullTableRowSchema(node, postgresBlocks)
  if (!row) {
    return undefined
  }
  const props = row.properties as Record<string, unknown> | undefined
  if (!props) {
    return undefined
  }

  const fields = node.configFields as Record<
    string,
    { kind: string; code?: string } | undefined
  >

  if (fields.insert?.kind === 'sql_block' && fields.insert.code) {
    const sql = fields.insert.code
    const cols = parseInsertExplicitColumns(sql)
    const phToCol = buildInsertPlaceholderToColumnName(sql, cols)
    const col = phToCol.get(placeholderKey)
    return tsFromSchemaProp(props, col) ?? 'unknown'
  }

  const comparisonSql =
    (fields.select?.kind === 'sql_block' ? fields.select.code : undefined) ??
    (fields.update?.kind === 'sql_block' ? fields.update.code : undefined) ??
    (fields.delete?.kind === 'sql_block' ? fields.delete.code : undefined)

  if (comparisonSql) {
    const col = findSelectComparisonColumnForPlaceholder(
      comparisonSql,
      placeholderKey,
    )
    return tsFromSchemaProp(props, col) ?? 'unknown'
  }

  return undefined
}
