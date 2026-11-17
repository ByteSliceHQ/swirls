/**
 * Parsing for `query` top-level blocks.
 */

import type { ConfigValue, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { QueryDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

export function parseQueryBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): QueryDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'query') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected query name', nameTok)
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
  let enabled: boolean | undefined
  let database: string | undefined
  let databaseRange: SourceRange | undefined
  let sql: ConfigValue | undefined

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

    if (key === 'database') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined
      if (cv?.kind === 'string') {
        database = cv.value
        databaseRange = cv.range
      } else {
        d.error(
          'query database must be a database block name (identifier or string)',
          peeked ?? d.peek(),
        )
      }
      continue
    }

    if (key === 'sql') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined
      if (cv) {
        sql = cv
      }
      continue
    }

    if (key === 'label') {
      const v = d.parseValue()
      if (typeof v === 'string') {
        label = v
      }
      continue
    }

    if (key === 'description') {
      const v = d.parseValue()
      if (typeof v === 'string') {
        description = v
      }
      continue
    }

    if (key === 'enabled') {
      const v = d.parseValue()
      if (typeof v === 'boolean') {
        enabled = v
      }
      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  const name = nameTok.value as string

  return {
    name,
    label: label || name,
    description,
    docComment,
    enabled,
    database: database ?? '',
    databaseRange,
    sql,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
