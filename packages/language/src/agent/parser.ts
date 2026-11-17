/**
 * Parsing for `agent` top-level blocks. Called from the main parser via delegation.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  AgentContextDecl,
  AgentDecl,
  AgentProfileDecl,
  AgentSandboxDecl,
  AgentSuggestionDecl,
  AgentWalletDecl,
} from './ast'
import { DEFAULT_AGENT_PROVIDER } from './provider'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

/** Parse a `sandbox: { … }` literal (resource and lifecycle overrides). */
function parseSandboxDecl(d: ResourceParserDelegate, valueStart: Token): AgentSandboxDecl | null {
  if (!d.expect('lbrace')) {
    d.error('sandbox: expected { after sandbox:', d.peek())
    return null
  }

  let cpus: number | undefined
  let cpusRange: SourceRange | undefined
  let memoryMiB: number | undefined
  let memoryMiBRange: SourceRange | undefined
  let diskGiB: number | undefined
  let diskGiBRange: SourceRange | undefined
  let autoStopMinutes: number | undefined
  let autoStopMinutesRange: SourceRange | undefined
  let autoArchiveMinutes: number | undefined
  let autoArchiveMinutesRange: SourceRange | undefined
  let autoDeleteMinutes: number | undefined
  let autoDeleteMinutesRange: SourceRange | undefined
  let ephemeral: boolean | undefined
  let ephemeralRange: SourceRange | undefined

  const parseSandboxNumber = (assign: (val: number, range: SourceRange | undefined) => void) => {
    const vt = d.peek()
    const val = d.parseValue()

    if (typeof val === 'number') {
      assign(val, vt?.range as SourceRange | undefined)
    }
  }

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'comma') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected : after sandbox key', d.peek())
      break
    }

    if (key === 'cpus') {
      parseSandboxNumber((val, range) => {
        cpus = val
        cpusRange = range
      })

      continue
    }

    if (key === 'memoryMiB') {
      parseSandboxNumber((val, range) => {
        memoryMiB = val
        memoryMiBRange = range
      })

      continue
    }

    if (key === 'diskGiB') {
      parseSandboxNumber((val, range) => {
        diskGiB = val
        diskGiBRange = range
      })

      continue
    }

    if (key === 'autoStopMinutes') {
      parseSandboxNumber((val, range) => {
        autoStopMinutes = val
        autoStopMinutesRange = range
      })

      continue
    }

    if (key === 'autoArchiveMinutes') {
      parseSandboxNumber((val, range) => {
        autoArchiveMinutes = val
        autoArchiveMinutesRange = range
      })

      continue
    }

    if (key === 'autoDeleteMinutes') {
      parseSandboxNumber((val, range) => {
        autoDeleteMinutes = val
        autoDeleteMinutesRange = range
      })

      continue
    }

    if (key === 'ephemeral') {
      const vt = d.peek()
      const val = d.parseValue()

      if (typeof val === 'boolean') {
        ephemeral = val
        ephemeralRange = vt?.range as SourceRange | undefined
      }

      continue
    }

    d.parseValue()
  }

  const endTok = d.expect('rbrace') ?? d.peek() ?? valueStart

  return {
    cpus,
    cpusRange,
    memoryMiB,
    memoryMiBRange,
    diskGiB,
    diskGiBRange,
    autoStopMinutes,
    autoStopMinutesRange,
    autoArchiveMinutes,
    autoArchiveMinutesRange,
    autoDeleteMinutes,
    autoDeleteMinutesRange,
    ephemeral,
    ephemeralRange,
    range: rangeFromTokens(valueStart, endTok),
  }
}

