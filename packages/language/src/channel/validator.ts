import { CHANNEL_RESPONSE_POLICY_LIMITS } from '@swirls/definition/deployment-definition'

import type { Diagnostic, SwirlsFile } from '../ast'
import { DURATION_SYNTAX_HINT, parseDurationSeconds } from '../duration'
import { resolveNamedSchemasFromDecls } from '../schema'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import { type ChannelDecl, isSurfaceChannelPlatform } from './ast'

function diag(message: string, range: ChannelDecl['range']): Diagnostic {
  return { message, range, severity: 'error' }
}

/** Every response-policy knob the channel actually declared, with its range. */
function declaredResponsePolicy(ch: ChannelDecl): { key: string; range: ChannelDecl['range'] }[] {
  const declared: { key: string; range: ChannelDecl['range'] }[] = []

  if (ch.engagementTimeout !== undefined) {
    declared.push({
      key: 'engagement_timeout',
      range: ch.engagementTimeoutRange ?? ch.range,
    })
  }

  if (ch.cooldown !== undefined) {
    declared.push({ key: 'cooldown', range: ch.cooldownRange ?? ch.range })
  }

  if (ch.maxUnpromptedPerHour !== undefined) {
    declared.push({
      key: 'max_unprompted_per_hour',
      range: ch.maxUnpromptedPerHourRange ?? ch.range,
    })
  }

  return declared
}

/**
 * Range checks for the response-policy knobs (RFC 0021).
 *
 * Durations arrive as their source literal so the formatter can round-trip what
 * the author wrote; this is where they are held to the grammar and to bounds
 * that catch the unit slip (`"3000m"` for `"30m"`) a raw seconds count would
 * hide.
 */
function validateResponsePolicy(ch: ChannelDecl): Diagnostic[] {
  const out: Diagnostic[] = []
  const label = `Channel "${ch.name}"`

  if (ch.engagementTimeout !== undefined) {
    const seconds = parseDurationSeconds(ch.engagementTimeout)

    if (seconds === null) {
      out.push(
        diag(
          `${label}: engagement_timeout must be ${DURATION_SYNTAX_HINT}`,
          ch.engagementTimeoutRange ?? ch.range,
        ),
      )
    } else if (seconds <= 0) {
      out.push(
        diag(
          `${label}: engagement_timeout must be longer than zero — an engagement that closes immediately is what mode "mention" already does`,
          ch.engagementTimeoutRange ?? ch.range,
        ),
      )
    } else if (seconds > CHANNEL_RESPONSE_POLICY_LIMITS.maxEngagementTimeoutSeconds) {
      out.push(
        diag(
          `${label}: engagement_timeout must be at most "24h"`,
          ch.engagementTimeoutRange ?? ch.range,
        ),
      )
    }
  }

  if (ch.cooldown !== undefined) {
    const seconds = parseDurationSeconds(ch.cooldown)

    if (seconds === null) {
      out.push(
        diag(`${label}: cooldown must be ${DURATION_SYNTAX_HINT}`, ch.cooldownRange ?? ch.range),
      )
    } else if (seconds > CHANNEL_RESPONSE_POLICY_LIMITS.maxCooldownSeconds) {
      out.push(diag(`${label}: cooldown must be at most "24h"`, ch.cooldownRange ?? ch.range))
    }
  }

  if (
    ch.maxUnpromptedPerHour !== undefined &&
    (!Number.isInteger(ch.maxUnpromptedPerHour) || ch.maxUnpromptedPerHour < 0)
  ) {
    out.push(
      diag(
        `${label}: max_unprompted_per_hour must be a whole number of 0 or more, where 0 stops unprompted posts entirely`,
        ch.maxUnpromptedPerHourRange ?? ch.range,
      ),
    )
  }

  return out
}

/**
 * Strip editor-only *Range fields and normalize durations to whole seconds for
 * deployment payloads.
 *
 * A literal that does not parse is dropped rather than guessed at: the
 * validator refuses the deploy before a bundle is built, so the only way to
 * reach this with a bad literal is a programmatically assembled AST, and a
 * silent managed default beats a fabricated timer.
 */
