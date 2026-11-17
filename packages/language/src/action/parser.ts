/**
 * Parsing for `action` top-level blocks.
 */

import type { JsonBlockInfo, JsonSchemaLiteral, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { ActionDecl } from './ast'

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

  if (tok.kind === 'identifier' || tok.kind === 'keyword' || tok.kind === 'string') {
    d.advance()
    return { value: tok.value as string, range: tok.range as SourceRange }
  }

  return null
}

function parseSchemaField(d: ResourceParserDelegate): {
  schema?: JsonSchemaLiteral
  schemaBlock?: JsonBlockInfo
  schemaRef?: string
  schemaRefRange?: SourceRange
} {
  const next = d.peek()

  if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
    const tok = d.advance()!
    let parsed: JsonSchemaLiteral = {}

    try {
      parsed = JSON.parse(tok.fencedContent ?? '{}') as JsonSchemaLiteral
    } catch {
      d.error('Invalid JSON in schema block', tok)
    }

    const schemaBlock =
      tok.fencedContentRange != null
        ? {
            code: tok.fencedContent ?? '',
            innerRange: {
              start: { ...tok.fencedContentRange.start },
              end: { ...tok.fencedContentRange.end },
            },
          }
        : undefined

    return { schema: parsed, schemaBlock }
  }

  if (next?.kind === 'lbrace') {
    const val = d.parseValue()

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return { schema: val as JsonSchemaLiteral }
    }

    return {}
  }

  if (
    next &&
    (next.kind === 'identifier' || next.kind === 'keyword') &&
    typeof next.value === 'string'
  ) {
    const idTok = d.advance()!
    return {
      schemaRef: idTok.value as string,
      schemaRefRange: { ...idTok.range },
    }
  }

  d.error('Expected @json block, object literal, or schema name', next)
  d.parseValue()
  return {}
}

export function parseActionBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): ActionDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'action') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected action name', nameTok)
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
  let method: string | undefined
  let methodRange: SourceRange | undefined
  let path: string | undefined
  let pathRange: SourceRange | undefined
  let encoding: string | undefined
  let encodingRange: SourceRange | undefined
  let scopes: string[] | undefined
  let scopesRange: SourceRange | undefined
  let input: JsonSchemaLiteral | undefined
  let inputBlock: JsonBlockInfo | undefined
  let inputRef: string | undefined
  let inputRefRange: SourceRange | undefined
  let output: JsonSchemaLiteral | undefined
  let outputBlock: JsonBlockInfo | undefined
  let outputRef: string | undefined
  let outputRefRange: SourceRange | undefined
  let graphqlDocument: string | undefined
  let graphqlDocumentRange: SourceRange | undefined
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
      d.error(`Duplicate action property "${key}"`, keyTok)
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
        d.error('action provider must be a name', d.peek())
      }

      continue
    }

    if (key === 'method') {
      const parsed = parseBarewordValue(d)

      if (parsed) {
        method = parsed.value.toUpperCase()
        methodRange = parsed.range
      } else {
        d.error('action method must be GET, POST, PUT, DELETE, or PATCH', d.peek())
      }

      continue
    }

    if (key === 'path') {
      const pathTok = d.peek()
      const val = d.parseValue()

      if (typeof val === 'string') {
        path = val

        if (pathTok?.kind === 'string') {
          pathRange = { ...pathTok.range }
        }
      } else {
        d.error('action path must be a string', d.peek())
      }

      continue
    }

    if (key === 'encoding') {
      const parsed = parseBarewordValue(d)

      if (parsed) {
        encoding = parsed.value
        encodingRange = parsed.range
      } else {
        d.error('action encoding must be json, form, query, or raw', d.peek())
      }

      continue
    }

    if (key === 'scopes') {
      const arrTok = d.peek()
      const val = d.parseValue()

      if (Array.isArray(val)) {
        scopes = val.map((v) => String(v))

        if (arrTok?.kind === 'lbracket') {
          scopesRange = { ...arrTok.range }
        }
      } else {
        d.error('action scopes must be an array of strings', d.peek())
      }

      continue
    }

    if (key === 'input') {
      const parsed = parseSchemaField(d)
      input = parsed.schema
      inputBlock = parsed.schemaBlock
      inputRef = parsed.schemaRef
      inputRefRange = parsed.schemaRefRange
      continue
    }

    if (key === 'output') {
      const parsed = parseSchemaField(d)
      output = parsed.schema
      outputBlock = parsed.schemaBlock
      outputRef = parsed.schemaRef
      outputRefRange = parsed.schemaRefRange
      continue
    }

    if (key === 'document') {
      const docTok = d.peek()
      const val = d.parseValue()

      if (typeof val === 'string') {
        graphqlDocument = val

        if (docTok?.kind === 'string') {
          graphqlDocumentRange = { ...docTok.range }
        }
      } else {
        d.error('action document must be a string', d.peek())
      }

      continue
    }

    const valueTok = d.peek()
    d.error(`Unknown action property "${key}"`, valueTok)
    d.parseValue()
  }

  const closing = d.expect('rbrace')

  if (!closing) {
    d.error('Expected } to close action block', d.peek() ?? start)
  }

  const end = closing ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    description,
    docComment,
    provider: provider ?? '',
    providerRange,
    method: method ?? '',
    methodRange,
    path: path ?? '',
    pathRange,
    encoding,
    encodingRange,
    scopes,
    scopesRange,
    input,
    inputBlock,
    inputRef,
    inputRefRange,
    output,
    outputBlock,
    outputRef,
    outputRefRange,
    graphqlDocument,
    graphqlDocumentRange,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
