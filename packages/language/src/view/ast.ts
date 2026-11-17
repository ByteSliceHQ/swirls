/**
 * AST types for view blocks.
 * Re-exported from the main ast.ts module.
 */

import type { ConfigValue, JsonBlockInfo, JsonSchemaLiteral, SourceRange } from '../ast'

/** One stream reference in `streams: [a, b]`. */
export interface ViewStreamRef {
  name: string
  range: SourceRange
}

/**
 * One computed column under `computed { <name> { graph, input, output? } }`.
 * Each row of the view runs `graph` with the value produced by `input`
 * (a @ts mapping over the row), and the cell value is the graph output,
 * optionally reshaped by `output`.
 */
export interface ViewComputedColumnDecl {
  name: string
  range: SourceRange
  /** Name of the workflow (graph) executed to compute this column. */
  workflowName: string
  /** Range of the workflow name in `graph: name` (for LSP navigation). */
  workflowNameRange?: SourceRange
  /** @ts block mapping the view row into the graph's trigger input (required; validated after parse). */
  input?: ConfigValue
  /** Optional @ts block mapping the graph output into the cell value. */
  output?: ConfigValue
}

/** Top-level `view` block: a spreadsheet-like composition of stream rows (name matches DSL identifier). */
export interface ViewDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  enabled?: boolean
  /** Streams composed by this view, exposed as `context.streams.<name>` in `columns`. */
  streams: ViewStreamRef[]
  /** JSON Schema describing the mapped (non-computed) row shape. */
  schema?: JsonSchemaLiteral
  /** Set when schema was defined via @json { } block (for LSP). */
  schemaBlock?: JsonBlockInfo
  /** `schema: some_name` reference to a top-level `schema` block. */
  schemaRef?: string
  schemaRefRange?: SourceRange
  /** @ts block mapping stream rows into the row shape (required; validated after parse). */
  columns?: ConfigValue
  /** Computed columns executed via graphs. */
  computed: ViewComputedColumnDecl[]
  range: SourceRange
}
