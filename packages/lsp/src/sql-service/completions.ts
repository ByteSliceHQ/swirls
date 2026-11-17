import type { CompletionItem } from 'vscode-languageserver'
import { CompletionItemKind } from 'vscode-languageserver'

import type { SwirlsFile } from '@swirls/language'

import { collectSqlBlocks, findSqlBlockAtPosition, resolveStreamSchema } from './blocks'

/** Logical table name used in SQL blocks (user writes SELECT * FROM {{table}} or we suggest "stream"). */
const STREAM_TABLE_PLACEHOLDER = '{{table}}'
const STREAM_TABLE_LABEL = 'stream'

const SQL_KEYWORDS: CompletionItem[] = [
  'SELECT',
  'FROM',
  'WHERE',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'GROUP BY',
  'HAVING',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'ILIKE',
  'IS',
  'NULL',
  'ASC',
  'DESC',
  'AS',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'ON',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
].map((label) => ({
  label,
  kind: CompletionItemKind.Keyword,
  detail: 'SQL keyword',
}))

/**
 * Get the stream name from a stream node's config (DSL uses "stream": "name").
 */
function getStreamNameFromNode(node: {
  configFields: Record<string, { kind?: string; value?: unknown }>
}): string | null {
  const streamVal = node.configFields.stream

  if (streamVal?.kind === 'string' && typeof streamVal.value === 'string') {
    return streamVal.value
  }

  return null
}

function getStreamVersionPinFromNode(node: {
  configFields: Record<string, { kind?: string; value?: unknown }>
}): string | undefined {
  const v = node.configFields.version

  if (v?.kind === 'string' && typeof v.value === 'string' && v.value.trim()) {
    return v.value.trim()
  }

  return undefined
}

/**
 * Return completion items for a SQL block: keywords, table placeholder, and column names from inferred schema.
 */
export function getSqlCompletions(
  ast: SwirlsFile,
  line: number,
  character: number,
): CompletionItem[] {
  const blocks = collectSqlBlocks(ast)
  const block = findSqlBlockAtPosition(blocks, line, character)

  if (!block) {
    return []
  }

  const items: CompletionItem[] = []

  items.push({
    label: STREAM_TABLE_PLACEHOLDER,
    kind: CompletionItemKind.Variable,
    detail: 'Stream table (use in FROM clause)',
    insertText: STREAM_TABLE_PLACEHOLDER,
  })

  items.push({
    label: STREAM_TABLE_LABEL,
    kind: CompletionItemKind.Variable,
    detail: 'Alias for stream table (use with {{table}} AS stream)',
    insertText: STREAM_TABLE_LABEL,
  })

  const streamName = getStreamNameFromNode(block.node)

  if (streamName) {
    const versionPin = getStreamVersionPinFromNode(block.node)
    const columns = resolveStreamSchema(ast, streamName, versionPin)

    if (columns && columns.length > 0) {
      for (const col of columns) {
        items.push({
          label: col,
          kind: CompletionItemKind.Field,
          detail: 'Stream column (from workflow output schema)',
          insertText: `"${col.replace(/"/g, '""')}"`,
        })
      }
    }
  }

  return [...SQL_KEYWORDS, ...items]
}
