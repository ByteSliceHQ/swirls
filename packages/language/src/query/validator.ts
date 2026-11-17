import { resourceNameSchema } from '@swirls/definition/schemas'

import type { Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { QueryDecl } from './ast'
import { extractSqlParams, isReadOnlySqlHeuristic } from './sql-params'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(name: string, range: SourceRange, kind: string): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)

  if (result.success) {
    return []
  }

  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

export function validateQueryBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const queryBlocks = ast.queries ?? []

  const databaseNames = nameLookup(
    new Set((ast.databases ?? []).map((d) => d.name)),
    options?.workspace?.databases,
  )

  for (const query of queryBlocks) {
    out.push(...validateResourceName(query.name, query.range, 'Query'))
    const sameName = queryBlocks.filter((x) => x.name === query.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate query name "${query.name}"`, query.range))
    }

    out.push(...validateQueryDecl(query, databaseNames))
  }

  return out
}

function validateQueryDecl(query: QueryDecl, databaseNames: Set<string>): Diagnostic[] {
  const out: Diagnostic[] = []

  if (!query.database) {
    out.push(diag(`Query "${query.name}" requires "database: <name>"`, query.range))
  } else if (!databaseNames.has(query.database)) {
    out.push(
      diag(
        `Query references database "${query.database}" which is not defined`,
        query.databaseRange ?? query.range,
      ),
    )
  }

  if (!query.sql) {
    out.push(diag(`Query "${query.name}" requires "sql: @sql { … }"`, query.range))
    return out
  }

  if (query.sql.kind !== 'sql_block') {
    out.push(diag(`Query "${query.name}": sql must be a @sql block`, query.sql.range))
    return out
  }

  const body = query.sql.code?.trim() ?? ''

  if (body.length === 0) {
    out.push(diag(`Query "${query.name}": sql requires a non-empty @sql block`, query.sql.range))
    return out
  }

  if (!isReadOnlySqlHeuristic(body)) {
    out.push(
      diag(
        `Query "${query.name}": sql must be a read-only SELECT (no INSERT, UPDATE, DELETE, or DDL)`,
        query.sql.range,
      ),
    )
  }

  for (const param of extractSqlParams(body)) {
    const result = resourceNameSchema.safeParse(param)

    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? 'Invalid name'

      out.push(
        diag(
          `Query "${query.name}": sql placeholder {{${param}}} is invalid (${msg})`,
          query.sql.range,
        ),
      )
    }
  }

  return out
}
