/**
 * What the embedding runtime tells the language about itself.
 *
 * The language knows the syntax and the rules that hold for every runtime. Two
 * things are the runtime's to decide, so they come in through this interface
 * instead of being compiled into the package:
 *
 * - which integration providers it can broker a connection to, and
 * - how to check the body of an `@openui { … }` block.
 *
 * With no host, both checks are skipped: a provider only has to be a
 * well-formed key, and an `@openui` body only has to be non-empty.
 */
export interface LanguageHost {
  readonly providers?: ProviderCatalog
  readonly openui?: OpenUiSupport
}

/** The integration providers a runtime supports. */
export interface ProviderCatalog {
  has(provider: string): boolean
}

/** Resource names an `@openui` artifact binds to, by kind. */
export interface OpenUiBindings {
  readonly agents: readonly string[]
  readonly channels: readonly string[]
  readonly workflows: readonly string[]
  readonly views: readonly string[]
  readonly streams: readonly string[]
  readonly datastores: readonly string[]
  readonly queries: readonly string[]
  readonly disks: readonly string[]
}

/** Resource names in scope for an `@openui` artifact, by kind. */
export interface OpenUiExpose {
  readonly agents: readonly string[]
  readonly channels: readonly string[]
  readonly workflows: readonly string[]
  readonly views: readonly string[]
  readonly streams: readonly string[]
  readonly databases: readonly string[]
  readonly postgres: readonly string[]
  readonly queries: readonly string[]
  readonly disks: readonly string[]
}

export type OpenUiValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] }

/** Parses and checks the body of an `@openui { … }` block. */
export interface OpenUiSupport {
  extractBindings(source: string): OpenUiBindings
  validate(
    source: string,
    options: { readonly expose: OpenUiExpose },
  ): OpenUiValidationResult
}

/** Shape every provider key must have, whatever the runtime's catalog holds. */
export const PROVIDER_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/

export function isProviderKey(key: string): boolean {
  return PROVIDER_KEY_PATTERN.test(key)
}
