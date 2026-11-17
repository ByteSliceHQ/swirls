/**
 * The platform catalog of coding harnesses a `computer` block may declare with
 * `harness: { type, provider }`. The parser, validator, LSP, doctor, and deploy
 * recipe all read these lists, so adding a provider happens here once.
 */

/** Kinds of harness. `coding` is the only kind today. */
export const HARNESS_TYPES = ['coding'] as const

export type HarnessType = (typeof HARNESS_TYPES)[number]

/** Harness providers Swirls can deliver into a computer guest. */
export const HARNESS_PROVIDERS = ['claude', 'codex', 'pi', 'hermes'] as const

export type HarnessProvider = (typeof HARNESS_PROVIDERS)[number]

/**
 * The Flox catalog package each provider ships as. A computer that declares a
 * harness must not also pin this package in `software:`, because Swirls owns
 * the harness version.
 */
export const HARNESS_PROVIDER_PACKAGES: Readonly<
  Record<HarnessProvider, string>
> = {
  claude: 'claude-code',
  codex: 'codex',
  pi: 'pi-coding-agent',
  hermes: 'hermes-agent',
}

/** One-line descriptions for editor hover and completion details. */
export const HARNESS_PROVIDER_DESCRIPTIONS: Readonly<
  Record<HarnessProvider, string>
> = {
  claude: 'Claude Code, run as `claude -p` with permissions skipped',
  codex: 'OpenAI Codex CLI, run as `codex exec` with its inner sandbox off',
  pi: 'Pi coding agent, run as `pi --print`',
  hermes: 'Hermes agent, run as `hermes -z` in YOLO mode',
}

/** One-line descriptions for each harness type. */
export const HARNESS_TYPE_DESCRIPTIONS: Readonly<Record<HarnessType, string>> =
  {
    coding: 'A coding agent CLI on the guest PATH, driven by a shell node',
  }

/** Narrow an authored string to a catalog harness type. */
export function isHarnessType(value: string): value is HarnessType {
  return HARNESS_TYPES.some((type) => type === value)
}

/** Narrow an authored string to a catalog harness provider. */
export function isHarnessProvider(value: string): value is HarnessProvider {
  return HARNESS_PROVIDERS.some((provider) => provider === value)
}
