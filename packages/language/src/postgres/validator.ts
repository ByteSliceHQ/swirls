/**
 * Validation for postgres blocks and type: postgres nodes.
 * Called from the main validator.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'
import type {
  ConfigValue,
  Diagnostic,
  NodeDecl,
  SourceRange,
  SwirlsFile,
} from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type { PostgresDecl } from './ast'
import {
  BRACE_PLACEHOLDER_RE,
  extractTablesFromSql,
  insertValuesRowOpensWithParen,
  parseInsertExplicitColumns,
  parseUpdateSetColumns,
  sqlHasWhereClause,
} from './sql-utils'

const SECRET_KEY_PATTERN = /^[a-zA-Z0-9_]+$/

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(
  name: string,
  range: SourceRange,
  kind: string,
): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)
  if (result.success) {
    return []
  }
  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

function validatePostgresDeclFields(
  r: PostgresDecl,
  secretVars: Set<string> | null,
): Diagnostic[] {
  const out: Diagnostic[] = []

  if (!r.connection) {
    out.push(diag('Postgres block requires a connection field', r.range))
  } else if (r.connectionIsLiteral) {
    out.push(
      diag(
        'Postgres connection contains a plaintext string. Use a secret identifier for production deployments.',
        r.connectionRange,
        'warning',
      ),
    )
  } else {
    if (!SECRET_KEY_PATTERN.test(r.connection)) {
      out.push(
        diag(
          'Invalid connection secret key (use only letters, digits, and underscore)',
          r.connectionRange,
        ),
      )
    }
    if (secretVars && !secretVars.has(r.connection)) {
      out.push(
        diag(
          `Postgres "${r.name}" connection "${r.connection}" must reference a var from secret block "${r.secretsRef}"`,
          r.connectionRange,
        ),
      )
    }
  }

  if (r.tables.length === 0) {
    out.push(diag('Postgres block must declare at least one table', r.range))
  }

  const tableNames = new Set<string>()
  for (const t of r.tables) {
    if (tableNames.has(t.name)) {
      out.push(
        diag(`Duplicate table name "${t.name}" in postgres block`, t.range),
      )
    }
    tableNames.add(t.name)

    if (!t.schema || Object.keys(t.schema).length === 0) {
      out.push(diag(`Table "${t.name}" requires a schema`, t.range))
    }
  }

  return out
}

export function validatePostgresBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.postgres ?? []
  const secretsByName = new Map<string, Set<string>>()

  for (const s of ast.secrets ?? []) {
    secretsByName.set(s.name, new Set(s.vars))
  }

  function hasSecretBlock(name: string): boolean {
    if (secretsByName.has(name)) {
      return true
    }
    return options?.workspace?.secrets.has(name) ?? false
  }

  function secretVarsForRef(name: string): Set<string> | null {
    const local = secretsByName.get(name)
    if (local) {
      return local
    }
    const w = options?.workspace?.secrets.get(name)
    if (w) {
      return new Set(w.vars)
    }
    return null
  }

  const names = new Set<string>()

  for (const r of blocks) {
    out.push(...validateResourceName(r.name, r.range, 'Postgres block'))

    if (names.has(r.name)) {
      out.push(diag(`Duplicate postgres block name "${r.name}"`, r.range))
    }
    names.add(r.name)

    if (r.secretsRef !== undefined && r.secretsRef !== '') {
      if (!hasSecretBlock(r.secretsRef)) {
        out.push(
          diag(
            `Postgres "${r.name}" references undefined secret block "${r.secretsRef}"`,
            r.range,
          ),
        )
      }
    }

    const secretVars =
      r.secretsRef !== undefined && r.secretsRef !== ''
        ? secretVarsForRef(r.secretsRef)
        : null

    out.push(...validatePostgresDeclFields(r, secretVars))
  }

  return out
}

/** Property keys from a JSON Schema object literal (table row schema). */
function propertiesKeysFromTableSchema(
  schema: Record<string, unknown>,
): Set<string> | null {
  const props = schema.properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return null
  }
  return new Set(Object.keys(props as Record<string, unknown>))
}

/**
 * Ensure explicit `INSERT INTO t (col1, col2)` column names exist on the declared table schema.
 * Placeholder and `params:` key names are user-chosen; they are not validated against schema
 * property names (see LSP / engine: types follow SQL position or simple comparisons).
 */
function validateInsertExplicitColumnsAgainstTableSchema(
  sql: string,
  propertyKeys: Set<string>,
  sqlRange: SourceRange,
  postgresBlockName: string,
  tableName: string,
): Diagnostic[] {
  const out: Diagnostic[] = []

  const insertCols = parseInsertExplicitColumns(sql)
  if (insertCols) {
    for (const col of insertCols) {
      if (!propertyKeys.has(col)) {
        out.push(
          diag(
            `Column "${col}" is not declared on table "${tableName}" in postgres block "${postgresBlockName}"`,
            sqlRange,
          ),
        )
      }
    }
  }

  return out
}

