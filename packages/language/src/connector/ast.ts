/**
 * AST types for top-level `connector name { … }` blocks referenced by
 * `channel.connector:`.
 *
 * A `connector` block is a named, project-scoped inbound OAuth application slot:
 * the Swirls-managed OAuth application external MCP clients (ChatGPT, Claude
 * Desktop, Claude Code) authenticate against. The DSL declares the slot by
 * handle and carries only display metadata (label, description); the OAuth
 * application and per-end-client credentials are provisioned in Cloud later. No
 * secrets live in the file.
 *
 * This is the inbound counterpart to `connection`, which is outbound OAuth to a
 * third party. `platform: mcp` channels reference a connector by name via a
 * `connector:` field.
 */

import type { SourceRange } from '../ast'

export interface ConnectorDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  /** Optional human-facing label; the MCP server's advertised identity. */
  label?: string
  labelRange?: SourceRange
  /** Optional description of the connector application. */
  description?: string
  descriptionRange?: SourceRange
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  range: SourceRange
}
