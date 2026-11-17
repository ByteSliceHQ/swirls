/**
 * End-to-end typing of `context.db` in @ts blocks: parse real .swirls source,
 * collect TS blocks, build virtual documents, and assert TypeScript
 * diagnostics. Mirrors the executor's capability topology (RFC 0013): full
 * client in code nodes, per-operation narrowing on `database` nodes, no db in
 * their `condition`, target-only full client in `migration` bodies.
 */

import { describe, expect, test } from 'bun:test'
import { parse } from '@swirls/language'
import { createLanguageServiceFromMap, virtualUriForBlock } from './host'
import { buildVirtualTsContent, collectTsBlocks } from './virtual-docs'

const DB_DECL = `database app_db {
  schema: @prisma {
    model User {
      id        Int      @id @default(autoincrement())
      email     String   @unique
      createdAt DateTime @default(now())
      posts     Post[]
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

function diagnosticsForBlock(
  source: string,
  blockPredicate?: (code: string) => boolean,
) {
  const { ast, errors } = parse(source)
  expect(errors).toHaveLength(0)
  const blocks = collectTsBlocks(ast)
  const idx = blockPredicate
    ? blocks.findIndex((b) => blockPredicate(b.code))
    : 0
  expect(idx).toBeGreaterThanOrEqual(0)
  const contentMap = new Map<string, string>()
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block) {
      contentMap.set(
        virtualUriForBlock(String(i)),
        buildVirtualTsContent(block),
      )
    }
  }
  const ls = createLanguageServiceFromMap(contentMap)
  return ls.getSemanticDiagnostics(virtualUriForBlock(String(idx)))
}

function codeNodeSource(body: string): string {
  return `${DB_DECL}
