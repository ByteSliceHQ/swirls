/**
 * Shared SQL regex constants and pure helpers for postgres `select:` / `insert:` /
 * `update:` / `delete:` heuristics. Used by the language validator and the LSP.
 */

/** `{{name}}` placeholders in SQL strings. */
export const BRACE_PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g

/** `INSERT INTO name (col1, col2) VALUES` — captures column list only. */
export const INSERT_COLUMNS_BEFORE_VALUES_RE =
  /\bINSERT\s+INTO\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(\s*([^)]+?)\s*\)\s*VALUES\b/is

/**
 * Table names referenced by simple `INSERT INTO t` / `UPDATE t` / `FROM t`
 * patterns (heuristic, not a full parser). The UPDATE match is anchored to the
 * statement start so `ON CONFLICT DO UPDATE SET` inside an upsert never yields
 * a phantom table.
 */
export function extractTablesFromSql(sql: string): string[] {
  const tables: string[] = []
  const insert = sql.match(/\bINSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i)
  if (insert) {
    tables.push(insert[1]!)
  }
  const update = sql.match(/^\s*UPDATE\s+(?:ONLY\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/i)
  if (update) {
    tables.push(update[1]!)
  }
  const from = sql.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i)
  if (from) {
    tables.push(from[1]!)
  }
  return tables
}

/** Parses `INSERT INTO t (a, b) VALUES` column names; null if no explicit list. */
export function parseInsertExplicitColumns(sql: string): string[] | null {
  const m = INSERT_COLUMNS_BEFORE_VALUES_RE.exec(sql)
  if (!m) {
    return null
  }
  const cols =
    m[1]
      ?.split(',')
      .map((c) => c.trim().split(/\s+/).pop() ?? c.trim())
      .filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) ?? []
  return cols.length > 0 ? cols : null
}

/**
 * Column names assigned in an `UPDATE t SET a = ..., b = ...` clause; null when
 * no SET clause parses. Fragments that are not a simple `identifier =` (for
 * example the tail of a function call split on its inner comma) are skipped, so
 * this under-reports rather than inventing columns.
 */
export function parseUpdateSetColumns(sql: string): string[] | null {
  const m = /\bSET\b([\s\S]*?)(?:\bWHERE\b|\bFROM\b|\bRETURNING\b|$)/i.exec(sql)
  if (!m) {
    return null
  }
  const cols =
    m[1]
      ?.split(',')
      .map((fragment) => /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/.exec(fragment)?.[1])
      .filter((c): c is string => c !== undefined) ?? []
  return cols.length > 0 ? cols : null
}

/** True when the statement has a WHERE clause (guards full-table update/delete). */
export function sqlHasWhereClause(sql: string): boolean {
  return /\bWHERE\b/i.test(sql)
}

/**
 * True if `VALUES` is followed by `(` after whitespace (PostgreSQL row constructor).
 * If there is no `VALUES` keyword, returns true so other diagnostics can handle the shape.
 */
export function insertValuesRowOpensWithParen(sql: string): boolean {
  const m = /\bVALUES\b/i.exec(sql)
  if (!m) {
    return true
  }
  let i = m.index + m[0].length
  while (i < sql.length && /\s/.test(sql[i]!)) {
    i++
  }
  return i < sql.length && sql[i] === '('
}
