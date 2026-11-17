/**
 * Parsing for `channel` top-level blocks.
 */

import type { SourceRange } from '../ast'
import { DURATION_SYNTAX_HINT, DURATION_UNIT_SECONDS } from '../duration'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { ChannelDecl, ChannelMode, ChannelPlatform } from './ast'
import { CHANNEL_MODES, CHANNEL_PLATFORMS } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function isChannelPlatform(value: string): value is ChannelPlatform {
  return (CHANNEL_PLATFORMS as readonly string[]).includes(value)
}

function isChannelMode(value: string): value is ChannelMode {
  return (CHANNEL_MODES as readonly string[]).includes(value)
}

function parseEnumOrStringValue(
  d: ResourceParserDelegate,
): { value: string; range?: SourceRange } | null {
  const tok = d.peek()

  if (tok && (tok.kind === 'identifier' || tok.kind === 'keyword')) {
    d.advance()
    return { value: tok.value as string, range: tok.range as SourceRange }
  }

  if (tok?.kind === 'string') {
    d.advance()
    return { value: tok.value as string, range: tok.range as SourceRange }
  }

  return null
}

/**
 * Read a duration value written as a quoted literal (`"30m"`).
 *
 * The RFC's unquoted spelling is not lexable as a single token: `30m` arrives
 * as the number `30` followed by the identifier `m`. Left alone, the stray
 * identifier is taken for the next property key and the block fails several
 * lines later with a bewildering "Expected :", so the unit is consumed here and
 * the diagnostic names the quoting, which is the mistake the author made.
 */
function parseDurationValue(
  d: ResourceParserDelegate,
  key: string,
): { value: string; range?: SourceRange } | null {
  const tok = d.peek()

  if (tok?.kind === 'string' && typeof tok.value === 'string') {
    d.advance()
    return { value: tok.value, range: tok.range }
  }

  if (tok?.kind === 'number') {
    d.advance()
    const unitTok = d.peek()

    if (
      unitTok?.kind === 'identifier' &&
      Object.hasOwn(DURATION_UNIT_SECONDS, String(unitTok.value))
    ) {
      d.advance()

      d.error(
        `channel ${key} must be ${DURATION_SYNTAX_HINT} — quote it as "${tok.value}${unitTok.value}"`,
        tok,
      )

      return null
    }

    d.error(`channel ${key} must be ${DURATION_SYNTAX_HINT}`, tok)
    return null
  }

  d.error(`channel ${key} must be ${DURATION_SYNTAX_HINT}`, tok)
  d.parseValue()
  return null
}

