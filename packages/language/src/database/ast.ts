/**
 * AST types for `database` and `migration` blocks and the `@prisma` island.
 * Re-exported from the main ast.ts module.
 */

import type { ConfigValue, SourceRange } from '../ast'

/**
 * Info for the `@prisma { ... }` island (for LSP forwarding into the Prisma
 * schema language). Mirrors {@link import('../ast').JsonBlockInfo} but keeps the
 * Prisma content and its inner range so tooling can hand the exact text to
 * Prisma's own toolchain without re-lexing.
 */
export interface PrismaBlockInfo {
  content: string
  contentRange: SourceRange
}

/**
 * Nested `connection <name> { … }` inside a `database` block. Declares a named
 * connection string Swirls provisions for direct application access.
 */
export interface DatabaseConnectionDecl {
  name: string
  /** Optional human-readable label. */
  label?: string
  /** Optional description. */
  description?: string
  docComment?: string
  range: SourceRange
}

/**
 * Top-level `database` block: a Swirls-managed Postgres whose schema is declared
 * in the Prisma schema language inside an `@prisma` island. Distinct from the
 * `postgres` block, which is a bring-your-own database the customer operates.
 */
export interface DatabaseDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  /** Optional human-readable label. */
  label?: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  /** Raw Prisma schema text from the `schema: @prisma { ... }` island. */
  schemaSource: string
  /** Set when the schema was defined via an `@prisma { }` block (for LSP). */
  schemaBlock?: PrismaBlockInfo
  /** Nested named connections declared inside this database block. */
  connections: DatabaseConnectionDecl[]
  range: SourceRange
}

/**
 * Top-level `migration` block: a data transform a schema diff cannot express,
 * run in `order` against a declared `database` via typed Prisma query-builder
 * code in the `operation` @ts island.
 */
export interface MigrationDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  /** Name of the `database` block this migration targets. */
  database: string
  /** Range of the database name after `database:` (for LSP navigation). */
  databaseRange: SourceRange
  /** Run order within the target database (non-negative integer, unique per database). */
  order: number
  /** @ts island holding the typed Prisma data-migration body (validated after parse). */
  operation?: ConfigValue
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  range: SourceRange
}