/** Parse a `wallet: { … }` literal (Zero tool-spend budget). */
function parseWalletDecl(d: ResourceParserDelegate, valueStart: Token): AgentWalletDecl | null {
  if (!d.expect('lbrace')) {
    d.error('wallet: expected { after wallet:', d.peek())
    return null
  }

  let budget: number | undefined
  let budgetRange: SourceRange | undefined
  let cadence: string | undefined
  let cadenceRange: SourceRange | undefined
  let maxPerCall: number | undefined
  let maxPerCallRange: SourceRange | undefined

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'comma') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected : after wallet key', d.peek())
      break
    }

    if (key === 'budget' || key === 'maxPerCall') {
      const vt = d.peek()
      const val = d.parseValue()

      if (typeof val === 'number') {
        if (key === 'budget') {
          budget = val
          budgetRange = vt?.range as SourceRange | undefined
        } else {
          maxPerCall = val
          maxPerCallRange = vt?.range as SourceRange | undefined
        }
      }

      continue
    }

    if (key === 'cadence') {
      const tok = d.peek()

      if (tok && (tok.kind === 'identifier' || tok.kind === 'keyword')) {
        d.advance()
        cadence = tok.value as string
        cadenceRange = tok.range as SourceRange
      } else if (tok?.kind === 'string') {
        d.advance()
        cadence = tok.value as string
        cadenceRange = tok.range as SourceRange
      }

      continue
    }

    d.parseValue()
  }

  const endTok = d.expect('rbrace') ?? d.peek() ?? valueStart

  return {
    budget,
    budgetRange,
    cadence,
    cadenceRange,
    maxPerCall,
    maxPerCallRange,
    range: rangeFromTokens(valueStart, endTok),
  }
}

/** DSL keys accepted inside `context { … }`, in the order they are serialized. */
const CONTEXT_KEYS = [
  'budget',
  'compact_at',
  'keep_recent_turns',
  'prune_tool_results_after',
  'cache_retention',
] as const

/**
 * Parse a `context: { … }` literal (RFC 0021 context-engine overrides).
 *
 * Unlike sandbox and wallet, an unrecognized key here is reported rather than
 * swallowed: these knobs govern what the model is allowed to see, so a typo
 * that silently reverts an agent to the managed default is worth a diagnostic.
 */
function parseContextDecl(d: ResourceParserDelegate, valueStart: Token): AgentContextDecl | null {
  if (!d.expect('lbrace')) {
    d.error('context: expected { after context', d.peek())

    // Swallow whatever stands in for the block so the rest of the agent block
    // still parses, instead of cascading into a stray-token error at top level.
    if (d.peek()?.kind !== 'rbrace') {
      d.parseValue()
    }

    return null
  }

  let budget: number | undefined
  let budgetRange: SourceRange | undefined
  let compactAt: number | undefined
  let compactAtRange: SourceRange | undefined
  let keepRecentTurns: number | undefined
  let keepRecentTurnsRange: SourceRange | undefined
  let pruneToolResultsAfter: number | undefined
  let pruneToolResultsAfterRange: SourceRange | undefined
  let cacheRetention: string | undefined
  let cacheRetentionRange: SourceRange | undefined

  const parseContextNumber = (
    key: string,
    assign: (val: number, range: SourceRange | undefined) => void,
  ) => {
    const vt = d.peek()
    const val = d.parseValue()

    if (typeof val === 'number') {
      assign(val, vt?.range)
      return
    }

    d.error(`context.${key} must be a number`, vt)
  }

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'comma') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected : after context key', d.peek())
      break
    }

    if (key === 'budget') {
      parseContextNumber(key, (val, range) => {
        budget = val
        budgetRange = range
      })

      continue
    }

    if (key === 'compact_at') {
      parseContextNumber(key, (val, range) => {
        compactAt = val
        compactAtRange = range
      })

      continue
    }

    if (key === 'keep_recent_turns') {
      parseContextNumber(key, (val, range) => {
        keepRecentTurns = val
        keepRecentTurnsRange = range
      })

      continue
    }

    if (key === 'prune_tool_results_after') {
      parseContextNumber(key, (val, range) => {
        pruneToolResultsAfter = val
        pruneToolResultsAfterRange = range
      })

      continue
    }

    if (key === 'cache_retention') {
      const tok = d.peek()

      if (tok && (tok.kind === 'identifier' || tok.kind === 'keyword' || tok.kind === 'string')) {
        d.advance()
        cacheRetention = String(tok.value)
        cacheRetentionRange = tok.range
      } else {
        d.error('context.cache_retention must be none, short, or long', tok)
      }

      continue
    }

    d.error(
      `Unexpected key "${key}" in context block — only ${CONTEXT_KEYS.slice(0, -1).join(', ')}, and ${CONTEXT_KEYS.at(-1)} are allowed`,
      t,
    )

    d.parseValue()
  }

  const endTok = d.expect('rbrace') ?? d.peek() ?? valueStart

  return {
    budget,
    budgetRange,
    compactAt,
    compactAtRange,
    keepRecentTurns,
    keepRecentTurnsRange,
    pruneToolResultsAfter,
    pruneToolResultsAfterRange,
    cacheRetention,
    cacheRetentionRange,
    range: rangeFromTokens(valueStart, endTok),
  }
}

