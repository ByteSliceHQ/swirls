/**
 * Extract SELECT result column names using node-sql-parser (PostgreSQL).
 * Used to validate stream node query SQL against outputSchema.items (array output).
 */

import { Parser } from 'node-sql-parser/build/postgresql'

const PLACEHOLDER = '{{table}}'
const PLACEHOLDER_REPLACEMENT = '_stream_table_'

/** Result: list of result-set column names, or star (use stream schema), or parse error. */
type SelectColumnsResult =
  | { kind: 'columns'; columns: string[] }
  | { kind: 'star' }
  | { kind: 'error'; message: string }

/**
 * Normalize SQL for parsing: replace {{table}} so the parser accepts it.
 */
function normalizeSql(sql: string): string {
  return sql.replace(PLACEHOLDER, PLACEHOLDER_REPLACEMENT)
}

/**
 * Get the result column name from an AST column item (expr + as).
 * Returns null if we cannot derive a name (e.g. complex expression without alias).
 */
function getColumnNameFromExpr(col: {
  expr?: { type?: string; column?: unknown; table?: string }
  as?: string | null
}): string | null {
  if (col.as != null && col.as !== '') {
    return col.as
  }

  const expr = col.expr

  if (!expr || expr.type !== 'column_ref') {
    return null
  }

  const column = expr.column

  if (column === '*') {
    return '*'
  }

  if (typeof column === 'string') {
    return column
  }

  if (
    column &&
    typeof column === 'object' &&
    'expr' in column &&
    column.expr &&
    typeof column.expr === 'object' &&
    'value' in column.expr
  ) {
    return String((column.expr as { value: unknown }).value)
  }

  return null
}

/**
 * Parse SQL and return the SELECT result column names (or star, or error).
 * Uses node-sql-parser PostgreSQL build. Replaces {{table}} before parsing.
 */
export function getSelectResultColumns(sql: string): SelectColumnsResult {
  const parser = new Parser()
  const normalized = normalizeSql(sql.trim())

  if (normalized === '') {
    return { kind: 'error', message: 'Empty SQL' }
  }

  try {
    const ast = parser.astify(normalized, { database: 'Postgresql' }) as {
      type?: string
      columns?: unknown
    }

    if (ast.type !== 'select') {
      return { kind: 'error', message: 'Only SELECT statements are allowed' }
    }

    const columns = ast.columns

    if (!Array.isArray(columns) || columns.length === 0) {
      return { kind: 'error', message: 'Could not parse SELECT list' }
    }

    const names: string[] = []

    for (const col of columns) {
      const name = getColumnNameFromExpr(col as Parameters<typeof getColumnNameFromExpr>[0])

      if (name === '*') {
        return { kind: 'star' }
      }

      if (name != null) {
        names.push(name)
      }
    }

    return { kind: 'columns', columns: names }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { kind: 'error', message: `Could not parse SQL: ${message}` }
  }
}
