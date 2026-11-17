/**
 * Validation for `database` and `migration` blocks.
 * Called from the main validator.
 *
 * Note: full Prisma-schema correctness is deliberately NOT checked here. Swirls
 * does not reinterpret the `@prisma` island; the deploy path hands it to
 * Prisma's own validator/migration engine. This layer only checks the Swirls
 * envelope around the schema (names, uniqueness, presence, ordering).
 */

import {
  databaseOperationSchema,
  resourceNameSchema,
} from '@swirls/definition/schemas'
import type {
  ConfigValue,
  Diagnostic,
  NodeDecl,
  SourceRange,
  SwirlsFile,
} from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { DatabaseConnectionDecl, MigrationDecl } from './ast'

const RESERVED_DATABASE_CONNECTION_NAMES = new Set(['owner'])

function isReservedDatabaseConnectionName(name: string): boolean {
  if (RESERVED_DATABASE_CONNECTION_NAMES.has(name)) {
    return true
  }
  return name.startsWith('pg_')
}

function validateDatabaseConnection(
  connection: DatabaseConnectionDecl,
  connectionNames: Set<string>,
): Diagnostic[] {
  const out: Diagnostic[] = []
  out.push(
    ...validateResourceName(
      connection.name,
      connection.range,
      'Database connection',
    ),
  )

  if (isReservedDatabaseConnectionName(connection.name)) {
    out.push(
      diag(
        `Database connection name "${connection.name}" is reserved (cannot use "owner" or names starting with "pg_")`,
        connection.range,
      ),
    )
  }

  if (connectionNames.has(connection.name)) {
    out.push(
      diag(
        `Duplicate database connection name "${connection.name}"`,
        connection.range,
      ),
    )
  }
  connectionNames.add(connection.name)

  return out
}

/** Human-readable operation list for diagnostics. */
const DATABASE_OPERATIONS = databaseOperationSchema.options.join(', ')

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

function tsBlockHasBody(cv: ConfigValue | undefined): boolean {
  if (!cv) {
    return false
  }
  if (cv.kind === 'ts_block') {
    return Boolean(cv.code?.trim())
  }
  if (cv.kind === 'ts_file_ref') {
    return Boolean(cv.path?.trim())
  }
  return false
}

export function validateDatabaseBlocks(
  ast: SwirlsFile,
  _options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.databases ?? []
  const names = new Set<string>()

  for (const r of blocks) {
    out.push(...validateResourceName(r.name, r.range, 'Database block'))

    if (names.has(r.name)) {
      out.push(diag(`Duplicate database block name "${r.name}"`, r.range))
    }
    names.add(r.name)

    // Presence only. Prisma owns model/enum/relation correctness at deploy time.
    if (r.schemaSource.trim().length === 0) {
      out.push(
        diag(
          'Database block requires a non-empty schema: @prisma { } block',
          r.range,
        ),
      )
    }

    const connectionNames = new Set<string>()
    for (const connection of r.connections ?? []) {
      out.push(...validateDatabaseConnection(connection, connectionNames))
    }
  }

  return out
}

function validateMigrationBlock(
  m: MigrationDecl,
  databaseNames: Set<string>,
  orderByDatabase: Map<string, Map<number, MigrationDecl>>,
): Diagnostic[] {
  const out: Diagnostic[] = []

  if (m.database === '') {
    out.push(
      diag(
        `Migration "${m.name}" requires "database" (a database block name)`,
        m.range,
      ),
    )
  } else if (!databaseNames.has(m.database)) {
    out.push(
      diag(
        `Migration "${m.name}" references database "${m.database}" which is not defined`,
        m.databaseRange,
      ),
    )
  }

  if (!Number.isInteger(m.order) || m.order < 0) {
    out.push(
      diag(
        `Migration "${m.name}" requires "order" as a non-negative integer`,
        m.range,
      ),
    )
  } else if (m.database !== '') {
    const byOrder = orderByDatabase.get(m.database) ?? new Map()
    const existing = byOrder.get(m.order)
    if (existing) {
      out.push(
        diag(
          `Migration "${m.name}" reuses order ${m.order} for database "${m.database}" (already used by "${existing.name}")`,
          m.range,
        ),
      )
    } else {
      byOrder.set(m.order, m)
    }
    orderByDatabase.set(m.database, byOrder)
  }

  if (!tsBlockHasBody(m.operation)) {
    out.push(
      diag(
        `Migration "${m.name}" requires "operation" (a non-empty @ts block)`,
        m.operation?.range ?? m.range,
      ),
    )
  }

  return out
}

export function validateMigrationBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const migrations = ast.migrations ?? []
  const databaseNames = nameLookup(
    new Set((ast.databases ?? []).map((d) => d.name)),
    options?.workspace?.databases,
  )

  const names = new Set<string>()
  const orderByDatabase = new Map<string, Map<number, MigrationDecl>>()

  for (const m of migrations) {
    out.push(...validateResourceName(m.name, m.range, 'Migration'))

    if (names.has(m.name)) {
      out.push(diag(`Duplicate migration block name "${m.name}"`, m.range))
    }
    names.add(m.name)

    out.push(...validateMigrationBlock(m, databaseNames, orderByDatabase))
  }

  return out
}

/**
 * `type: database` node governs a mutation over a managed `database` block. Its
 * `database:` ref must resolve to a declared block (local file or workspace),
 * `operation:` must be one of the known operations, `run:` is a required @ts
 * body, and `condition:` (optional) must be a @ts block. Prisma-body
 * correctness stays with the deploy path, like `migration` bodies.
 */
function validateDatabaseNode(
  node: NodeDecl,
  databaseNames: Set<string>,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const cf = node.configFields

  const databaseCv = cf.database
  if (!databaseCv || databaseCv.kind !== 'string') {
    out.push(diag('Database node requires a "database" field', node.range))
  } else if (!databaseNames.has(databaseCv.value)) {
    out.push(
      diag(
        `Database node references database "${databaseCv.value}" which is not defined`,
        databaseCv.range,
      ),
    )
  }

  const operationCv = cf.operation
  if (!operationCv || operationCv.kind !== 'string') {
    out.push(diag('Database node requires an "operation" field', node.range))
  } else if (!databaseOperationSchema.safeParse(operationCv.value).success) {
    out.push(
      diag(
        `Database node "operation" must be one of: ${DATABASE_OPERATIONS}, got "${operationCv.value}"`,
        operationCv.range,
      ),
    )
  }

  const runCv = cf.run
  if (!runCv) {
    out.push(diag('Database node requires a "run" (@ts block)', node.range))
  } else if (runCv.kind !== 'ts_block' && runCv.kind !== 'ts_file_ref') {
    out.push(diag('Database node "run" must be a @ts block', runCv.range))
  } else if (runCv.kind === 'ts_block' && !runCv.code.trim()) {
    out.push(
      diag('Database node "run" must be a non-empty @ts block', runCv.range),
    )
  }

  const conditionCv = cf.condition
  if (conditionCv && conditionCv.kind !== 'ts_block') {
    out.push(
      diag('Database node "condition" must be a @ts block', conditionCv.range),
    )
  }

  return out
}

export function validateDatabaseNodes(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const databaseNames = nameLookup(
    new Set((ast.databases ?? []).map((d) => d.name)),
    options?.workspace?.databases,
  )

  for (const graph of ast.workflows) {
    for (const node of graph.nodes) {
      if (node.type !== 'database') {
        continue
      }
      out.push(...validateDatabaseNode(node, databaseNames))
    }
  }

  return out
}
