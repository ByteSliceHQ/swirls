/**
 * Validation for `mcp` blocks and `agent.mcp:` references.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'
import type { AgentDecl, AgentProfileDecl } from '../agent/ast'
import type { Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type { McpDecl } from './ast'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(
  name: string,
  range: SourceRange,
  kind: string,
): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)
  if (result.success) {
    return []
  }
  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

function validateMcpUrl(url: string, range: SourceRange): Diagnostic[] {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      return [diag('MCP block url must be an https URL', range)]
    }
  } catch {
    return [diag('MCP block url must be a valid absolute https URL', range)]
  }
  return []
}

/**
 * Validates `mcp` blocks: handle format and unique names. Reference resolution
 * (agents pointing at an `mcp` block) is handled by {@link validateAgentMcpRefs}.
 */
export function validateMcpBlocks(
  ast: SwirlsFile,
  _options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.mcp ?? []
  const names = new Set<string>()

  for (const m of blocks) {
    out.push(...validateResourceName(m.name, m.range, 'MCP block'))

    if (names.has(m.name)) {
      out.push(diag(`Duplicate mcp block name "${m.name}"`, m.range))
    }
    names.add(m.name)

    const trimmedUrl = m.url?.trim() ?? ''
    if (trimmedUrl.length === 0) {
      out.push(
        diag(
          `MCP block "${m.name}" requires "url" (quoted https server URL)`,
          m.urlRange ?? m.range,
        ),
      )
    } else {
      out.push(...validateMcpUrl(trimmedUrl, m.urlRange ?? m.range))
    }

    if (m.auth == null) {
      out.push(
        diag(
          `MCP block "${m.name}" requires "auth: static" or "auth: interactive"`,
          m.authRange ?? m.range,
        ),
      )
    } else if (m.auth !== 'static' && m.auth !== 'interactive') {
      out.push(
        diag(
          `MCP block "${m.name}" auth must be "static" or "interactive"`,
          m.authRange ?? m.range,
        ),
      )
    }
  }

  return out
}

function mcpBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, McpDecl> {
  const m = new Map<string, McpDecl>()
  for (const decl of ast.mcp ?? []) {
    m.set(decl.name, decl)
  }
  if (workspace?.mcpBlocks) {
    for (const [name, decl] of workspace.mcpBlocks) {
      m.set(name, decl)
    }
  }
  return m
}

export function validateAgentMcpRefs(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const mcpByName = mcpBlockMap(ast, options?.workspace)

  function validateMcpList(
    mcpNames: string[] | undefined,
    ranges: SourceRange[] | undefined,
    at: SourceRange,
    context: string,
  ) {
    for (let i = 0; i < (mcpNames ?? []).length; i++) {
      const mcpName = mcpNames![i]!
      const listRange = ranges?.[i] ?? at
      if (!mcpByName.has(mcpName)) {
        out.push(
          diag(
            `${context} references undefined mcp block "${mcpName}"`,
            listRange,
          ),
        )
      }
    }
  }

  function validateProfileMcp(agent: AgentDecl, profile: AgentProfileDecl) {
    const agentMcpSet = new Set(agent.mcp ?? [])
    for (let i = 0; i < (profile.mcp ?? []).length; i++) {
      const mcpName = profile.mcp![i]!
      const listRange = profile.mcpRanges?.[i] ?? profile.range
      if (!agentMcpSet.has(mcpName)) {
        out.push(
          diag(
            `Profile "${profile.name}" mcp "${mcpName}" is not listed on agent "${agent.name}" mcp:`,
            listRange,
          ),
        )
      }
    }
  }

  for (const a of ast.agent ?? []) {
    validateMcpList(a.mcp, a.mcpRanges, a.range, `Agent "${a.name}"`)
    for (const profile of a.profiles ?? []) {
      validateProfileMcp(a, profile)
    }
  }

  return out
}
