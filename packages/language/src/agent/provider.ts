/** Spec default when an agent block omits `provider:`. */
export const DEFAULT_AGENT_PROVIDER = 'openrouter'

/**
 * Blank `provider` (omitted or whitespace) is the documented OpenRouter default.
 * An explicit vendor is returned trimmed.
 */
export function resolveAgentProvider(provider: string | undefined): string {
  const trimmed = provider?.trim() ?? ''
  return trimmed === '' ? DEFAULT_AGENT_PROVIDER : trimmed
}