export function channelResponsePolicyToDeploymentPayload(decl: ChannelDecl): {
  engagementTimeoutSeconds?: number
  cooldownSeconds?: number
  maxUnpromptedPerHour?: number
} {
  const engagementTimeoutSeconds =
    decl.engagementTimeout === undefined ? null : parseDurationSeconds(decl.engagementTimeout)

  const cooldownSeconds = decl.cooldown === undefined ? null : parseDurationSeconds(decl.cooldown)

  return {
    ...(engagementTimeoutSeconds !== null ? { engagementTimeoutSeconds } : {}),
    ...(cooldownSeconds !== null ? { cooldownSeconds } : {}),
    ...(decl.maxUnpromptedPerHour !== undefined
      ? { maxUnpromptedPerHour: decl.maxUnpromptedPerHour }
      : {}),
  }
}

export function validateChannelBlocks(
  ast: SwirlsFile,
  opts?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const workspace = opts?.workspace
  const localAgents = new Set((ast.agent ?? []).map((a) => a.name))
  const agentNames = nameLookup(localAgents, workspace?.agent)

  const connectionsByName = new Map((ast.connections ?? []).map((c) => [c.name, c]))

  for (const [name, decl] of workspace?.connectionBlocks ?? []) {
    if (!connectionsByName.has(name)) {
      connectionsByName.set(name, decl)
    }
  }

  const connectorsByName = new Map((ast.connector ?? []).map((c) => [c.name, c]))

  for (const [name, decl] of workspace?.connectorBlocks ?? []) {
    if (!connectorsByName.has(name)) {
      connectorsByName.set(name, decl)
    }
  }

  const localSchemas = resolveNamedSchemasFromDecls(ast.schemas).map
  const enabledChannelNames = new Map<string, ChannelDecl[]>()
  const enabledManagedByPlatformModeAgent = new Map<string, ChannelDecl[]>()

  for (const ch of ast.channels ?? []) {
    if (ch.platform !== 'mcp' && !ch.agent) {
      out.push(
        diag(`Channel "${ch.name}" with platform "${ch.platform}" must declare an agent`, ch.range),
      )
    } else if (ch.agent && !agentNames.has(ch.agent)) {
      out.push(
        diag(
          `Channel "${ch.name}" references unknown agent "${ch.agent}"`,
          ch.agentRange ?? ch.range,
        ),
      )
    }

    // Ambient gating runs inside the portal's own dispatch first (RFC 0021
    // phase 2); the third-party platforms keep their existing routing modes
    // until the gate is wired into each ingress. MCP is left to its own
    // "must not declare a mode" diagnostic below rather than told about a mode
    // it has no use for.
    if (ch.mode === 'ambient' && !isSurfaceChannelPlatform(ch.platform) && ch.platform !== 'mcp') {
      out.push(
        diag(
          `Channel "${ch.name}" with platform "${ch.platform}" does not support mode "ambient" yet — ambient response gating ships for platform "swirls" first; use "mention" (the default) or "all"`,
          ch.modeRange ?? ch.range,
        ),
      )
    }

    out.push(...validateResponsePolicy(ch))

    if (isSurfaceChannelPlatform(ch.platform) && ch.mode === 'dm') {
      out.push(
        diag(
          `Channel "${ch.name}" with platform "${ch.platform}" does not support mode "dm" — use "mention" (the default) or "all"; Surface direct messages come with the shell and are not declared`,
          ch.modeRange ?? ch.range,
        ),
      )
    }

    if (ch.platform === 'mcp') {
      if (!ch.agent && !ch.workflows?.length) {
        out.push(
          diag(`Channel "${ch.name}" must declare an agent or non-empty workflows`, ch.range),
        )
      }

      const seen = new Set<string>()

      for (const name of ch.workflows ?? []) {
        const at = ch.workflowsRange ?? ch.range

        if (seen.has(name)) {
          out.push(diag(`Channel "${ch.name}" repeats workflow "${name}"`, at))
        }

        seen.add(name)

        if (['send_message', 'get_execution'].includes(name)) {
          out.push(diag(`Workflow "${name}" conflicts with a reserved MCP tool name`, at))
        }

        const workflow =
          ast.workflows.find((w) => w.name === name) ?? workspace?.workflowBlocks.get(name)

        if (!workflow) {
          out.push(diag(`Channel "${ch.name}" references unknown workflow "${name}"`, at))
          continue
        }

        if (!workflow.description?.trim()) {
          out.push(diag(`MCP workflow "${name}" requires a description`, at))
        }

        const root = workflow.nodes.find((n) => n.isRoot)

        const schema =
          root?.inputSchema ??
          (root?.inputSchemaRef
            ? (localSchemas.get(root.inputSchemaRef) ??
              workspace?.schemaLiterals.get(root.inputSchemaRef))
            : undefined)

        if (!schema || schema.type !== 'object') {
          out.push(
            diag(`MCP workflow "${name}" requires an object inputSchema on its root node`, at),
          )
        }
      }

      // (a) MCP channels expose an agent as an inbound MCP server: they must
      // name the Swirls-managed OAuth application via `connector:`, and must
      // not carry an outbound `connection:` or a routing `mode:` (both
      // meaningless for MCP).
      if (ch.connector === undefined) {
        out.push(
          diag(`Channel "${ch.name}" with platform "mcp" must declare a connector`, ch.range),
        )
      } else if (!connectorsByName.has(ch.connector)) {
        // (c) `connector:` must reference a declared connector block.
        out.push(
          diag(
            `Channel "${ch.name}" references unknown connector "${ch.connector}"`,
            ch.connectorRange ?? ch.range,
          ),
        )
      }

      if (ch.connection !== undefined) {
        out.push(
          diag(
            `Channel "${ch.name}" with platform "mcp" must not declare a connection; use "connector:" for the inbound OAuth application`,
            ch.connectionRange ?? ch.range,
          ),
        )
      }

      if (ch.modeRange !== undefined) {
        out.push(
          diag(`Channel "${ch.name}" with platform "mcp" must not declare a mode`, ch.modeRange),
        )
      }

      // Response policy governs when an agent chooses to speak in a room it
      // shares with people. An MCP channel answers the request it was called
      // with, so every one of these knobs would silently do nothing.
      for (const declared of declaredResponsePolicy(ch)) {
        out.push(
          diag(
            `Channel "${ch.name}" with platform "mcp" must not declare "${declared.key}"; response policy applies where the agent shares a room with people`,
            declared.range,
          ),
        )
      }
    } else {
      if (ch.workflows !== undefined) {
        out.push(
          diag(
            `Channel "${ch.name}" workflows are only valid for platform "mcp"`,
            ch.workflowsRange ?? ch.range,
          ),
        )
      }

      // (b) `connector:` is inbound-OAuth only, valid solely on MCP channels.
      if (ch.connector !== undefined) {
        out.push(
          diag(
            `Channel "${ch.name}" "connector:" is only valid for platform "mcp"`,
            ch.connectorRange ?? ch.range,
          ),
        )
      }

      // (d) Outbound connection provider-match check for non-MCP platforms.
      if (ch.connection !== undefined) {
        const conn = connectionsByName.get(ch.connection)

        if (!conn) {
          out.push(
            diag(
              `Channel "${ch.name}" references unknown connection "${ch.connection}"`,
              ch.connectionRange ?? ch.range,
            ),
          )
        } else if (conn.provider && conn.provider !== ch.platform) {
          out.push(
            diag(
              `Channel "${ch.name}" connection "${ch.connection}" provider "${conn.provider}" must match platform "${ch.platform}"`,
              ch.connectionRange ?? ch.range,
            ),
          )
        }
      }
    }

    if (ch.enabled !== false) {
      // Web chat widgets and portal rooms are addressed by channel name (the
      // portal keys its shared session on `channel:<name>`), so several of them
      // may front the same agent. Every other platform routes inbound events by
      // platform, mode, and agent, where a second binding would double-deliver.
      if (ch.platform === 'mcp' || ch.platform === 'web' || isSurfaceChannelPlatform(ch.platform)) {
        const list = enabledChannelNames.get(ch.name) ?? []
        list.push(ch)
        enabledChannelNames.set(ch.name, list)
      } else {
        const key = `${ch.platform}:${ch.mode ?? 'mention'}:${ch.agent}`
        const list = enabledManagedByPlatformModeAgent.get(key) ?? []
        list.push(ch)
        enabledManagedByPlatformModeAgent.set(key, list)
      }
    }
  }

  for (const [name, list] of enabledChannelNames) {
    if (list.length > 1) {
      for (const ch of list) {
        out.push(
          diag(
            `Duplicate channel name: multiple enabled channels named "${name}" (including "${ch.name}")`,
            ch.range,
          ),
        )
      }
    }
  }

  for (const [key, list] of enabledManagedByPlatformModeAgent) {
    if (list.length > 1) {
      for (const ch of list) {
        out.push(
          diag(
            `Duplicate channel routing: multiple enabled bindings for ${key} (including "${ch.name}")`,
            ch.range,
          ),
        )
      }
    }
  }

  return out
}