export function parseChannelBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): ChannelDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'channel') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected channel name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label = ''
  let description: string | undefined
  let platform: ChannelPlatform | undefined
  let platformRange: SourceRange | undefined
  let agent: string | undefined
  let agentRange: SourceRange | undefined
  let workflows: string[] | undefined
  let workflowsRange: SourceRange | undefined
  let workflowsRanges: SourceRange[] | undefined
  let enabled: boolean | undefined
  let connection: string | undefined
  let connectionRange: SourceRange | undefined
  let connector: string | undefined
  let connectorRange: SourceRange | undefined
  let mode: ChannelMode = 'mention'
  let modeRange: SourceRange | undefined
  let engagementTimeout: string | undefined
  let engagementTimeoutRange: SourceRange | undefined
  let cooldown: string | undefined
  let cooldownRange: SourceRange | undefined
  let maxUnpromptedPerHour: number | undefined
  let maxUnpromptedPerHourRange: SourceRange | undefined

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    const valueTok = d.peek()

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

    if (key === 'platform') {
      const parsed = parseEnumOrStringValue(d)

      if (parsed?.value === 'portal') {
        d.error('channel platform "portal" was renamed to "swirls"', d.peek())
      } else if (parsed && isChannelPlatform(parsed.value)) {
        platform = parsed.value
        platformRange = parsed.range
      } else {
        d.error(`channel platform must be one of ${CHANNEL_PLATFORMS.join(', ')}`, d.peek())
      }

      continue
    }

    if (key === 'agent') {
      const parsed = parseEnumOrStringValue(d)

      if (parsed) {
        agent = parsed.value
        agentRange = parsed.range
      }

      continue
    }

    if (key === 'workflows') {
      const startList = d.expect('lbracket')

      if (!startList) {
        d.error('channel workflows must be an array of workflow names', valueTok)
        d.parseValue()
        continue
      }

      workflows = []
      workflowsRanges = []

      while (!d.eof() && d.peek()?.kind !== 'rbracket') {
        if (d.peek()?.kind === 'block_comment') {
          d.advance()
          continue
        }

        const name = parseEnumOrStringValue(d)

        if (!name) {
          d.error('Expected a workflow name', d.peek())
          d.parseValue()
          break
        }

        workflows.push(name.value)

        if (name.range) {
          workflowsRanges.push(name.range)
        }

        d.expect('comma')
      }

      const endList = d.expect('rbracket')

      if (!endList) {
        d.error('Expected ] after workflows', d.peek())
      }

      workflowsRange = rangeFromTokens(startList, endList ?? startList)
      continue
    }

    if (key === 'enabled') {
      const val = d.parseValue()

      if (typeof val === 'boolean') {
        enabled = val
      }

      continue
    }

    if (key === 'connection') {
      const parsed = parseEnumOrStringValue(d)

      if (parsed) {
        connection = parsed.value
        connectionRange = parsed.range
      } else {
        d.error('channel connection must be a connection block name', d.peek())
      }

      continue
    }

    if (key === 'connector') {
      const parsed = parseEnumOrStringValue(d)

      if (parsed) {
        connector = parsed.value
        connectorRange = parsed.range
      } else {
        d.error('channel connector must be a connector block name', d.peek())
      }

      continue
    }

    if (key === 'mode') {
      const parsed = parseEnumOrStringValue(d)

      if (parsed && isChannelMode(parsed.value)) {
        mode = parsed.value
        modeRange = parsed.range
      } else {
        d.error('channel mode must be mention, dm, all, or ambient', d.peek())
      }

      continue
    }

    if (key === 'engagement_timeout') {
      const parsed = parseDurationValue(d, key)

      if (parsed) {
        engagementTimeout = parsed.value
        engagementTimeoutRange = parsed.range
      }

      continue
    }

    if (key === 'cooldown') {
      const parsed = parseDurationValue(d, key)

      if (parsed) {
        cooldown = parsed.value
        cooldownRange = parsed.range
      }

      continue
    }

    if (key === 'max_unprompted_per_hour') {
      const val = d.parseValue()

      if (typeof val === 'number') {
        maxUnpromptedPerHour = val
        maxUnpromptedPerHourRange = valueTok?.range
      } else {
        d.error('channel max_unprompted_per_hour must be a whole number of 0 or more', valueTok)
      }

      continue
    }

    d.error(`Unknown channel property "${key}"`, valueTok)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  if (!platform) {
    d.error('channel must declare platform', start)
  }

  if (!agent && platform !== 'mcp') {
    d.error('channel must declare agent', start)
  }

  if (platform === 'mcp' && !agent && !workflows?.length) {
    d.error('MCP channel must declare an agent or a non-empty workflows list', start)
  }

  return {
    name: nameTok.value as string,
    label,
    description,
    docComment,
    platform: platform ?? 'slack',
    platformRange,
    agent,
    agentRange,
    workflows,
    workflowsRange,
    workflowsRanges,
    enabled,
    connection,
    connectionRange,
    connector,
    connectorRange,
    mode,
    modeRange,
    engagementTimeout,
    engagementTimeoutRange,
    cooldown,
    cooldownRange,
    maxUnpromptedPerHour,
    maxUnpromptedPerHourRange,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
