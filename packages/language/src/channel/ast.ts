import type { SourceRange } from '../ast'

/** Supported chat platforms for agent channel bindings. */
export type ChannelPlatform =
  | 'slack'
  | 'linear'
  | 'discord'
  | 'web'
  | 'mcp'
  | 'swirls'

/** Surface-hosted rooms (`platform: swirls`). */
export function isSurfaceChannelPlatform(platform: string): boolean {
  return platform === 'swirls'
}

/** How inbound events are routed to the bound agent. */
export type ChannelMode = 'mention' | 'dm' | 'all' | 'ambient'

export interface ChannelDecl {
  id?: string
  name: string
  label: string
  description?: string
  docComment?: string
  platform: ChannelPlatform
  platformRange?: SourceRange
  agent?: string
  agentRange?: SourceRange
  /** Workflows published as individual tools, only on MCP channels. */
  workflows?: string[]
  workflowsRange?: SourceRange
  workflowsRanges?: SourceRange[]
  enabled?: boolean
  /**
   * Name of a top-level `connection` block supplying the OAuth credential for
   * this channel. When set, the connection's provider must match `platform`.
   * Preferred over the implicit platform→credential mapping; lets a project
   * bind multiple connections of the same provider.
   */
  connection?: string
  connectionRange?: SourceRange
  /**
   * Name of a top-level `connector` block (the Swirls-managed inbound OAuth
   * application) fronting this channel. Required when `platform` is `mcp`,
   * forbidden otherwise. Inbound counterpart to `connection`.
   */
  connector?: string
  connectorRange?: SourceRange
  /**
   * When the bound agent takes a turn. Defaults to `mention`. `dm` is a routing
   * mode on third-party platforms and is rejected for Surface rooms
   * (`platform: swirls`), where direct messages are a surface of the shell
   * rather than a declared channel. `ambient` hands
   * the decision to the context engine's gate and ships for Surface rooms first.
   */
  mode: ChannelMode
  modeRange?: SourceRange
  // Response-policy overrides (RFC 0021). Every knob is optional and every one
  // of them replaces a managed default, so a channel that declares none of them
  // behaves exactly like one written before they existed: the engine decides.
  // Durations are held as the source literal (`"30m"`) so the formatter gives
  // back what the author wrote, and
  // `channelResponsePolicyToDeploymentPayload` normalizes them to whole seconds
  // for the deployment definition.
  /** How long a thread engagement survives without being addressed (`engagement_timeout:`). */
  engagementTimeout?: string
  engagementTimeoutRange?: SourceRange
  /** Minimum quiet period between the agent's posts in this channel (`cooldown:`). */
  cooldown?: string
  cooldownRange?: SourceRange
  /** Ceiling on posts the agent makes without being addressed; `0` silences them entirely. */
  maxUnpromptedPerHour?: number
  maxUnpromptedPerHourRange?: SourceRange
  range: SourceRange
}

export const CHANNEL_PLATFORMS: readonly ChannelPlatform[] = [
  'slack',
  'linear',
  'discord',
  'web',
  'mcp',
  'swirls',
]

export const CHANNEL_MODES: readonly ChannelMode[] = [
  'mention',
  'dm',
  'all',
  'ambient',
]
