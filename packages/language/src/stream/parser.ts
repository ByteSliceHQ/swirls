/**
 * Parsing functions for stream blocks. Called from the main parser via delegation.
 */

import type { ConfigValue, JsonBlockInfo, JsonSchemaLiteral, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { StreamDecl, StreamVersionDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseSchemaTail(
  d: ResourceParserDelegate,
): Pick<StreamVersionDecl, 'schema' | 'schemaBlock' | 'schemaRef' | 'schemaRefRange'> {
  let schema: Record<string, unknown> | undefined
  let schemaBlock: JsonBlockInfo | undefined
  let schemaRef: string | undefined
  let schemaRefRange: SourceRange | undefined

  const next = d.peek()

  if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
    const tok = d.advance()!
    let parsed: JsonSchemaLiteral = {}

    try {
      parsed = JSON.parse(tok.fencedContent ?? '{}') as Record<string, unknown>
    } catch {
      d.error('Invalid JSON in schema block', tok)
    }

    schema = parsed

    if (tok.fencedContentRange) {
      schemaBlock = {
        code: tok.fencedContent ?? '',
        innerRange: {
          start: { ...tok.fencedContentRange.start },
          end: { ...tok.fencedContentRange.end },
        },
      }
    }
  } else if (next?.kind === 'identifier') {
    const idTok = d.advance()!
    schemaRef = idTok.value as string
    schemaRefRange = { ...idTok.range }
  }

  return { schema, schemaBlock, schemaRef, schemaRefRange }
}

function parseStreamVersionBody(
  d: ResourceParserDelegate,
): Omit<StreamVersionDecl, 'key' | 'range'> {
  let schema: StreamVersionDecl['schema']
  let schemaBlock: JsonBlockInfo | undefined
  let schemaRef: string | undefined
  let schemaRefRange: SourceRange | undefined
  let condition: ConfigValue | undefined
  let prepare: ConfigValue | undefined

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
      const parsed = parseSchemaTail(d)
      schema = parsed.schema
      schemaBlock = parsed.schemaBlock
      schemaRef = parsed.schemaRef
      schemaRefRange = parsed.schemaRefRange
      continue
    }

    if (key === 'condition') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv) {
        condition = cv
      }

      continue
    }

    if (key === 'prepare') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv) {
        prepare = cv
      }

      continue
    }

    d.error(
      `Unexpected key "${key}" in stream versions block — only schema, condition, and prepare are allowed`,
      d.peek(),
    )

    d.parseValue()
  }

  return { schema, schemaBlock, schemaRef, schemaRefRange, condition, prepare }
}

function parseVersionsBlock(d: ResourceParserDelegate): StreamVersionDecl[] {
  const versions: StreamVersionDecl[] = []

  if (!d.expect('lbrace')) {
    d.error('Expected { after versions', d.peek())
    return versions
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

    const verTok = d.advance()

    if (!verTok || verTok.kind !== 'identifier') {
      d.error('Expected version key (v1, v2, ...) in versions block', verTok ?? d.peek())
      d.parseValue()
      continue
    }

    const verStartTok = verTok

    if (!d.expect('lbrace')) {
      d.error('Expected { after stream version key', d.peek())
      break
    }

    const inner = parseStreamVersionBody(d)
    const innerEnd = d.expect('rbrace') ?? verStartTok

    versions.push({
      key: verStartTok.value as string,
      range: rangeFromTokens(verStartTok, innerEnd ?? verStartTok),
      ...inner,
    })
  }

  d.expect('rbrace')

  return versions
}

/** Parse bareword after `:` (same as stream `graph:` refs). */
function parseBareVersionPointer(d: ResourceParserDelegate): {
  version: string
  versionRange: SourceRange
} | null {
  const valTok = d.advance()

  if (!valTok || valTok.kind !== 'identifier') {
    d.error('Expected stream version identifier (e.g. v1)', valTok ?? d.peek())
    return null
  }

  return {
    version: valTok.value as string,
    versionRange: { ...valTok.range },
  }
}

export function parseStreamBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): StreamDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'stream') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected stream name', nameTok)
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
  let workflowName = ''
  let workflowNameRange: SourceRange | undefined
  let version = ''
  let versionRange: SourceRange | undefined
  let versions: StreamVersionDecl[] = []

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

    if (key === 'schema' || key === 'condition' || key === 'prepare') {
      d.error(
        `top-level "${key}" is invalid on stream blocks — use versions { v1 { schema, condition?, prepare } }`,
        t,
      )

      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      // If parseConfigValue could not consume (e.g. bad token), swallow with parseValue
      if (!cv) {
        d.parseValue()
      }

      continue
    }

    if (key === 'version') {
      const vp = parseBareVersionPointer(d)

      if (vp) {
        version = vp.version
        versionRange = vp.versionRange
      }

      continue
    }

    if (key === 'versions') {
      versions = parseVersionsBlock(d)
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

    if (key === 'graph' || key === 'workflow') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv?.kind === 'string') {
        workflowName = cv.value
        workflowNameRange = cv.range
      } else {
        d.error(
          'stream workflow must be a workflow name (identifier or string)',
          peeked ?? d.peek(),
        )
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
    version,
    versionRange,
    versions,
    workflowName,
    workflowNameRange,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
