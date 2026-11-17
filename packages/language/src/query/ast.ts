import type { ConfigValue, SourceRange } from '../ast'

/** Top-level `query` block: read-only SQL against a managed database. */
export interface QueryDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label: string
  description?: string
  docComment?: string
  enabled?: boolean
  /** Managed database block this query runs against. */
  database: string
  databaseRange?: SourceRange
  /** @sql block body executed at query time. */
  sql?: ConfigValue
  range: SourceRange
}
