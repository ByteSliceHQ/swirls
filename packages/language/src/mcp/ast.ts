/**
 * AST types for top-level `mcp name { … }` blocks referenced by `agent.mcp:`.
 *
 * An `mcp` block is a named, project-scoped MCP server slot. The DSL declares
 * the slot handle, display metadata, remote server URL, and how credentials are
 * obtained (`auth: static` | `auth: interactive`). Secrets never live in git.
 */

import type { SourceRange } from '../ast'

/** How Cloud obtains credentials for this MCP slot. */
export type McpAuthMode = 'static' | 'interactive'

export interface McpDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  /** Optional human-facing label. */
  label?: string
  labelRange?: SourceRange
  /** Optional description of what the server exposes. */
  description?: string
  descriptionRange?: SourceRange
  /** Required remote MCP server URL (https). */
  url: string
  urlRange?: SourceRange
  /**
   * Credential acquisition. Required by doctor for new authoring; may be
   * absent on legacy AST fixtures until updated.
   */
  auth?: McpAuthMode
  authRange?: SourceRange
  /** Optional private connectivity realm used to dial this MCP server. */
  networkRef?: string
  networkRefRange?: SourceRange
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  range: SourceRange
}

export function isStaticMcpAuth(auth: McpAuthMode | undefined): boolean {
  return auth == null || auth === 'static'
}

export function isInteractiveMcpAuth(auth: McpAuthMode | undefined): boolean {
  return auth === 'interactive'
}
