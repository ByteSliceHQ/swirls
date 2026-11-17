/**
 * Validation for `agent` blocks and `type: agent` nodes.
 */

import { AGENT_SUGGESTION_LIMITS } from '@swirls/definition/deployment-definition'
import { aiProviderSchema, resourceNameSchema } from '@swirls/definition/schemas'
import type {
  Diagnostic,
  JsonSchemaLiteral,
  NodeDecl,
  SourceRange,
  SwirlsFile,
  WorkflowDecl,
} from '../ast'
import type { ComputerDecl } from '../computer/ast'
import type { DiskDecl } from '../disk/ast'
import { resolveNamedSchemasFromDecls } from '../schema'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type {
  AgentContextDecl,
  AgentDecl,
  AgentSandboxDecl,
  AgentSuggestionDecl,
  AgentWalletDecl,
} from './ast'
import { DEFAULT_AGENT_PROVIDER, resolveAgentProvider } from './provider'

/** Provider API key var names mirrored from engine/secrets-context. */
const PROVIDER_EXPECTED_VARS: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY'],
}

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateSandboxDecl(
  decl: AgentSandboxDecl,
  label: string,
): Diagnostic[] {
  const out: Diagnostic[] = []
  if (decl.cpus !== undefined && decl.cpus < 1) {
    out.push(
      diag(
        `${label}: sandbox.cpus must be at least 1`,
        decl.cpusRange ?? decl.range,
      ),
    )
  }
  if (decl.memoryMiB !== undefined && decl.memoryMiB < 128) {
    out.push(
      diag(
        `${label}: sandbox.memoryMiB must be at least 128`,
        decl.memoryMiBRange ?? decl.range,
      ),
    )
  }
  if (decl.diskGiB !== undefined && decl.diskGiB < 1) {
    out.push(
      diag(
        `${label}: sandbox.diskGiB must be at least 1`,
        decl.diskGiBRange ?? decl.range,
      ),
    )
  }
  for (const [field, value, range] of [
    ['autoStopMinutes', decl.autoStopMinutes, decl.autoStopMinutesRange],
    [
      'autoArchiveMinutes',
      decl.autoArchiveMinutes,
      decl.autoArchiveMinutesRange,
    ],
    ['autoDeleteMinutes', decl.autoDeleteMinutes, decl.autoDeleteMinutesRange],
  ] as const) {
    if (value === undefined) {
      continue
    }
    if (field === 'autoArchiveMinutes' || field === 'autoDeleteMinutes') {
      if (value < -1) {
        out.push(
          diag(`${label}: sandbox.${field} must be >= -1`, range ?? decl.range),
        )
      }
      continue
    }
    if (value < 0) {
      out.push(
        diag(`${label}: sandbox.${field} must be >= 0`, range ?? decl.range),
      )
    }
  }
  return out
}

const WALLET_CADENCES = ['daily', 'weekly', 'monthly'] as const

function validateWalletDecl(
  decl: AgentWalletDecl,
  label: string,
): Diagnostic[] {
  const out: Diagnostic[] = []
  if (decl.budget === undefined) {
    out.push(
      diag(
        `${label}: wallet requires budget as a positive number`,
        decl.budgetRange ?? decl.range,
      ),
    )
  } else if (decl.budget <= 0) {
    out.push(
      diag(
        `${label}: wallet.budget must be a positive number`,
        decl.budgetRange ?? decl.range,
      ),
    )
  }

  if (decl.cadence === undefined || decl.cadence.trim() === '') {
    out.push(
      diag(
        `${label}: wallet requires cadence (daily, weekly, or monthly)`,
        decl.cadenceRange ?? decl.range,
      ),
    )
  } else if (
    !WALLET_CADENCES.includes(
      decl.cadence.trim() as (typeof WALLET_CADENCES)[number],
    )
  ) {
    out.push(
      diag(
        `${label}: wallet.cadence must be daily, weekly, or monthly`,
        decl.cadenceRange ?? decl.range,
      ),
    )
  }

  if (decl.maxPerCall !== undefined) {
    if (decl.maxPerCall <= 0) {
      out.push(
        diag(
          `${label}: wallet.maxPerCall must be a positive number`,
          decl.maxPerCallRange ?? decl.range,
        ),
      )
    } else if (decl.budget !== undefined && decl.maxPerCall > decl.budget) {
      out.push(
        diag(
          `${label}: wallet.maxPerCall must be less than or equal to wallet.budget`,
          decl.maxPerCallRange ?? decl.range,
        ),
      )
    }
  }

  return out
}

