/**
 * AST types for top-level `agent name { … }` blocks referenced by `type: agent` nodes.
 */

import type { SourceRange } from '../ast'

export interface AgentSandboxDecl {
  /** CPU cores allocated to the sandbox VM. */
  cpus?: number
  cpusRange?: SourceRange
  /** Memory allocated to the sandbox VM in MiB. */
  memoryMiB?: number
  memoryMiBRange?: SourceRange
  /** Persistent disk allocated to the sandbox VM in GiB. */
  diskGiB?: number
  diskGiBRange?: SourceRange
  /** Minutes of SDK inactivity before the sandbox stops (`0` disables). */
  autoStopMinutes?: number
  autoStopMinutesRange?: SourceRange
  /** Minutes before a stopped sandbox is archived (`-1` disables when supported by Daytona). Omit to disable auto-archive in Swirls. */
  autoArchiveMinutes?: number
  autoArchiveMinutesRange?: SourceRange
  /** Minutes before a stopped sandbox is deleted. */
  autoDeleteMinutes?: number
  autoDeleteMinutesRange?: SourceRange
  /** When true, sandbox state is discarded on stop. */
  ephemeral?: boolean
  ephemeralRange?: SourceRange
  range: SourceRange
}

export interface AgentWalletDecl {
  /** USD budget per cadence window. */
  budget?: number
  budgetRange?: SourceRange
  /** Reset window: daily, weekly, or monthly (UTC). */
  cadence?: string
  cadenceRange?: SourceRange
  /** Optional per-call ceiling in USD (maps to Zero maxPay). */
  maxPerCall?: number
  maxPerCallRange?: SourceRange
  range: SourceRange
}

/**
 * Context-engine overrides (RFC 0021). Every knob is optional and every one of
 * them overrides a managed default, so an absent block and an empty block mean
 * the same thing: let the engine decide. Declaring nothing is the expected
 * case; these exist for the deployment that has measured a reason to differ.
 */
export interface AgentContextDecl {
  /** Working-set token cap for a turn (`budget:`); default derives from the model window. */
  budget?: number
  budgetRange?: SourceRange
  /** Fraction of the budget, in (0, 1], at which compaction runs (`compact_at:`). */
  compactAt?: number
  compactAtRange?: SourceRange
  /** Turns kept verbatim on the far side of a compaction checkpoint (`keep_recent_turns:`). */
  keepRecentTurns?: number
  keepRecentTurnsRange?: SourceRange
  /** Tool results older than this many tool uses are pruned to pointers (`prune_tool_results_after:`). */
  pruneToolResultsAfter?: number
  pruneToolResultsAfterRange?: SourceRange
  /** Prompt-cache retention tier: `none`, `short`, or `long` (`cache_retention:`). */
  cacheRetention?: string
  cacheRetentionRange?: SourceRange
  range: SourceRange
}

export interface AgentSuggestionDecl {
  label: string
  labelRange?: SourceRange
  message: string
  messageRange?: SourceRange
  range: SourceRange
}

export interface AgentProfileDecl {
  name: string
  description?: string
  descriptionRange?: SourceRange
  /** Inlined `@ts { … }` body for optional profile system prompt override. */
  systemCode?: string
  systemCodeRange?: SourceRange
  /** Graph names the model may call when using this profile (subset of agent tools). */
  tools?: string[]
  toolsRanges?: SourceRange[]
  /** Skill block names available when using this profile (subset of agent skills). */
  skills?: string[]
  skillsRanges?: SourceRange[]
  /** MCP block names available when using this profile (subset of agent mcp). */
  mcp?: string[]
  mcpRanges?: SourceRange[]
  sandbox?: AgentSandboxDecl
  /**
   * Parsed only so validation can reject it. Profiles cannot name a computer;
   * the agent's `computer:` applies to every profile. Empty string means the
   * key was present without a usable name.
   */
  computer?: string
  computerRange?: SourceRange
  docComment?: string
  range: SourceRange
}

export interface AgentDecl {
  name: string
  label?: string
  description?: string
  /**
   * Model vendor. Omitted `provider:` is `openrouter`
   * (`DEFAULT_AGENT_PROVIDER`). `providerRange` is set only when the field is
   * written with a non-blank value.
   */
  provider: string
  providerRange?: SourceRange
  model: string
  modelRange: SourceRange
  /** Reference to a top-level `secret` block name. */
  secretsRef?: string
  secretsRefRange?: SourceRange
  /** Default system prompt as inlined `@ts { … }`. */
  systemCode?: string
  systemCodeRange?: SourceRange
  temperature?: number
  temperatureRange?: SourceRange
  maxTokens?: number
  maxTokensRange?: SourceRange
  maxSteps?: number
  maxStepsRange?: SourceRange
  /** Graph names exposed as LLM-callable tools. */
  tools?: string[]
  toolsRanges?: SourceRange[]
  /** Top-level skill block names for knowledge skills. */
  skills?: string[]
  skillsRanges?: SourceRange[]
  /** Top-level MCP block names exposed to this agent as tool servers. */
  mcp?: string[]
  mcpRanges?: SourceRange[]
  /** Other agent block names this agent may delegate to as subagents. */
  team?: string[]
  teamRanges?: SourceRange[]
  /** Top-level shared `disk` block names mounted into this agent's sandbox. */
  disks?: string[]
  disksRanges?: SourceRange[]
  /** Source range of the `disks:` list, including an empty `[]`. */
  disksRange?: SourceRange
  /** Optional sandbox resource and lifecycle overrides. Cannot be combined with `computer:`. */
  sandbox?: AgentSandboxDecl
  /**
   * Bare name of one top-level `computer` block whose guest runs this agent's
   * workspace tools. Empty string means the key was present without a usable
   * name. Cannot be combined with `sandbox:` or `disks:`.
   */
  computer?: string
  /** Source range of the computer name (diagnostics and go-to-definition). */
  computerRange?: SourceRange
  /** Optional Zero tool-spend budget (enables zero_search / zero_fetch tools). */
  wallet?: AgentWalletDecl
  /** Optional context-engine overrides (budgets, compaction, pruning, cache retention). */
  context?: AgentContextDecl
  /** Optional starter prompts shown in Cloud agent chat zero state. */
  suggestions?: AgentSuggestionDecl[]
  profiles: AgentProfileDecl[]
  docComment?: string
  range: SourceRange
}
