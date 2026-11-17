/**
 * Parsing for top-level `role` and `policy` blocks. Called from the main
 * parser via delegation, mirroring the other resource parsers (secret, agent).
 */

import {
  FILE_RETENTION_SYNTAX_HINT,
  type FileRetention,
  parseFileRetentionLiteral,
} from '@swirls/definition/file-values'
import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  ClaimCondition,
  FilePolicySettings,
  PolicyDecl,
  PolicyGrant,
  RoleDecl,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

/** Parse `retention: 30d` or `retention: forever` inside `files { }`. */
function parseRetentionValue(d: ResourceParserDelegate): FileRetention | null {
  const t = d.peek()
  if (!t) {
    return null
  }

  if (t.kind === 'identifier' || t.kind === 'keyword') {
    const literal = String(t.value)
    d.advance()
    return parseFileRetentionLiteral(literal)
  }

  if (t.kind === 'number') {
    const numTok = d.advance()
    if (!numTok) {
      return null
    }
    const unitTok = d.peek()
    if (!unitTok || unitTok.kind !== 'identifier' || unitTok.value !== 'd') {
      d.error(
        `Expected day unit after retention amount (${FILE_RETENTION_SYNTAX_HINT})`,
        unitTok ?? numTok,
      )
      return null
    }
    d.advance()
    return parseFileRetentionLiteral(`${numTok.value}d`)
  }

  if (t.kind === 'string') {
    const literal = String(t.value)
    d.advance()
    return parseFileRetentionLiteral(literal)
  }

  d.error(`Expected file retention (${FILE_RETENTION_SYNTAX_HINT})`, t)
  return null
}

/** Parse `files { retention: 30d }` nested in a policy block. */
function parseFilesBlock(
  d: ResourceParserDelegate,
  startTok: Token,
): FilePolicySettings | null {
  if (!d.expect('lbrace')) {
    d.error('Expected { after files', d.peek())
    d.skipToNextBlock()
    return null
  }

  let retention: FileRetention | undefined
  let retentionRange: SourceRange | undefined
  let endTok: Token = startTok

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key || !keyTok) {
      break
    }

    if (key !== 'retention') {
      d.error('Only retention is supported inside policy.files', keyTok)
      d.parseValue()
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected : after retention', d.peek())
      break
    }

    const valueTok = d.peek()
    if (!valueTok) {
      break
    }

    const parsed = parseRetentionValue(d)
    if (parsed) {
      retention = parsed
      retentionRange = rangeFromTokens(valueTok, d.peek() ?? valueTok)
    }
  }

  endTok = d.expect('rbrace') ?? endTok

  if (!retention || !retentionRange) {
    d.error('policy.files requires retention', startTok)
    return null
  }

  return {
    retention,
    retentionRange,
    range: rangeFromTokens(startTok, endTok),
  }
}

/** Parse a role's `match { <claim>: <value> }` block into claim conditions. */
function parseMatchBlock(d: ResourceParserDelegate): ClaimCondition[] {
  const conditions: ClaimCondition[] = []

  if (!d.expect('lbrace')) {
    d.error('Expected { after match', d.peek())
    return conditions
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

    const keyTok = d.peek()
    const claim = d.parsePropertyKey()
    if (!claim || !keyTok) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected : after claim key', d.peek())
      break
    }

    const vt = d.peek()
    if (!vt) {
      break
    }

    if (vt.kind === 'identifier' || vt.kind === 'keyword') {
      // Bare-word scalar (e.g. `org_role: admin`).
      d.advance()
      conditions.push({
        claim,
        claimRange: keyTok.range as SourceRange,
        op: 'eq',
        values: [String(vt.value)],
        valueRange: vt.range as SourceRange,
        range: rangeFromTokens(keyTok, vt),
      })
      continue
    }

    const value = d.parseValue()
    if (Array.isArray(value)) {
      // List value => membership ("in").
      conditions.push({
        claim,
        claimRange: keyTok.range as SourceRange,
        op: 'in',
        values: value.map((v) => String(v)),
        valueRange: vt.range as SourceRange,
        range: rangeFromTokens(keyTok, vt),
      })
    } else if (value !== undefined && value !== null) {
      // Scalar string/number/boolean => equality.
      conditions.push({
        claim,
        claimRange: keyTok.range as SourceRange,
        op: 'eq',
        values: [String(value)],
        valueRange: vt.range as SourceRange,
        range: rangeFromTokens(keyTok, vt),
      })
    } else {
      d.error('Expected a value for claim condition', vt)
    }
  }

  d.expect('rbrace')
  return conditions
}

/** Parse `role <name> { description?: …; match { … } }`. */
export function parseRoleBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): RoleDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'role') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected role name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after role name', d.peek())
    d.skipToNextBlock()
    return null
  }

  let description: string | undefined
  let descriptionRange: SourceRange | undefined
  let match: ClaimCondition[] = []

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'keyword' && t.value === 'match') {
      d.advance()
      match = parseMatchBlock(d)
      continue
    }

    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected : after role key', d.peek())
      break
    }

    if (key === 'description') {
      const vt = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        description = val
        descriptionRange = vt?.range as SourceRange | undefined
      }
      continue
    }

    // Unknown key: consume its value so parsing stays aligned.
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    name: nameTok.value as string,
    description,
    descriptionRange,
    match,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}