/** Upper bound Anthropic accepts for `temperature`; the other providers take 2. */
const ANTHROPIC_MAX_TEMPERATURE = 1
const MAX_TEMPERATURE = 2

/**
 * Range checks for the two sampling fields the runtime now actually applies.
 * Both were inert until the turn runner started passing them through, so a
 * value that used to be quietly ignored now reaches the provider and comes back
 * as an `InvalidArgumentError` at model-call time with nothing pointing at the
 * declaration that caused it. Catching them at deploy time is the whole point.
 */
function validateAgentSamplingFields(
  decl: AgentDecl,
  providerKey: string,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const label = `Agent "${decl.name}"`

  if (
    decl.maxTokens !== undefined &&
    (!Number.isInteger(decl.maxTokens) || decl.maxTokens < 1)
  ) {
    out.push(
      diag(
        `${label}: maxTokens must be a whole number of 1 or more`,
        decl.maxTokensRange ?? decl.range,
      ),
    )
  }

  if (decl.temperature !== undefined) {
    const isAnthropic = providerKey === 'anthropic'
    const maxTemperature = isAnthropic
      ? ANTHROPIC_MAX_TEMPERATURE
      : MAX_TEMPERATURE
    if (
      !Number.isFinite(decl.temperature) ||
      decl.temperature < 0 ||
      decl.temperature > maxTemperature
    ) {
      out.push(
        diag(
          isAnthropic
            ? `${label}: temperature must be between 0 and ${ANTHROPIC_MAX_TEMPERATURE} for provider "anthropic"`
            : `${label}: temperature must be between 0 and ${MAX_TEMPERATURE}`,
          decl.temperatureRange ?? decl.range,
        ),
      )
    }
  }

  return out
}

const CACHE_RETENTIONS = ['none', 'short', 'long'] as const

function isCacheRetention(
  value: string,
): value is (typeof CACHE_RETENTIONS)[number] {
  return CACHE_RETENTIONS.some((r) => r === value)
}

function validateContextDecl(
  decl: AgentContextDecl,
  label: string,
): Diagnostic[] {
  const out: Diagnostic[] = []

  if (
    decl.budget !== undefined &&
    (!Number.isInteger(decl.budget) || decl.budget <= 0)
  ) {
    out.push(
      diag(
        `${label}: context.budget must be a positive whole number of tokens`,
        decl.budgetRange ?? decl.range,
      ),
    )
  }

  if (
    decl.compactAt !== undefined &&
    (decl.compactAt <= 0 || decl.compactAt > 1)
  ) {
    out.push(
      diag(
        `${label}: context.compact_at must be a fraction greater than 0 and at most 1`,
        decl.compactAtRange ?? decl.range,
      ),
    )
  }

  if (
    decl.keepRecentTurns !== undefined &&
    (!Number.isInteger(decl.keepRecentTurns) || decl.keepRecentTurns < 0)
  ) {
    out.push(
      diag(
        `${label}: context.keep_recent_turns must be a whole number of 0 or more`,
        decl.keepRecentTurnsRange ?? decl.range,
      ),
    )
  }

  if (
    decl.pruneToolResultsAfter !== undefined &&
    (!Number.isInteger(decl.pruneToolResultsAfter) ||
      decl.pruneToolResultsAfter < 1)
  ) {
    out.push(
      diag(
        `${label}: context.prune_tool_results_after must be a whole number of 1 or more`,
        decl.pruneToolResultsAfterRange ?? decl.range,
      ),
    )
  }

  if (
    decl.cacheRetention !== undefined &&
    !isCacheRetention(decl.cacheRetention.trim())
  ) {
    out.push(
      diag(
        `${label}: context.cache_retention must be none, short, or long`,
        decl.cacheRetentionRange ?? decl.range,
      ),
    )
  }

  return out
}

