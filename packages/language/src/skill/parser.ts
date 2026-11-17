/**
 * Parsing for `skill` top-level blocks. Called from the main parser via delegation.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { SkillDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

export function parseSkillBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): SkillDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'skill') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected skill block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let skillName: string | undefined
  let skillNameRange: SourceRange | undefined

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

    if (key === 'name') {
      const valTok = d.peek()
      if (valTok?.kind === 'string') {
        d.advance()
        skillName = valTok.value as string
        skillNameRange = valTok.range
      } else {
        d.error('Expected quoted skill name after name:', valTok)
      }
      continue
    }

    d.error(`Unknown skill property "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  if (!skillName?.trim()) {
    d.error('Skill block requires name: "..."', end ?? nameTok)
    return null
  }

  return {
    name: nameTok.value as string,
    skillName: skillName.trim(),
    skillNameRange: skillNameRange ?? nameTok.range,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
