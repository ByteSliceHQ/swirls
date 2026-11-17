/**
 * AST types for top-level `action name { … }` blocks.
 *
 * An action declares a typed integration operation: provider, HTTP transport,
 * and optional input/output JSON schemas. Integration nodes reference actions
 * by bare identifier.
 */

import type { JsonBlockInfo, JsonSchemaLiteral, SourceRange } from '../ast'

export const ACTION_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

export type ActionHttpMethod = (typeof ACTION_HTTP_METHODS)[number]

export const ACTION_ENCODINGS = ['json', 'form', 'query', 'raw'] as const

export type ActionEncoding = (typeof ACTION_ENCODINGS)[number]

export interface ActionDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment immediately above this declaration. */
  docComment?: string
  provider: string
  providerRange?: SourceRange
  method: string
  methodRange?: SourceRange
  path: string
  pathRange?: SourceRange
  encoding?: string
  encodingRange?: SourceRange
  scopes?: string[]
  scopesRange?: SourceRange
  input?: JsonSchemaLiteral
  inputBlock?: JsonBlockInfo
  /** `input: schema_name` reference to a top-level `schema` block. */
  inputRef?: string
  inputRefRange?: SourceRange
  output?: JsonSchemaLiteral
  outputBlock?: JsonBlockInfo
  /** `output: schema_name` reference to a top-level `schema` block. */
  outputRef?: string
  outputRefRange?: SourceRange
  /** GraphQL query/mutation document for GraphQL-backed actions. */
  graphqlDocument?: string
  graphqlDocumentRange?: SourceRange
  range: SourceRange
}
