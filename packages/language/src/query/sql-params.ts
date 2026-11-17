import { BRACE_PLACEHOLDER_RE } from '../postgres/sql-utils'

/** Ordered unique `{{name}}` placeholders from a SQL string. */
export function extractSqlParams(sql: string): string[] {
  const params: string[] = []
  const seen = new Set<string>()
  for (const match of sql.matchAll(BRACE_PLACEHOLDER_RE)) {
    const name = match[1]!
    if (!seen.has(name)) {
      seen.add(name)
      params.push(name)
    }
  }
  return params
}

/** Reject obvious write/DDL statements at the start of SQL. */
export function isReadOnlySqlHeuristic(sql: string): boolean {
  const trimmed = sql.trim()
  if (trimmed.length === 0) {
    return false
  }
  return !/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i.test(
    trimmed,
  )
}
