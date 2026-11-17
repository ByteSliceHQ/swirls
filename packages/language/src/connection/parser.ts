/**
 * Parsing for `connection` top-level blocks.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { ConnectionDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseBarewordValue(
  d: ResourceParserDelegate,
): { value: string; range: SourceRange } | null {
  const tok = d.peek()
  if (!tok) {
    return null
  }
  if (
    tok.kind === 'identifier' ||
    tok.kind === 'keyword' ||
    tok.kind === 'string'
  ) {
    d.advance()
    return { value: tok.value as string, range: tok.range as SourceRange }
  }
  return null
}

export function parseConnectionBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): ConnectionDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'connection') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected connection name', nameTok)
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
  let provider: string | undefined
  let providerRange: SourceRange | undefined
  let baseUrl: string | undefined
  let baseUrlRange: SourceRange | undefined
  let authRef: string | undefined
  let authRefRange: SourceRange | undefined
  let networkRef: string | undefined
  let networkRefRange: SourceRange | undefined
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
      d.error(`Duplicate connection property "${key}"`, keyTok)
    }
    seenKeys.add(key)

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
      const parsed = parseBarewordValue(d)
      if (parsed) {
        provider = parsed.value
        providerRange = parsed.range
      } else {
        d.error('connection provider must be a name', d.peek())
      }
      continue
    }

    if (key === 'base_url') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        baseUrl = val
        baseUrlRange = valTok?.range as SourceRange | undefined
      } else {
        d.error('connection base_url must be a quoted string', d.peek())
      }
      continue
    }

    if (key === 'auth') {
      const parsed = parseBarewordValue(d)
      if (parsed) {
        authRef = parsed.value
        authRefRange = parsed.range
      } else {
        d.error('connection auth must be an auth block name', d.peek())
      }
      continue
    }

    if (key === 'network') {
      const parsed = parseBarewordValue(d)
      if (parsed) {
        networkRef = parsed.value
        networkRefRange = parsed.range
      } else {
        d.error('connection network must be a network block name', d.peek())
      }
      continue
    }

    const valueTok = d.peek()
    d.error(`Unknown connection property "${key}"`, valueTok)
    d.parseValue()
  }

  const closing = d.expect('rbrace')
  if (!closing) {
    // Anchor the error to a real token (`d.peek()` is null at EOF, which the
    // delegate would silently drop). `start` always exists here.
    d.error('Expected } to close connection block', d.peek() ?? start)
  }
  const end = closing ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    description,
    docComment,
    provider: provider ?? '',
    providerRange,
    baseUrl,
    baseUrlRange,
    authRef,
    authRefRange,
    networkRef,
    networkRefRange,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
