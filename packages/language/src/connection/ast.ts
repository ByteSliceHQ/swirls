/**
 * AST types for top-level `connection name { … }` blocks.
 *
 * A connection is a named, project-scoped credential slot for outbound API
 * calls. Two modes:
 *
 * - **Managed** — `provider` is in the Swirls integration catalog. A human
 *   authorizes the grant in the project's Connections UI; Swirls brokers a
 *   short-lived token at execution time. No credentials live in the file.
 * - **Self-managed** — `base_url:` and `auth:` are set together. Credentials
 *   come from the referenced auth block (and its secret block) in the project
 *   vault; the runtime calls `base_url` + action path with the resolved
 *   profile. No Fabric binding or catalog entry is required.
 *
 * Nodes, channels, and agents reference a connection by name via a
 * `connection:` field. Actions stay credential-free and match the connection
 * by `provider`.
 */

import { isSelfManagedConnectionBlock } from '@swirls/definition/connection-mode'

import type { SourceRange } from '../ast'

export { isSelfManagedConnectionBlock as isSelfManagedConnection }

/**
 * Provider key a `connection` block declares. The language only requires a
 * well-formed key; which providers exist is the runtime's catalog, supplied
 * through `LanguageHost.providers`.
 */
export type ConnectionProvider = string

export interface ConnectionDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  provider: string
  providerRange?: SourceRange
  /**
   * Self-managed mode: absolute API origin (e.g. `https://api.example.com`).
   * Must be set together with `authRef`.
   */
  baseUrl?: string
  baseUrlRange?: SourceRange
  /**
   * Self-managed mode: bare identifier naming a top-level `auth` block.
   * Must be set together with `baseUrl`.
   */
  authRef?: string
  authRefRange?: SourceRange
  /** Optional private connectivity realm used to dial this self-managed origin. */
  networkRef?: string
  networkRefRange?: SourceRange
  range: SourceRange
}
