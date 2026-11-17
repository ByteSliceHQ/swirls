/**
 * AST types for top-level `operation name { }` blocks, which `type: device`
 * nodes run on enrolled devices. Devices themselves are never declared in
 * source: a machine is enrolled through the API, and a node names it at run
 * time by id or by selector.
 */

import type { JsonSchemaLiteral, SourceRange } from '../ast'
import type { ScriptBlockLang } from '../lexer'

/**
 * The script an operation runs: an inline `@ps { }` or `@sh { }` block, or a
 * `@ps "file.ps1"` or `@sh "file.sh"` reference that is read at deploy.
 */
export interface OperationCommandDecl {
  lang: ScriptBlockLang
  /** The script text. Absent for a file reference that has not been read. */
  script?: string
  /** Path of the script file, relative to the authoring `.swirls` file. */
  path?: string
  range: SourceRange
}

export interface OperationDecl {
  name: string
  nameRange: SourceRange
  label?: string
  description?: string
  /** `windows`, `linux` or `macos`. When set, only those devices run it. */
  platform?: string
  platformRange?: SourceRange
  /** `system` or `signed_in_user`. Defaults to `system`. */
  runAs?: string
  runAsRange?: SourceRange
  /** Seconds the script may run before the daemon stops it. */
  timeout?: number
  timeoutRange?: SourceRange
  inputSchema?: JsonSchemaLiteral
  outputSchema?: JsonSchemaLiteral
  command?: OperationCommandDecl
  docComment?: string
  range: SourceRange
}
