/**
 * Collection of `@prisma { }` schema islands from `database` blocks, for
 * forwarding to the Prisma language service (diagnostics, completions, hover,
 * definition). Mirrors the JSON/SQL block collectors in ts-service/virtual-docs.
 */

import type { SourceRange, SwirlsFile } from '@swirls/language'

import { positionInRange } from '../ts-service/virtual-docs'

export interface PrismaBlock {
  /** Name of the `database` block the island belongs to. */
  databaseName: string
  /** Verbatim `@prisma { }` island content (models only, no header). */
  content: string
  /** Inner range of the island in the .swirls document (1-based line/column). */
  contentRange: SourceRange
}

/**
 * Collect all `@prisma { }` islands from `database` blocks in the AST.
 */
export function collectPrismaBlocks(ast: SwirlsFile): PrismaBlock[] {
  const blocks: PrismaBlock[] = []

  for (const db of ast.databases ?? []) {
    if (db.schemaBlock) {
      blocks.push({
        databaseName: db.name,
        content: db.schemaBlock.content,
        contentRange: db.schemaBlock.contentRange,
      })
    }
  }

  return blocks
}

/**
 * Find the `@prisma` island containing an LSP position (0-based), if any.
 */
export function findPrismaBlockAtPosition(
  blocks: PrismaBlock[],
  line: number,
  character: number,
): PrismaBlock | null {
  for (const block of blocks) {
    if (positionInRange(line, character, block.contentRange)) {
      return block
    }
  }

  return null
}
