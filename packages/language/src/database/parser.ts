/**
 * Parsing functions for `database` and `migration` blocks. Called from the main
 * parser via delegation, mirroring the postgres/view resource parsers.
 */

import type { ConfigValue, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  DatabaseConnectionDecl,
  DatabaseDecl,
  MigrationDecl,
  PrismaBlockInfo,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

/** Skip a nested `keyword name { ... }` block starting at the current keyword token. */
function skipNamedNestedBlock(d: ResourceParserDelegate): void {
  d.advance()
  d.advance()
  if (!d.expect('lbrace')) {
    return
  }
  let depth = 1
  while (!d.eof() && depth > 0) {
    const t = d.advance()
    if (!t) {
      break
    }
    if (t.kind === 'lbrace') {
      depth++
    } else if (t.kind === 'rbrace') {
      depth--
    }
  }
}

function parseDatabaseConnectionDecl(
  d: ResourceParserDelegate,
): DatabaseConnectionDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'connection') {
    return null
  }

  const nameTok = d.advance()
  if (
    !nameTok ||
    (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')
  ) {
    d.error('Expected connection name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after connection name', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let description: string | undefined

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

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    description,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}

export function parseDatabaseBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): DatabaseDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'database') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected database block name', nameTok)
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
  let schemaSource = ''
  let schemaBlock: PrismaBlockInfo | undefined
  const connections: DatabaseConnectionDecl[] = []

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (t.kind === 'keyword' && t.value === 'role') {
      d.error(
        'Nested "role" blocks were removed; use "connection <name> { }" inside database blocks instead',
        t,
      )
      skipNamedNestedBlock(d)
      continue
    }

    if (t.kind === 'keyword' && t.value === 'connection') {
      const connectionDecl = parseDatabaseConnectionDecl(d)
      if (connectionDecl) {
        connections.push(connectionDecl)
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

    if (key === 'description') {
      const v = d.parseValue()
      if (typeof v === 'string') {
        description = v
      }
      continue
    }

    if (key === 'schema') {
      const next = d.peek()
      if (next?.kind === 'fenced_block' && next.fencedLang === 'prisma') {
        const tok = d.advance()!
        schemaSource = tok.fencedContent ?? ''
        if (tok.fencedContentRange) {
          schemaBlock = {
            content: schemaSource,
            contentRange: {
              start: { ...tok.fencedContentRange.start },
              end: { ...tok.fencedContentRange.end },
            },
          }
        }
      } else {
        d.error('database schema must be an @prisma { } block', next)
      }
      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    description,
    docComment,
    schemaSource,
    schemaBlock,
    connections,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}

export function parseMigrationBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): MigrationDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'migration') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected migration block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let database = ''
  let databaseRange: SourceRange | undefined
  // NaN marks "no order declared"; the validator requires a non-negative integer.
  let order = Number.NaN
  let operation: ConfigValue | undefined

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
      const refTok = d.advance()
      if (
        refTok &&
        (refTok.kind === 'identifier' || refTok.kind === 'keyword')
      ) {
        database = refTok.value as string
        databaseRange = { ...refTok.range }
      } else {
        d.error('migration database must be a database block name', refTok)
      }
      continue
    }

    if (key === 'order') {
      const v = d.parseValue()
      if (typeof v === 'number') {
        order = v
      } else {
        d.error('migration order must be a number', d.peek())
      }
      continue
    }

    if (key === 'operation') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined
      if (cv) {
        operation = cv
      }
      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    database,
    databaseRange: databaseRange ?? { ...start.range },
    order,
    operation,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