/** Strip editor-only *Range fields from context for deployment payloads. */
export function agentContextToDeploymentPayload(
  decl: AgentContextDecl | undefined,
): Record<string, unknown> | undefined {
  if (!decl) {
    return undefined
  }
  return {
    budget: decl.budget,
    compactAt: decl.compactAt,
    keepRecentTurns: decl.keepRecentTurns,
    pruneToolResultsAfter: decl.pruneToolResultsAfter,
    cacheRetention: decl.cacheRetention,
  }
}

/** Strip editor-only *Range fields from wallet for deployment payloads. */
export function agentWalletToDeploymentPayload(
  decl: AgentWalletDecl | undefined,
): Record<string, unknown> | undefined {
  if (!decl) {
    return undefined
  }
  return {
    budget: decl.budget,
    cadence: decl.cadence,
    maxPerCall: decl.maxPerCall,
  }
}

/** Strip editor-only AST fields from suggestions for deployment payloads. */
export function agentSuggestionsToDeploymentPayload(
  suggestions: AgentSuggestionDecl[] | undefined,
): Array<{ label: string; message: string }> | undefined {
  if (!suggestions?.length) {
    return undefined
  }
  return suggestions.map(({ label, message }) => ({ label, message }))
}

/** Strip editor-only *Range fields from sandbox for deployment payloads. */
export function agentSandboxToDeploymentPayload(
  decl: AgentSandboxDecl | undefined,
): Record<string, unknown> | undefined {
  if (!decl) {
    return undefined
  }
  return {
    cpus: decl.cpus,
    memoryMiB: decl.memoryMiB,
    diskGiB: decl.diskGiB,
    autoStopMinutes: decl.autoStopMinutes,
    autoArchiveMinutes: decl.autoArchiveMinutes,
    autoDeleteMinutes: decl.autoDeleteMinutes,
    ephemeral: decl.ephemeral,
  }
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

function workflowRoot(decl: WorkflowDecl): NodeDecl | undefined {
  return decl.nodes.find((n) => n.isRoot)
}

function leafNodes(decl: WorkflowDecl): NodeDecl[] {
  const sources = new Set(decl.edges.map((e) => e.source))
  return decl.nodes.filter((n) => !sources.has(n.name))
}

/**
 * Mirror of the runtime check in `requireToolGraphInputSchema`
 * (packages/agent/src/hosted-tools.ts): an agent tool's root inputSchema must
 * be an object that declares a non-empty `properties` map. Returns true when
 * the schema would be rejected at turn execution time.
 */
function toolInputSchemaPropsInvalid(schema: JsonSchemaLiteral): boolean {
  const props = schema.properties
  return (
    props == null ||
    typeof props !== 'object' ||
    Array.isArray(props) ||
    Object.keys(props as Record<string, unknown>).length === 0
  )
}

function validateToolWorkflowShape(
  workflowName: string,
  w: WorkflowDecl,
  at: SourceRange,
  resolveSchemaRef: (name: string) => JsonSchemaLiteral | undefined,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const desc = w.description?.trim()
  if (!desc) {
    out.push(
      diag(
        `Workflow "${workflowName}" is used as an agent tool but the workflow-level description field is missing or empty`,
        at,
      ),
    )
  }

  const root = workflowRoot(w)
  if (!root?.inputSchema && !root?.inputSchemaRef) {
    out.push(
      diag(
        `Agent tool workflow "${workflowName}" must declare inputSchema on the root node`,
        root?.range ?? at,
      ),
    )
  } else {
    // Resolve the effective root schema. Inline schemas are already objects;
    // refs resolve against local + workspace schema blocks. Only validate when
    // we have a concrete schema so an unresolvable ref (reported elsewhere)
    // does not produce a false positive here.
    const effective = root?.inputSchema
      ? root.inputSchema
      : root?.inputSchemaRef
        ? resolveSchemaRef(root.inputSchemaRef)
        : undefined
    if (effective !== undefined && toolInputSchemaPropsInvalid(effective)) {
      out.push(
        diag(
          `Agent tool workflow "${workflowName}" root inputSchema must declare a non-empty properties object. Add at least one input property so the agent can call the tool.`,
          root?.range ?? at,
        ),
      )
    }
  }

  const leaves = leafNodes(w)
  for (const leaf of leaves) {
    // AI nodes have a kind-determined output shape: text -> string,
    // embed -> number[], image/video -> media. Only `kind: object` carries a
    // free-form output, and the AI-node validator already requires `schema`
    // there. Requiring an explicit output schema on a text leaf is a catch-22:
    // the AI-node validator warns the moment you add one to a text node. The
    // runtime tool spec (packages/agent/src/hosted-tools.ts) never reads the
    // leaf output schema anyway, so skip the requirement for inferred kinds.
    if (leaf.type === 'decision') {
      continue
    }
    // A device node's output shape is fixed by the platform, and the node
    // refuses a `schema` of its own, so it can end a tool workflow as it is.
    if (leaf.type === 'device') {
      continue
    }
    if (leaf.type === 'ai') {
      const kindCv = leaf.configFields.kind
      const kind = kindCv?.kind === 'string' ? kindCv.value : undefined
      if (kind !== 'object') {
        continue
      }
    }

    const hasSchema = leaf.outputSchema != null || leaf.outputSchemaRef != null
    if (!hasSchema) {
      out.push(
        diag(
          `Agent tool workflow "${workflowName}" requires output schema on leaf node "${leaf.name}"`,
          leaf.range,
        ),
      )
    }
  }

  return out
}

function validateAgentSuggestions(
  suggestions: AgentSuggestionDecl[] | undefined,
  agentName: string,
  range: SourceRange,
): Diagnostic[] {
  if (!suggestions?.length) {
    return []
  }

  const out: Diagnostic[] = []
  if (suggestions.length > AGENT_SUGGESTION_LIMITS.maxCount) {
    out.push(
      diag(
        `Agent "${agentName}": suggestions may contain at most ${AGENT_SUGGESTION_LIMITS.maxCount} items`,
        range,
      ),
    )
  }

  const labels = new Set<string>()
  for (const [index, suggestion] of suggestions.entries()) {
    const itemRange = suggestion.range
    if (!suggestion.label.trim()) {
      out.push(
        diag(
          `Agent "${agentName}": suggestions[${index}].label must be a non-empty string`,
          suggestion.labelRange ?? itemRange,
        ),
      )
    } else if (
      suggestion.label.length > AGENT_SUGGESTION_LIMITS.maxLabelLength
    ) {
      out.push(
        diag(
          `Agent "${agentName}": suggestions[${index}].label must be at most ${AGENT_SUGGESTION_LIMITS.maxLabelLength} characters`,
          suggestion.labelRange ?? itemRange,
        ),
      )
    } else if (labels.has(suggestion.label)) {
      out.push(
        diag(
          `Agent "${agentName}": suggestions[${index}].label must be unique`,
          suggestion.labelRange ?? itemRange,
        ),
      )
    } else {
      labels.add(suggestion.label)
    }

    if (!suggestion.message.trim()) {
      out.push(
        diag(
          `Agent "${agentName}": suggestions[${index}].message must be a non-empty string`,
          suggestion.messageRange ?? itemRange,
        ),
      )
    } else if (
      suggestion.message.length > AGENT_SUGGESTION_LIMITS.maxMessageLength
    ) {
      out.push(
        diag(
          `Agent "${agentName}": suggestions[${index}].message must be at most ${AGENT_SUGGESTION_LIMITS.maxMessageLength} characters`,
          suggestion.messageRange ?? itemRange,
        ),
      )
    }
  }

  return out
}

export function validateAgentBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const agents = ast.agent ?? []
  const agentByName = agentBlockMap(ast, options?.workspace)

  function workflowByName(name: string): WorkflowDecl | null {
    const local = ast.workflows?.find((g) => g.name === name)
    if (local) {
      return local
    }
    return options?.workspace?.workflowBlocks.get(name) ?? null
  }

  // Resolve named schema blocks for inputSchemaRef validation. Local file
  // schemas take precedence, falling back to the workspace-wide index.
  const localSchemaLiterals = resolveNamedSchemasFromDecls(
    ast.schemas ?? [],
  ).map
  function resolveSchemaRef(name: string): JsonSchemaLiteral | undefined {
    return (
      localSchemaLiterals.get(name) ??
      options?.workspace?.schemaLiterals.get(name)
    )
  }

  const secretsByName = new Map<string, Set<string>>()
  for (const s of ast.secrets ?? []) {
    secretsByName.set(s.name, new Set(s.vars))
  }

  function hasSecretBlock(name: string): boolean {
    if (secretsByName.has(name)) {
      return true
    }
    return options?.workspace?.secrets.has(name) ?? false
  }

  function secretVarsForRef(name: string): Set<string> | null {
    const local = secretsByName.get(name)
    if (local) {
      return local
    }
    const w = options?.workspace?.secrets.get(name)
    if (w) {
      return new Set(w.vars)
    }
    return null
  }

  const names = new Set<string>()
  const computers = computerBlockMap(ast, options?.workspace)

  for (const a of agents) {
    out.push(...validateResourceName(a.name, a.range, 'Agent block'))

    if (names.has(a.name)) {
      out.push(diag(`Duplicate agent block name "${a.name}"`, a.range))
    }
    names.add(a.name)

    const resolvedProvider = resolveAgentProvider(a.provider)
    const providerParsed = aiProviderSchema.safeParse(resolvedProvider)
    if (!providerParsed.success && (a.provider ?? '').trim() !== '') {
      out.push(
        diag(
          `Invalid agent provider "${a.provider}". Must be one of: ${aiProviderSchema.options.join(', ')}`,
          a.providerRange ?? a.range,
        ),
      )
    }

    const providerKey = providerParsed.success
      ? providerParsed.data
      : DEFAULT_AGENT_PROVIDER

    if (!a.model?.trim()) {
      out.push(
        diag('Agent block requires a non-empty model field', a.modelRange),
      )
    }

    out.push(...validateAgentSamplingFields(a, providerKey))

    if (a.secretsRef !== undefined && a.secretsRef !== '') {
      if (!hasSecretBlock(a.secretsRef)) {
        out.push(
          diag(
            `Agent "${a.name}" references undefined secret block "${a.secretsRef}"`,
            a.range,
          ),
        )
      }
      const vars = secretVarsForRef(a.secretsRef)
      const needed = PROVIDER_EXPECTED_VARS[providerKey] ?? []
      if (vars) {
        for (const vn of needed) {
          if (!vars.has(vn)) {
            out.push(
              diag(
                `Agent "${a.name}" secret block must declare "${vn}" for provider "${providerKey}"`,
                a.secretsRefRange ?? a.range,
              ),
            )
          }
        }
      }
    } else {
      out.push(
        diag(
          `Agent block "${a.name}" requires secrets: pointing to a secret block with provider API credentials`,
          a.range,
        ),
      )
    }

    if (a.sandbox) {
      out.push(...validateSandboxDecl(a.sandbox, `Agent "${a.name}"`))
    }

    if (a.wallet) {
      out.push(...validateWalletDecl(a.wallet, `Agent "${a.name}"`))
    }

    if (a.context) {
      out.push(...validateContextDecl(a.context, `Agent "${a.name}"`))
    }

    out.push(...validateAgentSuggestions(a.suggestions, a.name, a.range))

    const profileNames = new Set<string>()
    for (const profile of a.profiles ?? []) {
      if (profileNames.has(profile.name)) {
        out.push(
          diag(
            `Duplicate profile name "${profile.name}" in agent "${a.name}"`,
            profile.range,
          ),
        )
      }
      profileNames.add(profile.name)

      if (profile.computer !== undefined) {
        out.push(
          diag(
            `Profile "${profile.name}" cannot set computer:`,
            profile.computerRange ?? profile.range,
          ),
        )
      }

      if (profile.sandbox) {
        out.push(
          ...validateSandboxDecl(
            profile.sandbox,
            `Agent "${a.name}" profile "${profile.name}"`,
          ),
        )
      }
    }

    const agentToolSet = new Set(a.tools ?? [])

    const agentTools = a.tools ?? []
    for (let ti = 0; ti < agentTools.length; ti++) {
      const toolName = agentTools[ti]!
      const listRange = a.toolsRanges?.[ti] ?? a.range
      const tg = workflowByName(toolName)
      if (!tg) {
        out.push(
          diag(
            `Agent "${a.name}" tool workflow "${toolName}" is not defined in the workspace`,
            listRange,
          ),
        )
        continue
      }
      out.push(
        ...validateToolWorkflowShape(toolName, tg, listRange, resolveSchemaRef),
      )
    }

    for (const profile of a.profiles ?? []) {
      if (profile.tools === undefined) {
        continue
      }
      for (let ri = 0; ri < profile.tools.length; ri++) {
        const toolName = profile.tools[ri]!
        const listRange = profile.toolsRanges?.[ri] ?? profile.range
        if (!agentToolSet.has(toolName)) {
          out.push(
            diag(
              `Profile "${profile.name}" tool "${toolName}" is not listed on agent "${a.name}" tools:`,
              listRange,
            ),
          )
        }
        const tg = workflowByName(toolName)
        if (!tg) {
          out.push(
            diag(
              `Profile "${profile.name}" (agent "${a.name}") tool workflow "${toolName}" is not defined`,
              listRange,
            ),
          )
          continue
        }
        out.push(
          ...validateToolWorkflowShape(
            toolName,
            tg,
            listRange,
            resolveSchemaRef,
          ),
        )
      }
    }

    const agentTeam = a.team ?? []
    for (let ti = 0; ti < agentTeam.length; ti++) {
      const memberName = agentTeam[ti]!
      const listRange = a.teamRanges?.[ti] ?? a.range
      if (memberName === a.name) {
        out.push(
          diag(`Agent "${a.name}" cannot include itself in team:`, listRange),
        )
        continue
      }
      if (!agentByName.has(memberName)) {
        out.push(
          diag(
            `Agent "${a.name}" team member "${memberName}" is not defined in the workspace`,
            listRange,
          ),
        )
        continue
      }
      if (agentToolSet.has(memberName)) {
        out.push(
          diag(
            `Agent "${a.name}" team member "${memberName}" conflicts with a workflow tool of the same name`,
            listRange,
          ),
        )
      }
    }

    const diskByName = diskBlockMap(ast, options?.workspace)
    const seenDisks = new Set<string>()
    const agentDisks = a.disks ?? []
    for (let di = 0; di < agentDisks.length; di++) {
      const diskName = agentDisks[di]!
      const listRange = a.disksRanges?.[di] ?? a.range
      if (seenDisks.has(diskName)) {
        out.push(
          diag(
            `Agent "${a.name}" lists duplicate disk "${diskName}" in disks:`,
            listRange,
          ),
        )
        continue
      }
      seenDisks.add(diskName)
      if (!diskByName.has(diskName)) {
        out.push(
          diag(
            `Agent "${a.name}" disk "${diskName}" is not defined in the workspace`,
            listRange,
          ),
        )
      }
    }

    if (a.computer !== undefined) {
      const computerName = a.computer.trim()
      if (!computerName) {
        out.push(
          diag(
            `Agent "${a.name}" computer: must name a top-level computer block`,
            a.computerRange ?? a.range,
          ),
        )
      } else if (!computers.has(computerName)) {
        out.push(
          diag(
            `Agent "${a.name}" references undefined computer block "${computerName}"`,
            a.computerRange ?? a.range,
          ),
        )
      } else if (computers.get(computerName)?.harness) {
        // Harness delivery and the harness credential check run only in the
        // shell guest path, so an agent guest of a harness computer would
        // boot without its harness. Refused until agents get delivery.
        out.push(
          diag(
            `Agent "${a.name}" cannot bind computer "${computerName}" because it declares a harness. Only shell nodes can bind a harness computer for now; bind a computer without a harness block`,
            a.computerRange ?? a.range,
          ),
        )
      }
      if (a.sandbox !== undefined) {
        out.push(
          diag(
            `Agent "${a.name}" cannot set sandbox together with computer:`,
            a.sandbox.range,
          ),
        )
      }
      if (a.disks !== undefined) {
        out.push(
          diag(
            `Agent "${a.name}" cannot set disks together with computer:`,
            a.disksRange ?? a.disksRanges?.[0] ?? a.range,
          ),
        )
      }
      for (const profile of a.profiles ?? []) {
        if (profile.sandbox !== undefined) {
          out.push(
            diag(
              `Profile "${profile.name}" of agent "${a.name}" cannot set sandbox: when the agent sets computer:`,
              profile.sandbox.range,
            ),
          )
        }
      }
    }
  }

  out.push(...validateTeamCycles(agentByName))

  return out
}

