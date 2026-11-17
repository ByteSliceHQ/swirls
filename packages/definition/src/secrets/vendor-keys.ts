/**
 * Well-known vendor API key names used by ai / email / scrape / search / parallel /
 * agent / disk nodes. Declared in DSL `secret` blocks (optionally `type: managed`).
 */

export const OPENROUTER_API_KEY = 'OPENROUTER_API_KEY'
export const ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY'
export const OPENAI_API_KEY = 'OPENAI_API_KEY'
export const GOOGLE_GENERATIVE_AI_API_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY'
export const RESEND_API_KEY = 'RESEND_API_KEY'
export const FIRECRAWL_API_KEY = 'FIRECRAWL_API_KEY'
export const TELEM_API_KEY = 'TELEM_API_KEY'
export const PARALLEL_API_KEY = 'PARALLEL_API_KEY'
export const TYPESAFE_API_KEY = 'TYPESAFE_API_KEY'
/** Platform-only (Archil); never declared in DSL / never asked of users. */
export const ARCHIL_API_KEY = 'ARCHIL_API_KEY'

/**
 * Vendor keys that may appear in a `secret … { type: managed }` block.
 * Excludes platform-only keys like {@link ARCHIL_API_KEY}.
 */
export const MANAGEABLE_VENDOR_KEYS = [
  OPENROUTER_API_KEY,
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY,
  RESEND_API_KEY,
  FIRECRAWL_API_KEY,
  TELEM_API_KEY,
  PARALLEL_API_KEY,
  TYPESAFE_API_KEY,
] as const

export type ManageableVendorKey = (typeof MANAGEABLE_VENDOR_KEYS)[number]

export const MANAGEABLE_VENDOR_KEY_SET: ReadonlySet<string> = new Set(
  MANAGEABLE_VENDOR_KEYS,
)

/**
 * Every platform vendor key name the engine knows about (manageable + platform-only).
 * Hosts iterate this to build `platformSecrets` from operator env.
 */
export const PLATFORM_VENDOR_KEYS = [
  ...MANAGEABLE_VENDOR_KEYS,
  ARCHIL_API_KEY,
] as const

export type PlatformVendorKey = (typeof PLATFORM_VENDOR_KEYS)[number]

/** Bare env keys for LM providers (`type: ai` / `type: agent`). */
export const AI_LLM_PLATFORM_VENDOR_KEYS = [
  OPENROUTER_API_KEY,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY,
] as const

export type AiProviderName = 'openrouter' | 'anthropic' | 'openai' | 'google'

/** Platform-env/vault key name backing the inferred default for each AI `provider`. */
export function platformVendorKeyForAiProvider(
  provider: AiProviderName,
): ManageableVendorKey {
  switch (provider) {
    case 'openrouter':
      return OPENROUTER_API_KEY
    case 'anthropic':
      return ANTHROPIC_API_KEY
    case 'openai':
      return OPENAI_API_KEY
    case 'google':
      return GOOGLE_GENERATIVE_AI_API_KEY
    default: {
      const _exhaustive: never = provider
      return _exhaustive
    }
  }
}

/**
 * Inferred platform vendor key for a node type, if it implies one the user must
 * declare in a `secret` block. Returns `null` for types that do not need a
 * user/managed vendor key (e.g. `disk` uses platform-only Archil).
 */
export function getInferredVendorKeyForNode(node: {
  type: string
  /** Used for `ai` nodes to infer which platform vendor key applies. */
  config?: unknown
}): ManageableVendorKey | null {
  switch (node.type) {
    case 'scrape':
      return FIRECRAWL_API_KEY
    case 'search':
      if (
        node.config != null &&
        typeof node.config === 'object' &&
        'provider' in node.config &&
        node.config.provider === 'telem'
      ) {
        return TELEM_API_KEY
      }
      return FIRECRAWL_API_KEY
    case 'parallel':
      return PARALLEL_API_KEY
    case 'email':
      return RESEND_API_KEY
    case 'ai': {
      const provider = parseAiProviderFromConfig(node.config)
      return platformVendorKeyForAiProvider(provider)
    }
    default:
      return null
  }
}

/**
 * Canonical AI provider parse for node/agent config. Defaults to `openrouter`
 * when omitted or unrecognized. Prefer this over ad-hoc string checks.
 */
export function parseAiProviderFromConfig(config: unknown): AiProviderName {
  if (
    config != null &&
    typeof config === 'object' &&
    'provider' in config &&
    typeof (config as { provider: unknown }).provider === 'string'
  ) {
    const p = (config as { provider: string }).provider
    if (
      p === 'openrouter' ||
      p === 'anthropic' ||
      p === 'openai' ||
      p === 'google'
    ) {
      return p
    }
  }
  return 'openrouter'
}

/** DSL secret block `type` field. Omit / undefined = user-provided values. */
export type SecretBlockType = 'managed'

export const SECRET_BLOCK_TYPES = ['managed'] as const
