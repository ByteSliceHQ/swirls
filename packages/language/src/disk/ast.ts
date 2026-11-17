/**
 * AST types for top-level `disk name { }` blocks referenced by `type: disk` nodes.
 * Archil disk IDs are provisioned by the platform at deploy time — not authored in DSL.
 */

import type { SourceRange } from '../ast'

export interface DiskDecl {
  name: string
  label?: string
  region?: string
  regionRange?: SourceRange
  docComment?: string
  range: SourceRange
}
