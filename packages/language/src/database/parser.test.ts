import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'
import { validateDatabaseBlocks, validateMigrationBlocks } from './validator'

// database block copied verbatim from RFC 0013 "DSL surface", plus the
// migration block from RFC 0013 "Migrations".
const SOURCE = `
database my_db {
  id: "my_db"
  schema: @prisma {
    model User {
      id        Int      @id @default(autoincrement())
      createdAt DateTime @default(now())
      email     String   @unique
      role      Role     @default(USER)
      posts     Post[]
    }
    model Post {
      id       Int    @id @default(autoincrement())
      title    String @db.VarChar(255)
      author   User   @relation(fields: [authorId], references: [id])
      authorId Int
    }
  }
}

migration collapse_names {
  database: my_db
  order: 1
  operation: @ts {
    for await (const user of context.db.my_db.user.stream()) {
      await context.db.my_db.user.update({
        where: { id: user.id },
        data: { name: \`\${user.firstName} \${user.lastName}\` },
      })
    }
  }
}
`

describe('database block parsing', () => {
  test('top-level database block parses with the RFC example schema', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors.length).toBe(0)
    expect(ast.databases.length).toBe(1)

    const db = ast.databases[0]!
    expect(db.name).toBe('my_db')
    expect(db.schemaSource).toContain('model User')
    expect(db.schemaSource).toContain('model Post')
    expect(db.schemaBlock?.content).toContain('model Post')
  })

  test('label and description parse', () => {
    const { ast, errors } = parse(`
database labelled {
  label: "Primary"
  description: "The main DB"
  schema: @prisma {
    model A { id Int @id }
  }
}
`)
    expect(errors.length).toBe(0)
    expect(ast.databases[0]?.label).toBe('Primary')
    expect(ast.databases[0]?.description).toBe('The main DB')
  })

  test('nested connection blocks parse', () => {
    const { ast, errors } = parse(`
database app_db {
  schema: @prisma {
    model User { id Int @id }
  }
  connection app {
    label: "Application connection"
  }
  connection analytics {
    description: "Analytics workloads"
  }
}
`)
    expect(errors.length).toBe(0)
    expect(ast.databases[0]?.connections).toHaveLength(2)
    expect(ast.databases[0]?.connections[0]).toMatchObject({
      name: 'app',
      label: 'Application connection',
    })
    expect(ast.databases[0]?.connections[1]).toMatchObject({
      name: 'analytics',
      description: 'Analytics workloads',
    })
  })

  test('@prisma island keeps braces inside strings and // comments', () => {
    const { ast, errors } = parse(`
database edge_db {
  schema: @prisma {
    /// doc comment with a brace } that must not close the block
    model Widget {
      // inline comment with a } brace
      name String @default("literal with } and { braces")
    }
    model AfterWidget {
      id Int @id
    }
  }
}
`)
    expect(errors.length).toBe(0)
    expect(ast.databases.length).toBe(1)
    const src = ast.databases[0]!.schemaSource
    // The stray braces did not terminate the island early: content after them
    // is still captured.
    expect(src).toContain('model AfterWidget')
    expect(src).toContain('literal with } and { braces')
  })

  test('non-@prisma schema value is an error', () => {
    const { errors } = parse(`
database bad {
  schema: @json { { "type": "object" } }
}
`)
    expect(
      errors.some((e) => e.message.includes('must be an @prisma { } block')),
    ).toBe(true)
  })

  test('migration block parses database, order, and operation', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors.length).toBe(0)
    expect(ast.migrations.length).toBe(1)

    const m = ast.migrations[0]!
    expect(m.name).toBe('collapse_names')
    expect(m.database).toBe('my_db')
    expect(m.order).toBe(1)
    expect(m.operation?.kind).toBe('ts_block')
    if (m.operation?.kind === 'ts_block') {
      expect(m.operation.code).toContain('context.db.my_db.user.update')
    }
  })

  test('round-trips through serialize -> parse', () => {
    const first = parse(SOURCE)
    expect(first.errors.length).toBe(0)
    const out = serialize(first.ast)
    const second = parse(out)
    expect(second.errors.length).toBe(0)

    const a = first.ast.databases[0]!
    const b = second.ast.databases[0]!
    expect(b.name).toBe(a.name)
    // Serialization normalizes leading/trailing island whitespace; the schema
    // body is otherwise byte-identical.
    expect(b.schemaSource.trim()).toBe(a.schemaSource.trim())

    const ma = first.ast.migrations[0]!
    const mb = second.ast.migrations[0]!
    expect(mb.name).toBe(ma.name)
    expect(mb.database).toBe(ma.database)
    expect(mb.order).toBe(ma.order)
    expect(mb.operation?.kind).toBe(ma.operation?.kind)
  })
})

