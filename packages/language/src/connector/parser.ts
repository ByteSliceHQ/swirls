/**
 * Parsing for `connector` top-level blocks. Called from the main parser via
 * delegation.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { ConnectorDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

export function parseConnectorBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): ConnectorDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'connector') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected connector block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let labelRange: SourceRange | undefined
  let description: string | undefined
  let descriptionRange: SourceRange | undefined
  const seenKeys = new Set<string>()

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
    if (!key) {
      break
    }

    if (seenKeys.has(key)) {
      d.error(`Duplicate connector property "${key}"`, keyTok)
    }
    seenKeys.add(key)

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'label') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        label = val
        labelRange = valTok?.range
      }
      continue
    }

    if (key === 'description') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        description = val
        descriptionRange = valTok?.range
      }
      continue
    }

    const valueTok = d.peek()
    d.error(`Unknown connector property "${key}"`, valueTok)
    d.parseValue()
  }

  const closing = d.expect('rbrace')
  if (!closing) {
    // Anchor the error to a real token (`d.peek()` is null at EOF, which the
    // delegate would silently drop). `start` always exists here.
    d.error('Expected } to close connector block', d.peek() ?? start)
  }
  const end = closing ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    labelRange,
    description,
    descriptionRange,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
