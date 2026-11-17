/**
 * AST types for postgres blocks and type: postgres nodes.
 * Re-exported from the main ast.ts module.
 */

import type { JsonBlockInfo, JsonSchemaLiteral, SourceRange } from '../ast'

export interface TsBlock {
  code: string
  range: SourceRange
  innerRange: SourceRange
  sourcePath?: string
  sourcePathRange?: SourceRange
}

export interface SqlBlock {
  code: string
  range: SourceRange
  innerRange: SourceRange
}

export interface PostgresTableDecl {
  name: string
  schema: JsonSchemaLiteral
  schemaBlock?: JsonBlockInfo
  range: SourceRange
}

export interface PostgresDecl {
  name: string
  /** Reference to a top-level `secret` block name (like auth blocks). */
  secretsRef?: string
  /** Range of the secret block identifier after `secrets:` (for LSP navigation). */
  secretsRefRange?: SourceRange
  /** Connection credential value (secret var name or literal string). */
  connection: string
  /** True when connection was a quoted string literal (not a secret reference). */
  connectionIsLiteral: boolean
  connectionRange: SourceRange
  /** Optional private connectivity realm used to dial this database. */
  networkRef?: string
  networkRefRange?: SourceRange
  tables: PostgresTableDecl[]
  docComment?: string
  /** Optional human-readable label. */
  label?: string
  range: SourceRange
}
