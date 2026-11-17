/**
 * Parsing functions for postgres blocks. Called from the main parser via delegation.
 */

import type { JsonBlockInfo, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { PostgresDecl, PostgresTableDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseTableDecl(d: ResourceParserDelegate): PostgresTableDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'table') {
    return null
  }

  const nameTok = d.advance()
  if (
    !nameTok ||
    (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')
  ) {
    d.error('Expected table name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after table name', d.peek())
    d.skipToNextBlock()
    return null
  }

  let schema: Record<string, unknown> | undefined
  let schemaBlock: JsonBlockInfo | undefined

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

    if (key === 'schema') {
      const next = d.peek()
      if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
        const tok = d.advance()!
        try {
          schema = JSON.parse(tok.fencedContent ?? '{}') as Record<
            string,
            unknown
          >
        } catch {
          d.error('Invalid JSON in table schema block', tok)
        }

        if (tok.fencedContentRange) {
          schemaBlock = {
            code: tok.fencedContent ?? '',
            innerRange: {
              start: { ...tok.fencedContentRange.start },
              end: { ...tok.fencedContentRange.end },
            },
          }
        }
        continue
      }
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    schema: schema ?? {},
    schemaBlock,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}

export function parsePostgresBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): PostgresDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'postgres') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected postgres block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let secretsRef: string | undefined
  let secretsRefRange: SourceRange | undefined
  let connection = ''
  let connectionIsLiteral = false
  let connectionRange: SourceRange | undefined
  let networkRef: string | undefined
  let networkRefRange: SourceRange | undefined
  const tables: PostgresTableDecl[] = []

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'keyword' && t.value === 'table') {
      const tableDecl = parseTableDecl(d)
      if (tableDecl) {
        tables.push(tableDecl)
      }
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

    if (key === 'label') {
      const v = d.parseValue()
      if (typeof v === 'string') {
        label = v
      }
      continue
    }

    if (key === 'secrets') {
      const refTok = d.advance()
      if (
        refTok &&
        (refTok.kind === 'identifier' || refTok.kind === 'keyword')
      ) {
        secretsRef = refTok.value as string
        secretsRefRange = { ...refTok.range }
      }
      continue
    }

    if (key === 'connection') {
      const valTok = d.peek()
      if (valTok?.kind === 'string') {
        d.advance()
        connection = valTok.value as string
        connectionIsLiteral = true
        connectionRange = valTok.range
      } else if (
        valTok &&
        (valTok.kind === 'identifier' || valTok.kind === 'keyword')
      ) {
        d.advance()
        connection = valTok.value as string
        connectionIsLiteral = false
        connectionRange = valTok.range
      } else {
        d.error('Expected connection value (identifier or string)', valTok)
      }
      continue
    }

    if (key === 'network') {
      const valueToken = d.peek()
      if (
        valueToken &&
        (valueToken.kind === 'identifier' || valueToken.kind === 'keyword')
      ) {
        d.advance()
        networkRef = valueToken.value as string
        networkRefRange = valueToken.range
      } else {
        d.error('Postgres network must be a network block name', valueToken)
        d.parseValue()
      }
      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    secretsRef,
    secretsRefRange,
    connection,
    connectionIsLiteral,
    connectionRange: connectionRange ?? start.range,
    networkRef,
    networkRefRange,
    tables,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