/** Remove TS string literals so `detail: "Score: "` does not yield a false `Score` key. */
function stripTsStringLiterals(code: string): string {
  return code
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
}

function keysFromParamsBlock(paramsCv: ConfigValue | undefined): Set<string> {
  if (!paramsCv || paramsCv.kind !== 'ts_block') {
    return new Set()
  }
  const keys = new Set<string>()
  const code = stripTsStringLiterals(paramsCv.code)
  const retObj = code.match(/return\s*\{([^}]*)\}/s)
  if (!retObj) {
    return keys
  }
  const body = retObj[1]!
  const propRe = /(\w+)\s*:/g
  for (const m of body.matchAll(propRe)) {
    const name = m[1]
    if (name !== undefined) {
      keys.add(name)
    }
  }
  return keys
}

/**
 * True when the SQL contains at least one `{{key}}` placeholder. Resets the
 * shared global regex's lastIndex on both sides so later matchAll calls (which
 * inherit lastIndex from the original) start from the top of the string.
 */
function hasBracePlaceholders(sql: string): boolean {
  BRACE_PLACEHOLDER_RE.lastIndex = 0
  const found = BRACE_PLACEHOLDER_RE.test(sql)
  BRACE_PLACEHOLDER_RE.lastIndex = 0
  return found
}

function validateBraceKeysAgainstParams(
  sql: string,
  paramsCv: ConfigValue | undefined,
  sqlRange: SourceRange,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const declared = keysFromParamsBlock(paramsCv)
  for (const m of sql.matchAll(BRACE_PLACEHOLDER_RE)) {
    const key = m[1]
    if (key !== undefined && declared.size > 0 && !declared.has(key)) {
      out.push(
        diag(
          `SQL placeholder "{{${key}}}" has no matching key in params return object`,
          sqlRange,
        ),
      )
    }
  }
  return out
}