describe('database block validation', () => {
  test('valid database and migration produce no error diagnostics', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(diags.filter((d) => d.severity !== 'warning')).toEqual([])
  })

  test('missing schema is reported', () => {
    const { ast } = parse(`
database empty_db {
  label: "Empty"
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => d.message.includes('non-empty schema: @prisma')),
    ).toBe(true)
  })

  test('duplicate database names are reported', () => {
    const { ast } = parse(`
database dup { schema: @prisma { model A { id Int @id } } }
database dup { schema: @prisma { model B { id Int @id } } }
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => d.message.includes('Duplicate database block name')),
    ).toBe(true)
  })

  test('unknown database reference in migration is reported', () => {
    const { ast } = parse(`
migration m {
  database: nope
  order: 0
  operation: @ts { return 1 }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) =>
        d.message.includes('references database "nope" which is not defined'),
      ),
    ).toBe(true)
  })

  test('negative order is reported', () => {
    const { ast } = parse(`
database db { schema: @prisma { model A { id Int @id } } }
migration m {
  database: db
  order: -1
  operation: @ts { return 1 }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) =>
        d.message.includes('requires "order" as a non-negative integer'),
      ),
    ).toBe(true)
  })

  test('duplicate order for the same database is reported', () => {
    const { ast } = parse(`
database db { schema: @prisma { model A { id Int @id } } }
migration m1 {
  database: db
  order: 1
  operation: @ts { return 1 }
}
migration m2 {
  database: db
  order: 1
  operation: @ts { return 2 }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => d.message.includes('reuses order 1 for database "db"')),
    ).toBe(true)
  })

  test('empty operation is reported', () => {
    const { ast } = parse(`
database db { schema: @prisma { model A { id Int @id } } }
migration m {
  database: db
  order: 1
  operation: @ts { }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) =>
        d.message.includes('requires "operation" (a non-empty @ts block)'),
      ),
    ).toBe(true)
  })

  test('nested role blocks are rejected with migration hint', () => {
    const { errors } = parse(`
database db {
  schema: @prisma { model A { id Int @id } }
  role writer { access: write }
}
`)
    expect(errors.some((e) => e.message.includes('use "connection'))).toBe(true)
  })

  test('reserved connection name owner is reported', () => {
    const { ast } = parse(`
database db {
  schema: @prisma { model A { id Int @id } }
  connection owner { }
}
`)
    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('reserved'))).toBe(true)
  })

  test('invalid database block name is reported', () => {
    // Block names can only be lexed as identifiers, so an invalid name is
    // exercised by mutating a parsed decl before validation.
    const { ast } = parse(`
database ok { schema: @prisma { model A { id Int @id } } }
`)
    ast.databases[0]!.name = 'bad-name'
    const diags = validateDatabaseBlocks(ast)
    expect(diags.some((d) => d.message.includes('Database block name'))).toBe(
      true,
    )
  })

  test('invalid migration block name is reported', () => {
    const { ast } = parse(`
database db { schema: @prisma { model A { id Int @id } } }
migration ok {
  database: db
  order: 1
  operation: @ts { return 1 }
}
`)
    ast.migrations[0]!.name = 'bad-name'
    const diags = validateMigrationBlocks(ast)
    expect(diags.some((d) => d.message.includes('Migration name'))).toBe(true)
  })
})
