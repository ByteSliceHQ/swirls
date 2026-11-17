/**
 * In-process Prisma language service for `@prisma { }` islands.
 *
 * The island is models-only (no datasource/generator — RFC 0013), so each
 * request wraps it with the same `PRISMA_SCHEMA_HEADER` the API uses for
 * deploy-time validation and hands the wrapped text to
 * `@prisma/language-server`'s pure message handlers (no child process, same
 * pattern as the JSON service). Positions are mapped between the .swirls
 * document and the wrapped virtual schema; diagnostics that fall entirely
 * inside the synthetic header are dropped.
 */

import {
  handleCompletionRequest,
  handleDefinitionRequest,
  handleDiagnosticsRequest,
  handleHoverRequest,
} from '@prisma/language-server/dist/lib/MessageHandler'
import { PrismaSchema } from '@prisma/language-server/dist/lib/Schema'
import type {
  CompletionContext,
  CompletionItem,
  CompletionList,
  Diagnostic,
  Hover,
  Location,
  Position,
  Range,
} from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { PRISMA_SCHEMA_HEADER } from '@swirls/definition/managed-database'

import type { PrismaBlock } from './blocks'

/** Lines occupied by the synthetic datasource/generator header. */
const HEADER_LINE_COUNT = PRISMA_SCHEMA_HEADER.split('\n').length - 1

type PrismaLsLogger = (message: string) => void

/**
 * Map a position in the original .swirls document (0-based) into the wrapped
 * virtual schema document (0-based). Island content is inserted verbatim after
 * the header, so only the first content line needs a column shift.
 */
export function prismaOriginalToVirtual(
  block: PrismaBlock,
  line: number,
  character: number,
): Position {
  const startLine = block.contentRange.start.line - 1
  const startCol = block.contentRange.start.column - 1
  return {
    line: HEADER_LINE_COUNT + (line - startLine),
    character: line === startLine ? character - startCol : character,
  }
}

/**
 * Map a position in the wrapped virtual schema (0-based) back to the original
 * .swirls document (0-based). Positions inside the synthetic header clamp to
 * the island start.
 */
export function prismaVirtualToOriginal(
  block: PrismaBlock,
  line: number,
  character: number,
): Position {
  const startLine = block.contentRange.start.line - 1
  const startCol = block.contentRange.start.column - 1

  if (line < HEADER_LINE_COUNT) {
    return { line: startLine, character: startCol }
  }

  return {
    line: startLine + (line - HEADER_LINE_COUNT),
    character: line === HEADER_LINE_COUNT ? startCol + character : character,
  }
}

function mapRangeToOriginal(block: PrismaBlock, range: Range): Range {
  return {
    start: prismaVirtualToOriginal(block, range.start.line, range.start.character),
    end: prismaVirtualToOriginal(block, range.end.line, range.end.character),
  }
}

function virtualDocumentForBlock(block: PrismaBlock): TextDocument {
  return TextDocument.create(
    `file:///__swirls_prisma_${block.databaseName}.prisma`,
    'prisma',
    1,
    PRISMA_SCHEMA_HEADER + block.content,
  )
}

/**
 * Prisma schema diagnostics for one island, ranges mapped to the .swirls doc.
 * Diagnostics that end inside the synthetic header are dropped (they can only
 * be about the header itself, e.g. a duplicate datasource the user declared).
 */
export function getPrismaBlockDiagnostics(
  block: PrismaBlock,
  onError?: PrismaLsLogger,
): Diagnostic[] {
  const doc = virtualDocumentForBlock(block)
  const schema = PrismaSchema.singleFile(doc)
  const map = handleDiagnosticsRequest(schema, onError)
  const out: Diagnostic[] = []

  for (const d of map.get(doc.uri)) {
    if (d.range.end.line < HEADER_LINE_COUNT) {
      continue
    }

    out.push({ ...d, range: mapRangeToOriginal(block, d.range) })
  }

  return out
}

/** Map completion-item text edits from virtual coords back to the .swirls doc. */
function mapCompletionItemToOriginal(block: PrismaBlock, item: CompletionItem): CompletionItem {
  const mapped = { ...item }

  if (mapped.textEdit) {
    if ('range' in mapped.textEdit) {
      mapped.textEdit = {
        ...mapped.textEdit,
        range: mapRangeToOriginal(block, mapped.textEdit.range),
      }
    } else {
      mapped.textEdit = {
        ...mapped.textEdit,
        insert: mapRangeToOriginal(block, mapped.textEdit.insert),
        replace: mapRangeToOriginal(block, mapped.textEdit.replace),
      }
    }
  }

  if (mapped.additionalTextEdits) {
    mapped.additionalTextEdits = mapped.additionalTextEdits.map((e) => ({
      ...e,
      range: mapRangeToOriginal(block, e.range),
    }))
  }

  return mapped
}

/**
 * Prisma schema completions at a .swirls position inside the island.
 */
export function getPrismaBlockCompletions(
  block: PrismaBlock,
  position: Position,
  context?: CompletionContext,
  onError?: PrismaLsLogger,
): CompletionList | null {
  const doc = virtualDocumentForBlock(block)
  const schema = PrismaSchema.singleFile(doc)
  const virt = prismaOriginalToVirtual(block, position.line, position.character)

  const list = handleCompletionRequest(
    schema,
    doc,
    {
      textDocument: { uri: doc.uri },
      position: virt,
      context,
    },
    onError,
  )

  if (!list) {
    return null
  }

  return {
    isIncomplete: list.isIncomplete,
    items: list.items.map((item) => mapCompletionItemToOriginal(block, item)),
  }
}

/**
 * Hover inside a `@prisma` island, range mapped back to the .swirls doc.
 */
export function getPrismaBlockHover(
  block: PrismaBlock,
  position: Position,
  onError?: PrismaLsLogger,
): Hover | null {
  const doc = virtualDocumentForBlock(block)
  const schema = PrismaSchema.singleFile(doc)
  const virt = prismaOriginalToVirtual(block, position.line, position.character)

  const hover = handleHoverRequest(
    schema,
    doc,
    { textDocument: { uri: doc.uri }, position: virt },
    onError,
  )

  if (!hover) {
    return null
  }

  return {
    ...hover,
    range: hover.range ? mapRangeToOriginal(block, hover.range) : undefined,
  }
}

/**
 * Go-to-definition inside a `@prisma` island (e.g. a relation's model type),
 * mapped back to the .swirls document.
 */
export function getPrismaBlockDefinition(
  block: PrismaBlock,
  position: Position,
  swirlsUri: string,
): Location[] | null {
  const doc = virtualDocumentForBlock(block)
  const schema = PrismaSchema.singleFile(doc)
  const virt = prismaOriginalToVirtual(block, position.line, position.character)

  const links = handleDefinitionRequest(schema, doc, {
    textDocument: { uri: doc.uri },
    position: virt,
  })

  if (!links || links.length === 0) {
    return null
  }

  const locations: Location[] = []

  for (const link of links) {
    if (link.targetUri !== doc.uri) {
      continue
    }

    // A definition target inside the synthetic header (datasource/generator)
    // has no counterpart in the .swirls document.
    if (link.targetSelectionRange.end.line < HEADER_LINE_COUNT) {
      continue
    }

    locations.push({
      uri: swirlsUri,
      range: mapRangeToOriginal(block, link.targetSelectionRange),
    })
  }

  return locations.length > 0 ? locations : null
}