function validatePostgresNode(
  node: NodeDecl,
  pgByName: Map<string, PostgresDecl>,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const cf = node.configFields

  const postgresCv = cf.postgres
  if (!postgresCv || postgresCv.kind !== 'string') {
    out.push(diag('Postgres node requires a "postgres" field', node.range))
    return out
  }

  const pgName = postgresCv.value
  const pg = pgByName.get(pgName)
  if (!pg) {
    out.push(
      diag(
        `Postgres node references undefined postgres block "${pgName}"`,
        postgresCv.range,
      ),
    )
    return out
  }

  const selectCv = cf.select
  const insertCv = cf.insert
  const updateCv = cf.update
  const deleteCv = cf.delete
  const hasSelect = selectCv?.kind === 'sql_block'
  const hasInsert = insertCv?.kind === 'sql_block'
  const hasUpdate = updateCv?.kind === 'sql_block'
  const hasDelete = deleteCv?.kind === 'sql_block'

  const presentCount = [hasSelect, hasInsert, hasUpdate, hasDelete].filter(
    Boolean,
  ).length

  if (presentCount > 1) {
    out.push(
      diag(
        'Postgres node requires exactly one of "select", "insert", "update", or "delete"; found more than one',
        node.range,
      ),
    )
    return out
  }

  if (presentCount === 0) {
    out.push(
      diag(
        'Postgres node requires exactly one of "select", "insert", "update", or "delete"',
        node.range,
      ),
    )
    return out
  }

  const paramsCv = cf.params
  const conditionCv = cf.condition

  // Narrowing does not flow into closures; rebind the checked block.
  const pgDecl = pg

  function validateTablesDeclared(
    sqlCode: string,
    sqlRange: SourceRange,
  ): void {
    const tables = extractTablesFromSql(sqlCode)
    const declared = new Set(pgDecl.tables.map((t) => t.name.toLowerCase()))
    for (const t of tables) {
      if (!declared.has(t.toLowerCase())) {
        out.push(
          diag(
            `Table "${t}" is not declared in postgres block "${pgDecl.name}"`,
            sqlRange,
          ),
        )
      }
    }
  }

  if (conditionCv && conditionCv.kind !== 'ts_block') {
    out.push(diag('condition must be a @ts block', node.range))
  }

  if (hasSelect) {
    const sql = selectCv?.code.trim()
    const upper = sql.toUpperCase()
    if (sql && !upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
      out.push(
        diag('Postgres select must be a SELECT statement', selectCv?.range),
      )
    }
    validateTablesDeclared(selectCv?.code, selectCv?.range)
    if (paramsCv) {
      out.push(
        ...validateBraceKeysAgainstParams(
          selectCv?.code,
          paramsCv,
          selectCv?.range,
        ),
      )
    }
    if (conditionCv) {
      out.push(
        diag(
          'condition is only valid on postgres write nodes (insert, update, delete)',
          node.range,
        ),
      )
    }
  }

  if (hasInsert) {
    const insertCode = insertCv?.code
    const sql = insertCode.trim().toUpperCase()
    if (sql && !sql.startsWith('INSERT')) {
      out.push(
        diag('Postgres insert must be an INSERT statement', insertCv?.range),
      )
    }
    if (
      sql.startsWith('INSERT') &&
      !insertValuesRowOpensWithParen(insertCode)
    ) {
      out.push(
        diag(
          'Postgres INSERT VALUES clause must wrap row values in parentheses, e.g. VALUES ({{key}})',
          insertCv?.range,
        ),
      )
    }
    if (!paramsCv || paramsCv.kind !== 'ts_block') {
      out.push(
        diag(
          'Postgres insert node requires a "params" (@ts block)',
          node.range,
        ),
      )
    }
    validateTablesDeclared(insertCv?.code, insertCv?.range)

    const tables = extractTablesFromSql(insertCv?.code)
    const insertTarget = tables[0]
    const tableDecl = insertTarget
      ? pg.tables.find(
          (t) => t.name.toLowerCase() === insertTarget.toLowerCase(),
        )
      : undefined
    if (tableDecl) {
      const propKeys = propertiesKeysFromTableSchema(
        tableDecl.schema as Record<string, unknown>,
      )
      if (propKeys !== null) {
        out.push(
          ...validateInsertExplicitColumnsAgainstTableSchema(
            insertCv?.code,
            propKeys,
            insertCv?.range,
            pg.name,
            tableDecl.name,
          ),
        )
      }
    }

    out.push(
      ...validateBraceKeysAgainstParams(
        insertCv?.code,
        paramsCv,
        insertCv?.range,
      ),
    )
  }

  if (hasUpdate) {
    const updateCode = updateCv?.code
    const sql = updateCode.trim().toUpperCase()
    if (sql && !sql.startsWith('UPDATE')) {
      out.push(
        diag('Postgres update must be an UPDATE statement', updateCv?.range),
      )
    }
    if (!sqlHasWhereClause(updateCode)) {
      out.push(
        diag(
          'Postgres UPDATE has no WHERE clause and will modify every row in the table',
          updateCv?.range,
          'warning',
        ),
      )
    }
    if (hasBracePlaceholders(updateCode) && paramsCv?.kind !== 'ts_block') {
      out.push(
        diag(
          'Postgres update node requires a "params" (@ts block) when the SQL uses {{key}} placeholders',
          node.range,
        ),
      )
    }
    validateTablesDeclared(updateCode, updateCv?.range)

    const updateTarget = extractTablesFromSql(updateCode)[0]
    const tableDecl = updateTarget
      ? pg.tables.find(
          (t) => t.name.toLowerCase() === updateTarget.toLowerCase(),
        )
      : undefined
    if (tableDecl) {
      const propKeys = propertiesKeysFromTableSchema(
        tableDecl.schema as Record<string, unknown>,
      )
      const setCols =
        propKeys !== null ? parseUpdateSetColumns(updateCode) : null
      if (propKeys !== null && setCols) {
        for (const col of setCols) {
          if (!propKeys.has(col)) {
            out.push(
              diag(
                `Column "${col}" is not declared on table "${tableDecl.name}" in postgres block "${pg.name}"`,
                updateCv?.range,
              ),
            )
          }
        }
      }
    }

    out.push(
      ...validateBraceKeysAgainstParams(updateCode, paramsCv, updateCv?.range),
    )
  }

  if (hasDelete) {
    const deleteCode = deleteCv?.code
    const sql = deleteCode.trim().toUpperCase()
    if (sql && !sql.startsWith('DELETE')) {
      out.push(
        diag('Postgres delete must be a DELETE statement', deleteCv?.range),
      )
    }
    if (!sqlHasWhereClause(deleteCode)) {
      out.push(
        diag(
          'Postgres DELETE has no WHERE clause and will remove every row in the table',
          deleteCv?.range,
          'warning',
        ),
      )
    }
    if (hasBracePlaceholders(deleteCode) && paramsCv?.kind !== 'ts_block') {
      out.push(
        diag(
          'Postgres delete node requires a "params" (@ts block) when the SQL uses {{key}} placeholders',
          node.range,
        ),
      )
    }
    validateTablesDeclared(deleteCode, deleteCv?.range)

    out.push(
      ...validateBraceKeysAgainstParams(deleteCode, paramsCv, deleteCv?.range),
    )
  }

  return out
}

export function validatePostgresNodes(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const pgByName = new Map<string, PostgresDecl>()
  for (const p of ast.postgres ?? []) {
    pgByName.set(p.name, p)
  }
  if (options?.workspace?.postgresBlocks) {
    for (const [name, decl] of options.workspace.postgresBlocks) {
      if (!pgByName.has(name)) {
        pgByName.set(name, decl)
      }
    }
  }

  for (const graph of ast.workflows) {
    for (const node of graph.nodes) {
      if (node.type !== 'postgres') {
        continue
      }
      out.push(...validatePostgresNode(node, pgByName))
    }
  }

  return out
}