/** Parse `[ name_a, name_b ]` of bare identifiers (workflow / tool names). */
function parseNameList(
  d: ResourceParserDelegate,
): { names: string[]; ranges: SourceRange[] } | null {
  if (!d.expect('lbracket')) {
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
      d.advance()
      names.push(t.value as string)
      ranges.push(t.range as SourceRange)
    } else {
      d.error('Expected a name (identifier)', t)
      d.skipToNextBlock()
      return null
    }
    d.expect('comma')
  }
  if (!d.expect('rbracket')) {
    d.error('Expected ]', d.peek())
    d.skipToNextBlock()
    return null
  }
  return { names, ranges }
}

/** Parse one `allow|deny <role> -> agent <name>|* { … }` grant. */
function parseGrant(
  d: ResourceParserDelegate,
  effect: 'allow' | 'deny',
): PolicyGrant | null {
  const effectTok = d.advance() // 'allow' | 'deny'
  if (!effectTok) {
    return null
  }

  const roleTok = d.advance()
  if (
    !roleTok ||
    (roleTok.kind !== 'identifier' && roleTok.kind !== 'keyword')
  ) {
    d.error(`Expected role name after \`${effect}\``, roleTok)
    return null
  }

  const arrowTok = d.peek()
  if (!arrowTok || arrowTok.kind !== 'arrow') {
    d.error('Expected `->` after role name', arrowTok)
    return null
  }
  d.advance()

  const agentKw = d.peek()
  if (
    !(
      agentKw &&
      agentKw.kind === 'keyword' &&
      (agentKw.value === 'agent' || agentKw.value === 'workflow')
    )
  ) {
    d.error('Expected `agent` or `workflow` after `->`', agentKw)
    return null
  }
  const isWorkflow = agentKw.value === 'workflow'
  d.advance()

  const agentTok = d.advance()
  let agent: string
  let agentRange: SourceRange
  if (agentTok?.kind === 'star') {
    if (isWorkflow) {
      d.error(
        'Workflow grants must name one workflow; wildcard grants are not supported',
        agentTok,
      )
    }
    agent = '*'
    agentRange = agentTok.range as SourceRange
  } else if (
    agentTok &&
    (agentTok.kind === 'identifier' || agentTok.kind === 'keyword')
  ) {
    agent = agentTok.value as string
    agentRange = agentTok.range as SourceRange
  } else {
    d.error('Expected an agent name or `*`', agentTok)
    return null
  }

  let workflows: string[] | undefined
  let workflowsRanges: SourceRange[] | undefined
  let tools: string[] | undefined
  let toolsRanges: SourceRange[] | undefined
  let endTok: Token = agentTok ?? effectTok

  if (d.peek()?.kind === 'lbrace') {
    if (isWorkflow) {
      d.error('Workflow grants do not accept a body', d.peek())
    }
    d.advance()
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
        d.error('Expected : after grant key', d.peek())
        break
      }
      if (key === 'workflows') {
        const list = parseNameList(d)
        if (list) {
          workflows = list.names
          workflowsRanges = list.ranges
        }
        continue
      }
      if (key === 'tools') {
        const list = parseNameList(d)
        if (list) {
          tools = list.names
          toolsRanges = list.ranges
        }
        continue
      }
      d.parseValue()
    }
    endTok = d.expect('rbrace') ?? endTok
  }

  return {
    effect,
    effectRange: effectTok.range as SourceRange,
    role: roleTok.value as string,
    roleRange: roleTok.range as SourceRange,
    ...(isWorkflow ? { workflow: agent } : { agent }),
    agentRange,
    workflows,
    workflowsRanges,
    tools,
    toolsRanges,
    range: rangeFromTokens(effectTok, endTok),
  }
}

/** Parse `policy { allow <role> -> agent <name> { … } }`. */
export function parsePolicyBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): PolicyDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'policy') {
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after policy', d.peek())
    d.skipToNextBlock()
    return null
  }

  const grants: PolicyGrant[] = []
  let files: FilePolicySettings | undefined
  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }
    if (
      (t.kind === 'keyword' || t.kind === 'identifier') &&
      t.value === 'files'
    ) {
      d.advance()
      const parsed = parseFilesBlock(d, t)
      if (parsed) {
        files = parsed
      }
      continue
    }
    if (t.kind === 'keyword' && (t.value === 'allow' || t.value === 'deny')) {
      const grant = parseGrant(d, t.value)
      if (grant) {
        grants.push(grant)
      }
      continue
    }
    // Unexpected token: report once and skip it to avoid looping.
    d.error('Expected `files`, `allow`, or `deny` in policy block', t)
    d.advance()
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    grants,
    ...(files ? { files } : {}),
    docComment,
    range: rangeFromTokens(start, end ?? start),
  }
}
