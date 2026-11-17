/**
 * Parsing for `operation` top-level blocks. Called from the main parser via
 * delegation.
 */

import type { JsonSchemaLiteral, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type { OperationCommandDecl, OperationDecl } from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The text of an inline script block as the device will receive it.
 *
 * The block is indented to sit inside the `operation`, and that indentation
 * is not part of the script. The blank lines around the body and the
 * indentation every line shares are removed, and the script ends with one
 * newline. What remains is exactly what is hashed, signed and run.
 */
export function normalizeInlineScript(raw: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[0]?.trim() === '') {
    lines.shift()
  }
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop()
  }
  if (lines.length === 0) {
    return ''
  }
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0)
  const shared = Math.min(...indents)
  return `${lines.map((line) => line.slice(shared).trimEnd()).join('\n')}\n`
}

function parseJsonSchema(
  d: ResourceParserDelegate,
  key: string,
): JsonSchemaLiteral | undefined {
  const tok = d.peek()
  if (tok?.kind !== 'fenced_block' || tok.fencedLang !== 'json') {
    d.error(`Operation "${key}" must be an @json { } block`, tok)
    d.parseValue()
    return undefined
  }
  d.advance()
  try {
    const parsed: unknown = JSON.parse(tok.fencedContent ?? '')
    if (isRecord(parsed)) {
      return parsed
    }
    d.error(`Operation "${key}" must be a JSON object`, tok)
  } catch {
    d.error(`Invalid JSON in operation "${key}"`, tok)
  }
  return undefined
}

function parseCommand(d: ResourceParserDelegate): OperationCommandDecl | null {
  const tok = d.peek()
  if (
    tok?.kind === 'fenced_block' &&
    (tok.fencedLang === 'ps' || tok.fencedLang === 'sh')
  ) {
    d.advance()
    return {
      lang: tok.fencedLang,
      script: normalizeInlineScript(tok.fencedContent ?? ''),
      range: tok.range,
    }
  }
  if (
    tok?.kind === 'script_path_ref' &&
    (tok.fencedLang === 'ps' || tok.fencedLang === 'sh')
  ) {
    d.advance()
    return {
      lang: tok.fencedLang,
      path: String(tok.value),
      range: tok.range,
    }
  }
  d.error(
    'Operation "command" must be an @ps { } or @sh { } block, or an @ps "file.ps1" or @sh "file.sh" reference',
    tok,
  )
  d.parseValue()
  return null
}

export function parseOperationBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): OperationDecl | null {
  const start = d.expect('keyword')
  if (!start || start.value !== 'operation') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected operation block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  const decl: OperationDecl = {
    name: String(nameTok.value),
    nameRange: nameTok.range,
    docComment,
    range: rangeFromTokens(start, nameTok),
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

    const key = d.parsePropertyKey()
    if (!key) {
      break
    }
    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }
    const valueTok = d.peek()

    if (key === 'label' || key === 'description') {
      const value = d.parseValue()
      if (typeof value === 'string') {
        decl[key] = value
      }
      continue
    }
    if (key === 'platform' || key === 'runAs') {
      // Written bare (`platform: windows`) or quoted. A bare word is an
      // identifier token, which `parseValue` does not read.
      if (
        valueTok?.kind !== 'identifier' &&
        valueTok?.kind !== 'keyword' &&
        valueTok?.kind !== 'string'
      ) {
        d.error(`Operation "${key}" must be a name`, valueTok)
        d.parseValue()
        continue
      }
      d.advance()
      if (key === 'platform') {
        decl.platform = String(valueTok.value)
        decl.platformRange = valueTok.range
      } else {
        decl.runAs = String(valueTok.value)
        decl.runAsRange = valueTok.range
      }
      continue
    }
    if (key === 'timeout') {
      const value = d.parseValue()
      if (typeof value === 'number' && valueTok) {
        decl.timeout = value
        decl.timeoutRange = valueTok.range
      } else {
        d.error('Operation "timeout" must be a number of seconds', valueTok)
      }
      continue
    }
    if (key === 'inputSchema' || key === 'outputSchema') {
      const schema = parseJsonSchema(d, key)
      if (schema) {
        decl[key] = schema
      }
      continue
    }
    if (key === 'command') {
      const command = parseCommand(d)
      if (decl.command) {
        d.error(
          `Operation "${decl.name}" declares more than one command`,
          valueTok,
        )
      } else if (command) {
        decl.command = command
      }
      continue
    }

    d.error(`Unknown operation property "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  decl.range = rangeFromTokens(start, end ?? nameTok)
  return decl
}