graph main {
  root {
    type: code
    code: @ts {
${body}
    }
  }
}
`
}

describe('context.db in code nodes', () => {
  test('valid typed query with relation filter compiles clean', () => {
    const diags = diagnosticsForBlock(
      codeNodeSource(`
      const users = await context.db.app_db.user.findMany({
        where: { email: { contains: 'x' }, posts: { some: { title: 'hi' } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
      const first = users[0]
      if (first) {
        const e: string = first.email
        const d: Date = first.createdAt
        return { e, d }
      }
      return {}
`),
    )
    expect(diags).toHaveLength(0)
  })

  test('unknown where field is a compile error', () => {
    const diags = diagnosticsForBlock(
      codeNodeSource(`
      return await context.db.app_db.user.findMany({
        where: { nope: 1 },
      })
`),
    )
    expect(diags.length).toBeGreaterThan(0)
  })

  test('unknown model is a compile error', () => {
    const diags = diagnosticsForBlock(
      codeNodeSource(`
      return await context.db.app_db.gadget.findMany({})
`),
    )
    expect(diags.length).toBeGreaterThan(0)
  })

  test('$transaction is not available in code nodes', () => {
    const diags = diagnosticsForBlock(
      codeNodeSource(`
      return await context.db.app_db.$transaction(async () => {})
`),
    )
    expect(diags.length).toBeGreaterThan(0)
  })

  test('no databases declared means no context.db', () => {
    const diags = diagnosticsForBlock(`
graph main {
  root {
    type: code
    code: @ts {
      return context.db
    }
  }
}
`)
    expect(diags.length).toBeGreaterThan(0)
  })
})

function databaseNodeSource(operation: string, runBody: string): string {
  return `${DB_DECL}
graph main {
  root {
    type: code
    code: @ts {
      return {}
    }
  }

  node mutate {
    type: database
    database: app_db
    operation: ${operation}
    run: @ts {
${runBody}
    }
  }

  flow {
    root -> mutate
  }
}
`
}

describe('context.db on governed database nodes', () => {
  test('operation: query allows findMany', () => {
    const diags = diagnosticsForBlock(
      databaseNodeSource(
        'query',
        'return await context.db.app_db.user.findMany({})',
      ),
      (code) => code.includes('findMany'),
    )
    expect(diags).toHaveLength(0)
  })

  test('operation: query refuses create at compile time', () => {
    const diags = diagnosticsForBlock(
      databaseNodeSource(
        'query',
        "return await context.db.app_db.user.create({ data: { email: 'a@b.c' } })",
      ),
      (code) => code.includes('create'),
    )
    expect(diags.length).toBeGreaterThan(0)
  })

  test('operation: transaction exposes only $transaction', () => {
    const okDiags = diagnosticsForBlock(
      databaseNodeSource(
        'transaction',
        `return await context.db.app_db.$transaction(async (tx) => {
        const u = await tx.user.create({ data: { email: 'a@b.c' } })
        await tx.post.create({ data: { title: 'hi', author: { connect: { id: u.id } } } })
        return u.id
      })`,
      ),
      (code) => code.includes('$transaction'),
    )
    expect(okDiags).toHaveLength(0)

    const directDiags = diagnosticsForBlock(
      databaseNodeSource(
        'transaction',
        'return await context.db.app_db.user.findMany({})',
      ),
      (code) => code.includes('findMany'),
    )
    expect(directDiags.length).toBeGreaterThan(0)
  })

  test('condition has no context.db', () => {
    const source = `${DB_DECL}
graph main {
  root {
    type: code
    code: @ts {
      return {}
    }
  }

  node mutate {
    type: database
    database: app_db
    operation: delete
    condition: @ts {
      return context.db !== undefined
    }
    run: @ts {
      return await context.db.app_db.user.deleteMany({})
    }
  }

  flow {
    root -> mutate
  }
}
`
    const conditionDiags = diagnosticsForBlock(source, (code) =>
      code.includes('context.db !== undefined'),
    )
    expect(conditionDiags.length).toBeGreaterThan(0)

    const runDiags = diagnosticsForBlock(source, (code) =>
      code.includes('deleteMany'),
    )
    expect(runDiags).toHaveLength(0)
  })
})

describe('context.db in migration operation bodies', () => {
  test('migration body gets the target database with full actions', () => {
    const source = `${DB_DECL}
migration backfill_emails {
  database: app_db
  order: 0
  operation: @ts {
    const users = await context.db.app_db.user.findMany({})
    for (const u of users) {
      await context.db.app_db.user.update({
        where: { id: u.id },
        data: { email: u.email.toLowerCase() },
      })
    }
    return users.length
  }
}
`
    const diags = diagnosticsForBlock(source, (code) =>
      code.includes('toLowerCase'),
    )
    expect(diags).toHaveLength(0)
  })

  test('migration body has empty node context', () => {
    const source = `${DB_DECL}
migration bad_ctx {
  database: app_db
  order: 0
  operation: @ts {
    return context.nodes.root.output
  }
}
`
    const diags = diagnosticsForBlock(source, (code) =>
      code.includes('context.nodes.root'),
    )
    expect(diags.length).toBeGreaterThan(0)
  })
})

describe('select/include narrowing through context.db', () => {
  test('select narrows the result type', () => {
    const diags = diagnosticsForBlock(
      codeNodeSource(`
      const rows = await context.db.app_db.user.findMany({ select: { email: true } })
      const row = rows[0]
      if (!row) {
        return {}
      }
      const e: string = row.email
      return { e, id: row.id }
`),
    )
    // row.id must be an error: it was not selected.
    expect(diags.length).toBeGreaterThan(0)
  })

  test('include exposes the relation', () => {
    const diags = diagnosticsForBlock(
      codeNodeSource(`
      const rows = await context.db.app_db.user.findMany({ include: { posts: true } })
      const row = rows[0]
      if (!row) {
        return {}
      }
      const titles: string[] = row.posts.map((p) => p.title)
      return { titles }
`),
    )
    expect(diags).toHaveLength(0)
  })
})