/**
 * Parse `computer: <name>`. A missing or non-name value is still recorded
 * (`name: ''`) so validation can tell "key absent" from "key present".
 */
function parseComputerRef(
  d: ResourceParserDelegate,
  keyTok: Token | null,
): { name: string; range: SourceRange } {
  const valueTok = d.peek()

  if (
    valueTok &&
    (valueTok.kind === 'identifier' || valueTok.kind === 'keyword' || valueTok.kind === 'string')
  ) {
    d.advance()
    return {
      name: String(valueTok.value ?? ''),
      range: { ...valueTok.range },
    }
  }

  if (valueTok && valueTok.kind !== 'rbrace') {
    const range = { ...valueTok.range }
    d.parseValue()
    return { name: '', range }
  }

  const range = keyTok?.range ?? valueTok?.range

  if (!range) {
    return {
      name: '',
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    }
  }

  return { name: '', range: { ...range } }
}

/** Parse `[ a, b ]` as a list of identifier/keyword names. */
function parseIdentifierList(d: ResourceParserDelegate): {
  names: string[]
  ranges: SourceRange[]
  range: SourceRange
} | null {
  const open = d.expect('lbracket')

  if (!open) {
    d.error('Expected [', d.peek())
    return null
  }

  const names: string[] = []
  const ranges: SourceRange[] = []

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbracket') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'identifier' || t.kind === 'keyword') {
      const tok = d.advance()!
      names.push(tok.value as string)
      ranges.push(tok.range as SourceRange)
    } else {
      d.error('Expected tool graph name (identifier)', t)
      d.skipToNextBlock()
      return null
    }

    d.expect('comma')
  }

  const close = d.expect('rbracket')

  if (!close) {
    d.error('Expected ] after tools list', d.peek())
    d.skipToNextBlock()
    return null
  }

  return { names, ranges, range: rangeFromTokens(open, close) }
}

function parseAgentProfileBody(
  d: ResourceParserDelegate,
  roleName: string,
  rangeStart: Token,
): AgentProfileDecl | null {
  if (!d.expect('lbrace')) {
    d.error('Expected { after profile name', d.peek())
    d.skipToNextBlock()
    return null
  }

  let description: string | undefined
  let descriptionRange: SourceRange | undefined
  let systemCode: string | undefined
  let systemCodeRange: SourceRange | undefined
  let tools: string[] | undefined
  let toolsRanges: SourceRange[] | undefined
  let skills: string[] | undefined
  let skillsRanges: SourceRange[] | undefined
  let mcp: string[] | undefined
  let mcpRanges: SourceRange[] | undefined
  let sandbox: AgentSandboxDecl | undefined
  let computer: string | undefined
  let computerRange: SourceRange | undefined
  let docComment: string | undefined

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      const dc = d.advance()
      docComment ??= dc?.fencedContent
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'description') {
      const val = d.parseValue()

      if (typeof val === 'string') {
        description = val
        descriptionRange = d.peek()?.range ?? rangeStart.range
      }

      continue
    }

    if (key === 'system') {
      const vt = d.peek()
      const cv = vt ? d.parseConfigValue(vt) : undefined

      if (cv?.kind === 'ts_block') {
        systemCode = cv.code
        systemCodeRange = cv.innerRange
      } else {
        d.error('Expected @ts block for role system:', vt)
      }

      continue
    }

    if (key === 'tools') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        tools = parsedList.names
        toolsRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'skills') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        skills = parsedList.names
        skillsRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'mcp') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        mcp = parsedList.names
        mcpRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'sandbox') {
      const vs = d.peek()

      if (!vs) {
        break
      }

      const decl = parseSandboxDecl(d, vs)

      if (decl) {
        sandbox = decl
      }

      continue
    }

    if (key === 'computer') {
      const ref = parseComputerRef(d, keyTok)
      computer = ref.name
      computerRange = ref.range
      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  const endTok = end ?? rangeStart

  return {
    name: roleName,
    description,
    descriptionRange,
    systemCode,
    systemCodeRange,
    tools,
    toolsRanges,
    skills,
    skillsRanges,
    mcp,
    mcpRanges,
    sandbox,
    computer,
    computerRange,
    docComment,
    range: rangeFromTokens(rangeStart, endTok),
  }
}