function validateTeamCycles(agents: Map<string, AgentDecl>): Diagnostic[] {
  const visiting = new Set<string>()
  const path: string[] = []

  function dfs(node: string): Diagnostic[] {
    if (visiting.has(node)) {
      const idx = path.indexOf(node)
      const cycle = idx >= 0 ? [...path.slice(idx), node] : [node, node]
      const range =
        agents.get(cycle[0] ?? node)?.range ??
        agents.values().next().value?.range
      if (!range) {
        return []
      }
      return [diag(`Agent team contains a cycle: ${cycle.join(' -> ')}`, range)]
    }
    visiting.add(node)
    path.push(node)
    const decl = agents.get(node)
    for (const member of decl?.team ?? []) {
      const found = dfs(member)
      if (found.length > 0) {
        return found
      }
    }
    path.pop()
    visiting.delete(node)
    return []
  }

  for (const name of agents.keys()) {
    const found = dfs(name)
    if (found.length > 0) {
      return found
    }
  }

  return []
}

function agentBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, AgentDecl> {
  const m = new Map<string, AgentDecl>()
  for (const a of ast.agent ?? []) {
    m.set(a.name, a)
  }
  if (workspace?.agentBlocks) {
    for (const [name, decl] of workspace.agentBlocks) {
      m.set(name, decl)
    }
  }
  return m
}

function computerBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, ComputerDecl> {
  const m = new Map<string, ComputerDecl>()
  for (const computer of ast.computer ?? []) {
    m.set(computer.name, computer)
  }
  if (workspace?.computerBlocks) {
    for (const [name, decl] of workspace.computerBlocks) {
      m.set(name, decl)
    }
  }
  return m
}

function diskBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, DiskDecl> {
  const m = new Map<string, DiskDecl>()
  for (const d of ast.disk ?? []) {
    m.set(d.name, d)
  }
  if (workspace?.diskBlocks) {
    for (const [name, decl] of workspace.diskBlocks) {
      m.set(name, decl)
    }
  }
  return m
}

function inheritedToolsList(
  agentDecl: AgentDecl,
  profileName: string | undefined,
): string[] {
  if (profileName?.trim()) {
    const profile = agentDecl.profiles.find(
      (p) => p.name === profileName.trim(),
    )
    if (profile?.tools !== undefined) {
      return profile.tools
    }
  }
  return agentDecl.tools ?? []
}

export function validateAgentNodes(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const agents = agentBlockMap(ast, options?.workspace)

  for (const g of ast.workflows ?? []) {
    for (const node of g.nodes ?? []) {
      if (node.type !== 'agent') {
        continue
      }

      const agentCv = node.configFields.agent
      if (!agentCv || agentCv.kind !== 'string') {
        out.push(
          diag(
            'Agent node requires an "agent" field (top-level agent block name)',
            node.range,
          ),
        )
        continue
      }

      const agentName = agentCv.value.trim()
      const decl = agents.get(agentName)
      if (!decl) {
        out.push(
          diag(
            `Agent node references undefined agent block "${agentName}"`,
            agentCv.range,
          ),
        )
        continue
      }

      const promptCv = node.configFields.prompt
      const promptOk =
        !!promptCv &&
        (promptCv.kind === 'ts_block' ||
          promptCv.kind === 'ts_file_ref' ||
          (promptCv.kind === 'string' && promptCv.value.trim() !== ''))

      if (!promptOk) {
        out.push(
          diag(
            'Agent node requires "prompt" as a string, @ts block, or file ref',
            node.range,
          ),
        )
      }

      const profileCv = node.configFields.profile
      let profileStr: string | undefined
      if (profileCv) {
        if (profileCv.kind === 'string' && profileCv.value.trim()) {
          profileStr = profileCv.value.trim()
        } else {
          out.push(
            diag(
              'Agent node profile: must be a non-empty identifier',
              profileCv.range,
            ),
          )
          continue
        }
        const r = decl.profiles.find((x) => x.name === profileStr)
        if (!r) {
          out.push(
            diag(
              `Agent "${agentName}" has no profile named "${profileStr}"`,
              profileCv.range,
            ),
          )
        }
      }

      const nodeToolsCv = node.configFields.tools
      if (nodeToolsCv) {
        if (nodeToolsCv.kind !== 'array') {
          out.push(
            diag(
              'Agent node "tools:" must be an array of workflow identifiers',
              nodeToolsCv.range,
            ),
          )
        } else {
          const nodeTools = nodeToolsCv.value
            .filter((v) => v.kind === 'string')
            .map((v) => (v as { kind: 'string'; value: string }).value.trim())
          const inherited = new Set(inheritedToolsList(decl, profileStr))
          const ranges = nodeToolsCv.value
            .filter((v) => v.kind === 'string')
            .map((v) => (v as { kind: 'string'; range: SourceRange }).range)
          for (let i = 0; i < nodeTools.length; i++) {
            const t = nodeTools[i]!
            if (!inherited.has(t)) {
              out.push(
                diag(
                  `Agent node tool override "${t}" is not allowed for the selected profile/agent tool list`,
                  ranges[i] ?? nodeToolsCv.range,
                ),
              )
            }
          }
        }
      }

      const systemCv = node.configFields.system
      if (
        systemCv &&
        systemCv.kind !== 'ts_block' &&
        systemCv.kind !== 'ts_file_ref' &&
        !(systemCv.kind === 'string' && systemCv.value.trim() !== '')
      ) {
        out.push(
          diag(
            'Agent node "system" must be a string, @ts block, or file ref when set',
            systemCv.range,
          ),
        )
      }

      if (
        promptCv &&
        promptCv.kind !== 'ts_block' &&
        promptCv.kind !== 'ts_file_ref' &&
        !(promptCv.kind === 'string' && promptCv.value.trim() !== '')
      ) {
        out.push(
          diag(
            'Agent node "prompt" must be a string, @ts block, or file ref when set',
            promptCv.range,
          ),
        )
      }
    }
  }

  return out
}
