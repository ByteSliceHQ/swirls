/**
 * Parsing for top-level `mock` blocks.
 */

import type { JsonBlockInfo, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  MockAiConfig,
  MockDecl,
  MockMode,
  MockReviewConfig,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseIdentOrString(d: ResourceParserDelegate): string | null {
  const peeked = d.peek()
  if (
    peeked &&
    (peeked.kind === 'identifier' ||
      peeked.kind === 'keyword' ||
      peeked.kind === 'string')
  ) {
    d.advance()
    return String(peeked.value)
  }
  return null
}

function parseJsonBlock(d: ResourceParserDelegate): JsonBlockInfo | null {
  const peeked = d.peek()
  if (peeked?.kind !== 'fenced_block' || peeked.fencedLang !== 'json') {
    return null
  }
  const tok = d.advance()!
  return {
    code: tok.fencedContent ?? '',
    innerRange: tok.fencedContentRange ?? tok.range,
  }
}

function parseStringList(d: ResourceParserDelegate): string[] {
  const peeked = d.peek()
  if (peeked?.kind !== 'lbracket') {
    const v = d.parseValue()
    return typeof v === 'string' ? [v] : []
  }
  d.advance()
  const out: string[] = []
  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbracket') {
      break
    }
    if (t.kind === 'comma') {
      d.advance()
      continue
    }
    if (t.kind === 'identifier' || t.kind === 'keyword' || t.kind === 'string') {
      d.advance()
      out.push(String(t.value))
      continue
    }
    d.parseValue()
  }
  d.expect('rbracket')
  return out
}

function parseAiObject(d: ResourceParserDelegate): MockAiConfig | undefined {
  if (!d.expect('lbrace')) {
    return undefined
  }
  const start = d.peek()
  const ai: MockAiConfig = {}
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
      break
    }
    const v = d.parseValue()
    if (key === 'provider' && typeof v === 'string') {
      ai.provider = v
    } else if (key === 'model' && typeof v === 'string') {
      ai.model = v
    } else if (key === 'instructions' && typeof v === 'string') {
      ai.instructions = v
    }
  }
  const end = d.expect('rbrace') ?? d.peek()
  if (start && end) {
    ai.range = rangeFromTokens(start, end)
  }
  return ai
}

function parseReviewObject(d: ResourceParserDelegate): MockReviewConfig | null {
  if (!d.expect('lbrace')) {
    return null
  }
  const startTok = d.peek()
  let auto: 'approve' | 'reject' | undefined
  let formData: JsonBlockInfo | undefined
  let formDataLiteral: Record<string, unknown> | undefined

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
      break
    }
    if (key === 'auto') {
      const v = parseIdentOrString(d)
      if (v === 'approve' || v === 'reject') {
        auto = v
      } else {
        d.error('mock review.auto must be approve or reject', d.peek())
        if (v == null) {
          d.parseValue()
        }
      }
      continue
    }
    if (key === 'formData') {
      const block = parseJsonBlock(d)
      if (block) {
        formData = block
      } else {
        const v = d.parseValue()
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          formDataLiteral = v as Record<string, unknown>
        }
      }
      continue
    }
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  if (!auto) {
    d.error('mock review requires auto: approve | reject', end)
    return null
  }
  return {
    auto,
    formData,
    formDataLiteral,
    range: rangeFromTokens(startTok ?? end!, end ?? startTok!),
  }
}

export function parseMockBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): MockDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'mock') {
    return null
  }

  const nameTok = d.advance()
  if (
    !nameTok ||
    (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')
  ) {
    d.error('Expected mock block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let mode: MockMode | undefined
  let only: string[] | undefined
  let except: string[] | undefined
  let ai: MockAiConfig | undefined
  let action: string | undefined
  let actionRange: SourceRange | undefined
  let workflow: string | undefined
  let workflowRange: SourceRange | undefined
  let node: string | undefined
  let nodeRange: SourceRange | undefined
  let output: JsonBlockInfo | undefined
  let outputLiteral: Record<string, unknown> | undefined
  let generate: boolean | MockAiConfig | undefined
  let review: MockReviewConfig | undefined

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

    if (key === 'mode') {
      const v = parseIdentOrString(d)
      if (v === 'all' || v === 'off' || v === 'selective') {
        mode = v
      } else {
        d.error('mock mode must be all | off | selective', d.peek())
        if (v == null) {
          d.parseValue()
        }
      }
      continue
    }

    if (key === 'only') {
      only = parseStringList(d)
      continue
    }

    if (key === 'except') {
      except = parseStringList(d)
      continue
    }

    if (key === 'ai') {
      ai = parseAiObject(d)
      continue
    }

    if (key === 'action') {
      const peeked = d.peek()
      if (
        peeked &&
        (peeked.kind === 'identifier' ||
          peeked.kind === 'keyword' ||
          peeked.kind === 'string')
      ) {
        d.advance()
        action = String(peeked.value)
        actionRange = peeked.range
      } else {
        d.error('Expected action name', peeked)
        d.parseValue()
      }
      continue
    }

    if (key === 'workflow') {
      const peeked = d.peek()
      if (
        peeked &&
        (peeked.kind === 'identifier' ||
          peeked.kind === 'keyword' ||
          peeked.kind === 'string')
      ) {
        d.advance()
        workflow = String(peeked.value)
        workflowRange = peeked.range
      } else {
        d.error('Expected workflow name', peeked)
        d.parseValue()
      }
      continue
    }

    if (key === 'node') {
      const peeked = d.peek()
      if (
        peeked &&
        (peeked.kind === 'identifier' ||
          peeked.kind === 'keyword' ||
          peeked.kind === 'string')
      ) {
        d.advance()
        node = String(peeked.value)
        nodeRange = peeked.range
      } else {
        d.error('Expected node name', peeked)
        d.parseValue()
      }
      continue
    }

    if (key === 'output') {
      const block = parseJsonBlock(d)
      if (block) {
        output = block
      } else {
        const v = d.parseValue()
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          outputLiteral = v as Record<string, unknown>
        } else {
          d.error('mock output must be @json { … }', d.peek())
        }
      }
      continue
    }

    if (key === 'generate') {
      const peeked = d.peek()
      if (peeked?.kind === 'boolean') {
        d.advance()
        generate = peeked.value as boolean
      } else if (peeked?.kind === 'lbrace') {
        generate = parseAiObject(d)
      } else {
        d.error('generate must be true/false or { provider, model, … }', peeked)
        d.parseValue()
      }
      continue
    }

    if (key === 'review') {
      review = parseReviewObject(d) ?? undefined
      continue
    }

    d.error(`Unknown mock property "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    docComment,
    mode,
    only,
    except,
    ai,
    action,
    actionRange,
    workflow,
    workflowRange,
    node,
    nodeRange,
    output,
    outputLiteral,
    generate,
    review,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
