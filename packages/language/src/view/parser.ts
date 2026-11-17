/**
 * Parsing functions for view blocks. Called from the main parser via delegation.
 */

import type { ConfigValue, JsonBlockInfo, JsonSchemaLiteral, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { ViewComputedColumnDecl, ViewDecl, ViewStreamRef } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseSchemaTail(
  d: ResourceParserDelegate,
): Pick<ViewDecl, 'schema' | 'schemaBlock' | 'schemaRef' | 'schemaRefRange'> {
  let schema: JsonSchemaLiteral | undefined
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

function parseStreamsList(d: ResourceParserDelegate): ViewStreamRef[] {
  const refs: ViewStreamRef[] = []
  const peeked = d.peek()
  const cv = peeked ? d.parseConfigValue(peeked) : undefined

  if (!cv) {
    d.error('Expected streams: [stream_name, ...]', d.peek())
    return refs
  }

  if (cv.kind === 'string') {
    refs.push({ name: cv.value, range: cv.range })
    return refs
  }

  if (cv.kind !== 'array') {
    d.error('view streams must be a list of stream names (e.g. streams: [my_stream])', peeked)
    return refs
  }

  for (const entry of cv.value) {
    if (entry.kind === 'string') {
      refs.push({ name: entry.value, range: entry.range })
    } else {
      d.error('view streams entries must be stream names', peeked)
    }
  }

  return refs
}

function parseComputedColumnBody(
  d: ResourceParserDelegate,
): Omit<ViewComputedColumnDecl, 'name' | 'range'> {
  let workflowName = ''
  let workflowNameRange: SourceRange | undefined
  let input: ConfigValue | undefined
  let output: ConfigValue | undefined

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

    if (key === 'graph' || key === 'workflow') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv?.kind === 'string') {
        workflowName = cv.value
        workflowNameRange = cv.range
      } else {
        d.error(
          'computed column graph must be a workflow name (identifier or string)',
          peeked ?? d.peek(),
        )
      }

      continue
    }

    if (key === 'input') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv) {
        input = cv
      }

      continue
    }

    if (key === 'output') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv) {
        output = cv
      }

      continue
    }

    d.error(
      `Unexpected key "${key}" in computed column block — only graph, input, and output are allowed`,
      d.peek(),
    )

    d.parseValue()
  }

  return { workflowName, workflowNameRange, input, output }
}

function parseComputedBlock(d: ResourceParserDelegate): ViewComputedColumnDecl[] {
  const columns: ViewComputedColumnDecl[] = []

  if (!d.expect('lbrace')) {
    d.error('Expected { after computed', d.peek())
    return columns
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

    const nameTok = d.advance()

    if (!nameTok || (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')) {
      d.error('Expected computed column name in computed block', nameTok ?? d.peek())
      d.parseValue()
      continue
    }

    if (!d.expect('lbrace')) {
      d.error('Expected { after computed column name', d.peek())
      break
    }

    const inner = parseComputedColumnBody(d)
    const innerEnd = d.expect('rbrace') ?? nameTok

    columns.push({
      name: nameTok.value as string,
      range: rangeFromTokens(nameTok, innerEnd ?? nameTok),
      ...inner,
    })
  }

  d.expect('rbrace')

  return columns
}

export function parseViewBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): ViewDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'view') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected view name', nameTok)
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
  let streams: ViewStreamRef[] = []
  let schema: JsonSchemaLiteral | undefined
  let schemaBlock: JsonBlockInfo | undefined
  let schemaRef: string | undefined
  let schemaRefRange: SourceRange | undefined
  let columns: ConfigValue | undefined
  let computed: ViewComputedColumnDecl[] = []

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

    // `computed { ... }` is a block (no colon); everything else is `key: value`.
    if (key === 'computed') {
      const next = d.peek()

      if (next?.kind === 'colon') {
        d.advance()
      }

      computed = parseComputedBlock(d)
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'streams') {
      streams = parseStreamsList(d)
      continue
    }

    if (key === 'schema') {
      const parsed = parseSchemaTail(d)
      schema = parsed.schema
      schemaBlock = parsed.schemaBlock
      schemaRef = parsed.schemaRef
      schemaRefRange = parsed.schemaRefRange
      continue
    }

    if (key === 'columns') {
      const peeked = d.peek()
      const cv = peeked ? d.parseConfigValue(peeked) : undefined

      if (cv) {
        columns = cv
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
    streams,
    schema,
    schemaBlock,
    schemaRef,
    schemaRefRange,
    columns,
    computed,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
