/**
 * AST types for stream blocks.
 * Re-exported from the main ast.ts module.
 */

import type {
  ConfigValue,
  JsonBlockInfo,
  JsonSchemaLiteral,
  SourceRange,
} from '../ast'

/** One version entry under `versions { vN { ... } }`. */
export interface StreamVersionDecl {
  /** Matches {@link STREAM_VERSION_ID_PATTERN}, e.g. `v1`. */
  key: string
  range: SourceRange
  schema?: JsonSchemaLiteral
  /** Set when schema was defined via @json { } block (for LSP). */
  schemaBlock?: JsonBlockInfo
  /** `schema: some_name` reference to a top-level `schema` block. */
  schemaRef?: string
  schemaRefRange?: SourceRange
  /** Optional @ts predicate: return true to persist this execution's output. */
  condition?: ConfigValue
  /** @ts block that maps execution output into the schema shape (required; validated after parse). */
  prepare?: ConfigValue
}

/** Top-level `stream` block: persisted output mapping for a graph (name matches DSL identifier). */
export interface StreamDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  enabled?: boolean
  /**
   * Active writer version (`v1`, `v2`, …). Rows are written using `versions[this]`.
   * Must match a key in {@link StreamDecl.versions}.
   */
  version: string
  /** Range of the `version:` value token (for tooling). */
  versionRange?: SourceRange
  /** Per-version schema, condition, and prepare definitions. */
  versions: StreamVersionDecl[]
  /** Name of the workflow whose output this stream captures (same file). */
  workflowName: string
  /** Range of the workflow name in `workflow: name` (for LSP navigation). */
  workflowNameRange?: SourceRange
  range: SourceRange
}
