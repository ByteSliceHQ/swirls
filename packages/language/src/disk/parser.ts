/**
 * Parsing for `disk` top-level blocks. Called from the main parser via delegation.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { DiskDecl } from './ast'

const REMOVED_DISK_KEYS = new Set(['id', 'secrets'])

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

export function parseDiskBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): DiskDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'disk') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected disk block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let region: string | undefined
  let regionRange: SourceRange | undefined

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

    if (REMOVED_DISK_KEYS.has(key)) {
      d.error(
        `Disk block no longer accepts "${key}:" — the platform provisions Archil disks at deploy time`,
        t,
      )

      d.parseValue()
      continue
    }

    if (key === 'label') {
      const v = d.parseValue()

      if (typeof v === 'string') {
        label = v
      }

      continue
    }

    if (key === 'region') {
      const valTok = d.peek()

      if (valTok?.kind === 'string') {
        d.advance()
        region = valTok.value as string
        regionRange = valTok.range
      } else if (valTok && (valTok.kind === 'identifier' || valTok.kind === 'keyword')) {
        d.advance()
        region = valTok.value as string
        regionRange = valTok.range
      } else {
        d.error('Expected region (string or identifier)', valTok)
      }

      continue
    }

    d.error(`Unknown disk property "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    region,
    regionRange,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
