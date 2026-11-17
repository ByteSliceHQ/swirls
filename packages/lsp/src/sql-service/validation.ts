/**
 * Validate stream node SQL block: ensure SELECT result columns match outputSchema.items (array output).
 */

import type { SwirlsFile } from '@swirls/language'
import type { Diagnostic } from 'vscode-languageserver'
import { DiagnosticSeverity } from 'vscode-languageserver'
import {
  getStreamNodeOutputRowSchema,
  resolveStreamSchema,
  type SqlBlockInfo,
} from './blocks'
import { getSelectResultColumns } from './parse-select'

/** Convert AST range (1-based line/column) to LSP range (0-based line/character). */
function toLspRange(r: {
  start: { line: number; column: number }
  end: { line: number; column: number }
}): {
  start: { line: number; character: number }
  end: { line: number; character: number }
} {
  return {
    start: { line: r.start.line - 1, character: r.start.column - 1 },
    end: { line: r.end.line - 1, character: r.end.column - 1 },
  }
}

/**
 * PostgreSQL lowercases unquoted identifiers. For comparison we lowercase both expected and actual
 * so that SELECT score matches required "score".
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase()
}

/**
 * Validate one SQL block: check that the SELECT result columns include all required fields
 * from the stream node's outputSchema.items (when outputSchema is an array). Returns diagnostics (errors for missing
 * required columns, optionally one warning for parse errors).
 */
export function getSqlBlockDiagnostics(
  block: SqlBlockInfo,
  ast: SwirlsFile,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const range = toLspRange(block.innerRange)

  if (block.sqlField !== 'query') {
    return []
  }

  const expected = getStreamNodeOutputRowSchema(block.node)

  if (!expected) {
    return []
  }

  const parseResult = getSelectResultColumns(block.code)

  if (parseResult.kind === 'error') {
    diagnostics.push({
      message: parseResult.message,
      range,
      severity: DiagnosticSeverity.Warning,
    })
    return diagnostics
  }

  let actualColumns: string[]

  if (parseResult.kind === 'star') {
    const streamName =
      block.node.configFields.stream?.kind === 'string' &&
      typeof block.node.configFields.stream?.value === 'string'
        ? (block.node.configFields.stream.value as string)
        : null

    const versionPinRaw =
      block.node.configFields.version?.kind === 'string' &&
      typeof block.node.configFields.version?.value === 'string'
        ? (block.node.configFields.version.value as string).trim()
        : ''

    const streamCols = streamName
      ? resolveStreamSchema(ast, streamName, versionPinRaw || undefined)
      : null
    actualColumns = streamCols ?? []
  } else {
    actualColumns = parseResult.columns
  }

  const actualSet = new Set(actualColumns.map(normalizeColumnName))

  for (const required of expected.requiredNames) {
    if (!actualSet.has(normalizeColumnName(required))) {
      diagnostics.push({
        message: `SQL result is missing required column "${required}" for outputSchema.items`,
        range,
        severity: DiagnosticSeverity.Error,
      })
    }
  }

  return diagnostics
}
