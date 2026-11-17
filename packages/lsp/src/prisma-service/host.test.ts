import { describe, expect, test } from 'bun:test'
import { parse } from '@swirls/language'
import { collectPrismaBlocks, findPrismaBlockAtPosition } from './blocks'
import {
  getPrismaBlockCompletions,
  getPrismaBlockDefinition,
  getPrismaBlockDiagnostics,
  getPrismaBlockHover,
  prismaOriginalToVirtual,
  prismaVirtualToOriginal,
} from './host'

/**
 * Line/column math in these tests is against this exact source. The island
 * content starts right after `@prisma {` on the `schema:` line.
 */
const VALID_SOURCE = `database app_db {
  schema: @prisma {
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
      posts Post[]
    }
    model Post {
      id       Int    @id @default(autoincrement())
      title    String
      author   User   @relation(fields: [authorId], references: [id])
      authorId Int
    }
  }
}
`

/** `title Strin` on 0-based line 9 — an unknown type the Prisma linter flags. */
const BROKEN_SOURCE = VALID_SOURCE.replace('title    String', 'title    Strin')

function blocksFor(source: string) {
  const { ast, errors } = parse(source)
  expect(errors).toHaveLength(0)
  return collectPrismaBlocks(ast)
}

describe('collectPrismaBlocks', () => {
  test('collects the island with its database name and inner range', () => {
    const blocks = blocksFor(VALID_SOURCE)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.databaseName).toBe('app_db')
    expect(blocks[0]?.content).toContain('model User')
    // Island starts right after `@prisma {` on line 2 (1-based).
    expect(blocks[0]?.contentRange.start.line).toBe(2)
  })

  test('findPrismaBlockAtPosition hits inside and misses outside', () => {
    const blocks = blocksFor(VALID_SOURCE)
    // 0-based (2,10) = inside `model User {`
    expect(findPrismaBlockAtPosition(blocks, 2, 10)).not.toBeNull()
    // (0,0) = the `database app_db {` line
    expect(findPrismaBlockAtPosition(blocks, 0, 0)).toBeNull()
  })
})

describe('position mapping', () => {
  test('round-trips a position through virtual coords', () => {
    const block = blocksFor(VALID_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    const virt = prismaOriginalToVirtual(block, 3, 12)
    const back = prismaVirtualToOriginal(block, virt.line, virt.character)
    expect(back).toEqual({ line: 3, character: 12 })
  })

  test('clamps header positions to the island start', () => {
    const block = blocksFor(VALID_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    const clamped = prismaVirtualToOriginal(block, 0, 5)
    expect(clamped.line).toBe(block.contentRange.start.line - 1)
  })
})

describe('getPrismaBlockDiagnostics', () => {
  test('valid island has no diagnostics', () => {
    const block = blocksFor(VALID_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    expect(getPrismaBlockDiagnostics(block)).toHaveLength(0)
  })

  test('unknown type is flagged at the .swirls position', () => {
    const block = blocksFor(BROKEN_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    const diags = getPrismaBlockDiagnostics(block)
    expect(diags.length).toBeGreaterThan(0)
    const diag = diags[0]
    expect(diag?.message).toContain('Strin')
    // `title    Strin` sits on 0-based line 9 of the .swirls doc.
    expect(diag?.range.start.line).toBe(9)
    // Column must point at `Strin`, not at the wrapped virtual doc offset.
    const lines = BROKEN_SOURCE.split('\n')
    const col = diag?.range.start.character
    expect(col).toBeDefined()
    if (col !== undefined) {
      expect(lines[9]?.slice(col, col + 5)).toBe('Strin')
    }
  })
})

describe('getPrismaBlockCompletions', () => {
  test('field type position offers scalars and sibling models', () => {
    const block = blocksFor(BROKEN_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    // End of `Strin` on line 9: `      title    Strin` → character 20.
    const list = getPrismaBlockCompletions(block, { line: 9, character: 20 })
    const labels = (list?.items ?? []).map((i) => i.label)
    expect(labels).toContain('String')
    expect(labels).toContain('User')
    expect(labels).toContain('Post')
  })

  test('@ triggers attribute completions', () => {
    const source = VALID_SOURCE.replace(
      'email String @unique',
      'email String @',
    )
    const block = blocksFor(source)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    const line = 4
    const character = source.split('\n')[line]?.length ?? 0
    const list = getPrismaBlockCompletions(
      block,
      { line, character },
      { triggerKind: 2, triggerCharacter: '@' },
    )
    const labels = (list?.items ?? []).map((i) => i.label)
    expect(labels).toContain('@unique')
    expect(labels).toContain('@default')
  })
})

describe('getPrismaBlockHover', () => {
  test('hover over a relation type resolves the model', () => {
    const block = blocksFor(VALID_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    // `posts Post[]` on 0-based line 5; `Post` starts at character 12.
    const hover = getPrismaBlockHover(block, { line: 5, character: 13 })
    expect(hover).not.toBeNull()
    const contents = JSON.stringify(hover?.contents)
    expect(contents).toContain('Post')
  })
})

describe('getPrismaBlockDefinition', () => {
  test('go-to-definition on a relation type lands on the model decl', () => {
    const block = blocksFor(VALID_SOURCE)[0]
    if (!block) {
      throw new Error('expected a prisma block')
    }
    const defs = getPrismaBlockDefinition(
      block,
      { line: 5, character: 13 },
      'file:///test.swirls',
    )
    expect(defs).not.toBeNull()
    expect(defs?.[0]?.uri).toBe('file:///test.swirls')
    // `model Post {` is on 0-based line 7.
    expect(defs?.[0]?.range.start.line).toBe(7)
  })
})
