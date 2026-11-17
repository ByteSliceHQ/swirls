/**
 * Parsing for `mcp` top-level blocks. Called from the main parser via delegation.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { McpAuthMode, McpDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

export function parseMcpBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): McpDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'mcp') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected mcp block name', nameTok)
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
  let url: string | undefined
  let urlRange: SourceRange | undefined
  let auth: McpAuthMode | undefined
  let authRange: SourceRange | undefined
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
      d.error(`Duplicate mcp property "${key}"`, keyTok)
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

    if (key === 'url') {
      const valTok = d.peek()
      const val = d.parseValue()

      if (typeof val === 'string') {
        url = val
        urlRange = valTok?.range
      }

      continue
    }

    if (key === 'auth') {
      const valTok = d.peek()

      // Bare identifier: auth: static | auth: interactive
      if (valTok?.kind === 'identifier') {
        d.advance()
        const raw = valTok.value as string

        if (raw === 'static' || raw === 'interactive') {
          auth = raw
          authRange = valTok.range
        } else {
          d.error(`MCP auth must be "static" or "interactive", got "${raw}"`, valTok)
        }

        continue
      }

      const val = d.parseValue()

      if (typeof val === 'string') {
        if (val === 'static' || val === 'interactive') {
          auth = val
          authRange = valTok?.range
        } else {
          d.error(`MCP auth must be "static" or "interactive", got ${JSON.stringify(val)}`, valTok)
        }
      } else {
        d.error('Expected auth: static or auth: interactive', valTok)
      }

      continue
    }

    if (key === 'network') {
      const valueToken = d.peek()

      if (valueToken && (valueToken.kind === 'identifier' || valueToken.kind === 'keyword')) {
        d.advance()
        networkRef = valueToken.value as string
        networkRefRange = valueToken.range
      } else {
        d.error('MCP network must be a network block name', valueToken)
        d.parseValue()
      }

      continue
    }

    const valueTok = d.peek()
    d.error(`Unknown mcp property "${key}"`, valueTok)
    d.parseValue()
  }

  const closing = d.expect('rbrace')

  if (!closing) {
    // Anchor the error to a real token (`d.peek()` is null at EOF, which the
    // delegate would silently drop). `start` always exists here.
    d.error('Expected } to close mcp block', d.peek() ?? start)
  }

  const end = closing ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    labelRange,
    description,
    descriptionRange,
    url: url ?? '',
    urlRange,
    auth,
    authRange,
    networkRef,
    networkRefRange,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
