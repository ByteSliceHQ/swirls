import { z } from 'zod'

/**
 * Shared contracts for managed `database` blocks (RFC 0013). These live in
 * `@swirls/definition` because the same shapes are referenced across the API, the
 * executor, the contract, the CLI, the cloud UI, platform-db, and temporal, and
 * they must stay byte-identical everywhere.
 */

/**
 * Lifecycle states of a managed database's post-deploy migration, in order:
 * `pending` (not yet run) → `in_progress` (converging now) → terminal `applied`
 * / `gated` (held for approval on a destructive or data-transform diff) /
 * `failed`.
 */
export const MANAGED_DATABASE_MIGRATION_STATUSES = [
  'pending',
  'in_progress',
  'applied',
  'gated',
  'failed',
] as const

export const managedDatabaseMigrationStatusSchema = z.enum(
  MANAGED_DATABASE_MIGRATION_STATUSES,
)

export type ManagedDatabaseMigrationStatus = z.infer<
  typeof managedDatabaseMigrationStatusSchema
>

/**
 * Decrypted `enc_connection` payload for a managed database. `directUrl` is
 * always present; `pooledUrl` is optional because not every provider exposes a
 * pooled endpoint. This is the single parser both the API and the executor use
 * after decrypting the Anvil ciphertext.
 */
export const managedDatabaseConnectionPayloadSchema = z.object({
  directUrl: z.string().min(1),
  pooledUrl: z.string().min(1).optional(),
})

export type ManagedDatabaseConnectionPayload = z.infer<
  typeof managedDatabaseConnectionPayloadSchema
>

export const MANAGED_DATABASE_CONNECTION_SYNC_STATUSES = [
  'pending',
  'synced',
  'failed',
] as const

export const managedDatabaseConnectionSyncStatusSchema = z.enum(
  MANAGED_DATABASE_CONNECTION_SYNC_STATUSES,
)

export type ManagedDatabaseConnectionSyncStatus = z.infer<
  typeof managedDatabaseConnectionSyncStatusSchema
>

export const managedDatabaseConnectionSyncStateSchema = z.object({
  status: managedDatabaseConnectionSyncStatusSchema,
  error: z.string().optional(),
  syncedAt: z.string().optional(),
})

export type ManagedDatabaseConnectionSyncState = z.infer<
  typeof managedDatabaseConnectionSyncStateSchema
>

/**
 * Fixed datasource + generator header prepended to a models-only `@prisma`
 * island so Prisma's validator / DMMF builder has the context it needs. The
 * `@prisma` island in a `.swirls` file carries no datasource/generator (those
 * live in Swirls' provisioning), and managed databases are always Prisma
 * Postgres. This header is never persisted or deployed; it exists only to
 * satisfy Prisma's toolchain.
 *
 * The executor's client-generation path builds a generate-specific variant of
 * this header (with `output`/`runtime`/`moduleFormat`) in
 * `apps/executor/src/managed-db/schema-header.ts`; only this validation header
 * is shared.
 */
export const PRISMA_SCHEMA_HEADER =
  'datasource db {\n  provider = "postgresql"\n}\n\n' +
  'generator client {\n  provider = "prisma-client"\n}\n\n'

/**
 * Prisma actions each governed `database` node `operation` may reach (RFC 0013,
 * "operation mints a capability-narrowed client"). This is the single source of
 * truth for the capability boundary: the executor enforces it host-side on the
 * sandbox bridge, the LSP mirrors it as per-operation type views on
 * `context.db`, and future Access policies key grants off the same map.
 */
const QUERY_ACTIONS = [
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
] as const

const INSERT_ACTIONS = ['create', 'createMany', 'createManyAndReturn'] as const

const UPDATE_ACTIONS = [
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
] as const

const DELETE_ACTIONS = ['delete', 'deleteMany'] as const

/**
 * `transaction` spans every operation class: its body runs inside one
 * interactive transaction and may mix reads, inserts, updates, and deletes.
 */
const TRANSACTION_ACTIONS = [
  ...QUERY_ACTIONS,
  ...INSERT_ACTIONS,
  ...UPDATE_ACTIONS,
  ...DELETE_ACTIONS,
] as const

/**
 * Map from a `database` node's declared `operation` to the Prisma actions the
 * narrowed client exposes. Shared by the executor bridge (runtime refusal), the
 * LSP (compile-time narrowing), and Access policies.
 */
export const DATABASE_OPERATION_ACTIONS = {
  query: QUERY_ACTIONS,
  insert: INSERT_ACTIONS,
  update: UPDATE_ACTIONS,
  delete: DELETE_ACTIONS,
  transaction: TRANSACTION_ACTIONS,
} as const