function parseSuggestionsDecl(
  d: ResourceParserDelegate,
  valueStart: Token,
): AgentSuggestionDecl[] | undefined {
  const raw = d.parseValue()

  if (!Array.isArray(raw)) {
    d.error('suggestions: expected an array of { label, message } objects', valueStart)
    return undefined
  }

  const suggestions: AgentSuggestionDecl[] = []

  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      d.error(`suggestions[${index}]: expected an object with label and message`, valueStart)
      continue
    }

    const record = item as Record<string, unknown>

    if (typeof record.label !== 'string') {
      d.error(`suggestions[${index}]: label must be a string`, valueStart)
    }

    if (typeof record.message !== 'string') {
      d.error(`suggestions[${index}]: message must be a string`, valueStart)
    }

    suggestions.push({
      label: typeof record.label === 'string' ? record.label : '',
      message: typeof record.message === 'string' ? record.message : '',
      range: valueStart.range as SourceRange,
    })
  }

  return suggestions
}

export function parseAgentBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): AgentDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'agent') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected agent block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let description: string | undefined
  let provider = ''
  let providerRange: SourceRange | undefined
  let model = ''
  let modelRange = nameTok.range as SourceRange
  let secretsRef: string | undefined
  let secretsRefRange: SourceRange | undefined
  let systemCode: string | undefined
  let systemCodeRange: SourceRange | undefined
  let temperature: number | undefined
  let temperatureRange: SourceRange | undefined
  let maxTokens: number | undefined
  let maxTokensRange: SourceRange | undefined
  let maxSteps: number | undefined
  let maxStepsRange: SourceRange | undefined
  let tools: string[] | undefined
  let toolsRanges: SourceRange[] | undefined
  let skills: string[] | undefined
  let skillsRanges: SourceRange[] | undefined
  let mcp: string[] | undefined
  let mcpRanges: SourceRange[] | undefined
  let team: string[] | undefined
  let teamRanges: SourceRange[] | undefined
  let disks: string[] | undefined
  let disksRanges: SourceRange[] | undefined
  let disksRange: SourceRange | undefined
  let sandbox: AgentSandboxDecl | undefined
  let computer: string | undefined
  let computerRange: SourceRange | undefined
  let wallet: AgentWalletDecl | undefined
  let context: AgentContextDecl | undefined
  let suggestions: AgentSuggestionDecl[] | undefined
  const profiles: AgentProfileDecl[] = []

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'keyword' && t.value === 'profile') {
      d.advance()
      const profileNameTok = d.advance()

      if (
        !profileNameTok ||
        (profileNameTok.kind !== 'identifier' && profileNameTok.kind !== 'keyword')
      ) {
        d.error('Expected profile name', profileNameTok)
        d.skipToNextBlock()
        return null
      }

      const profileBody = parseAgentProfileBody(d, profileNameTok.value as string, profileNameTok)

      if (profileBody) {
        profiles.push(profileBody)
      }

      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (key === 'context') {
      // Handled ahead of the shared colon check because `context` accepts both
      // spellings: `context: { … }` matches the sandbox and wallet precedent,
      // and the colon-less `context { … }` reads as the nested block RFC 0021
      // writes. Serialization normalizes to the colon form.
      if (d.peek()?.kind === 'colon') {
        d.advance()
      }

      const vs = d.peek()

      if (!vs) {
        break
      }

      const decl = parseContextDecl(d, vs)

      if (decl) {
        context = decl
      }

      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'label') {
      const val = d.parseValue()

      if (typeof val === 'string') {
        label = val
      }

      continue
    }

    if (key === 'description') {
      const val = d.parseValue()

      if (typeof val === 'string') {
        description = val
      }

      continue
    }

    if (key === 'provider') {
      const tok = d.peek()

      if (tok && (tok.kind === 'identifier' || tok.kind === 'keyword')) {
        d.advance()
        provider = tok.value as string
        providerRange = tok.range as SourceRange
      } else if (tok?.kind === 'string') {
        d.advance()
        provider = tok.value as string
        providerRange = tok.range as SourceRange
      }

      continue
    }

    if (key === 'model') {
      const valTok = d.peek()

      if (valTok?.kind === 'string') {
        d.advance()
        model = valTok.value as string
        modelRange = valTok.range as SourceRange
      } else if (valTok && (valTok.kind === 'identifier' || valTok.kind === 'keyword')) {
        d.advance()
        model = valTok.value as string
        modelRange = valTok.range as SourceRange
      } else {
        d.error('Expected model (string)', valTok)
      }

      continue
    }

    if (key === 'secrets') {
      const refTok = d.advance()

      if (refTok && (refTok.kind === 'identifier' || refTok.kind === 'keyword')) {
        secretsRef = refTok.value as string
        secretsRefRange = { ...refTok.range }
      }

      continue
    }

    if (key === 'system') {
      const vt = d.peek()
      const cv = vt ? d.parseConfigValue(vt) : undefined

      if (cv?.kind === 'ts_block') {
        systemCode = cv.code
        systemCodeRange = cv.innerRange
      } else {
        d.error('Expected @ts block for system:', vt)
      }

      continue
    }

    if (key === 'temperature') {
      // The value token is captured before parsing so the range points at the
      // number itself; `temperature` and `maxTokens` now carry range
      // diagnostics, and a range on the following token underlines the wrong
      // thing in the editor.
      const vt = d.peek()
      const val = d.parseValue()

      if (typeof val === 'number') {
        temperature = val
        temperatureRange = vt?.range ?? modelRange
      }

      continue
    }

    if (key === 'maxTokens') {
      const vt = d.peek()
      const val = d.parseValue()

      if (typeof val === 'number') {
        maxTokens = val
        maxTokensRange = vt?.range ?? modelRange
      }

      continue
    }

    if (key === 'maxSteps') {
      const vt = d.peek()
      const val = d.parseValue()

      if (typeof val === 'number') {
        maxSteps = val
        maxStepsRange = vt?.range ?? modelRange
      }

      continue
    }

    if (key === 'tools') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        tools = parsedList.names
        toolsRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'skills') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        skills = parsedList.names
        skillsRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'mcp') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        mcp = parsedList.names
        mcpRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'team') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        team = parsedList.names
        teamRanges = parsedList.ranges
      }

      continue
    }

    if (key === 'disks') {
      const parsedList = parseIdentifierList(d)

      if (parsedList) {
        disks = parsedList.names
        disksRanges = parsedList.ranges
        disksRange = parsedList.range
      }

      continue
    }

    if (key === 'computer') {
      const ref = parseComputerRef(d, keyTok)
      computer = ref.name
      computerRange = ref.range
      continue
    }

    if (key === 'sandbox') {
      const vs = d.peek()

      if (!vs) {
        break
      }

      const decl = parseSandboxDecl(d, vs)

      if (decl) {
        sandbox = decl
      }

      continue
    }

    if (key === 'wallet') {
      const vs = d.peek()

      if (!vs) {
        break
      }

      const decl = parseWalletDecl(d, vs)

      if (decl) {
        wallet = decl
      }

      continue
    }

    if (key === 'suggestions') {
      const vs = d.peek()

      if (!vs) {
        break
      }

      const parsedSuggestions = parseSuggestionsDecl(d, vs)

      if (parsedSuggestions) {
        suggestions = parsedSuggestions
      }

      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  const trimmedProvider = provider.trim()
  const providerOmitted = trimmedProvider === ''

  return {
    name: nameTok.value as string,
    label,
    description,
    provider: providerOmitted ? DEFAULT_AGENT_PROVIDER : trimmedProvider,
    providerRange: providerOmitted ? undefined : providerRange,
    model,
    modelRange,
    secretsRef,
    secretsRefRange,
    systemCode,
    systemCodeRange,
    temperature,
    temperatureRange,
    maxTokens,
    maxTokensRange,
    maxSteps,
    maxStepsRange,
    tools,
    toolsRanges,
    skills,
    skillsRanges,
    mcp,
    mcpRanges,
    team,
    teamRanges,
    disks,
    disksRanges,
    disksRange,
    computer,
    computerRange,
    sandbox,
    wallet,
    context,
    suggestions,
    profiles,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
