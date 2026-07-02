---
title: Database Block Declaration
impact: HIGH
tags: resource, database, prisma, schema, managed, migration, top-level
---

## Database Block Declaration

Top-level `database <name> { }` blocks declare a **Swirls-managed** Postgres: Swirls provisions it on deploy, migrates its schema when it changes, and injects a generated typed Prisma client into `@ts` blocks as `context.db.<name>`. This is distinct from `postgres`, which is a bring-your-own external database the customer connects to and operates (see `resource-postgres`).

There is no `type:` field — the keyword `database` identifies the block. The schema is Prisma schema language inside a `schema: @prisma { }` island.

**Incorrect (empty schema):**

```swirls
database my_db {
  schema: @prisma {
  }
}
```

The validator errors: `Database block requires a non-empty schema: @prisma { } block`.

**Incorrect (datasource/generator in the island):**

```swirls
database my_db {
  schema: @prisma {
    datasource db {
      provider = "postgresql"
      url      = env("DATABASE_URL")
    }
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
    }
  }
}
```

The `@prisma` island is **models and enums only**. Swirls owns provisioning and the connection; it wraps your schema with its own `datasource` and `generator` block before validating it at deploy time, so a user-supplied `datasource` (or `generator`, or a literal connection URL) collides and fails Prisma's validator. Never write one.

**Correct:**

```swirls
database my_db {
  label: "App database"
  description: "Primary application data"
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

    enum Role {
      USER
      ADMIN
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|--------------|
| `label` | no | Human-readable label. |
| `description` | no | Human-readable description. |
| `schema` | yes | `@prisma { }` island: models, enums, relations, and attributes, written in the Prisma schema language. No `datasource`, `generator`, or connection URL. |

### The `@prisma` island

`@prisma { ... }` is brace-balanced like `@ts` / `@json` / `@sql`. The Prisma schema language uses only double-quoted strings and `//` / `///` line comments (no single-quoted strings, no block comments), so those are the only constructs that can hide a brace from the lexer. The content is captured verbatim and is **not** re-lexed or reinterpreted by Swirls — it is handed to Prisma's own validator, migration engine, and client generator at deploy time.

### What the language layer validates (and what it doesn't)

- Database block names must be unique and match `^[a-zA-Z0-9_]+$` (see `spec-common-mistakes`).
- `schema:` must be present and non-empty.
- **Prisma-schema correctness (models, fields, relations, attributes) is deliberately NOT checked at the language layer.** The deploy path validates it via Prisma's own validator (`@prisma/internals`), so a malformed model only surfaces as a deploy-time error, not a `swirls doctor` diagnostic.

### Provisioning and migration

On deploy, Swirls provisions the database if it doesn't exist yet (idempotent — a retried deploy never double-provisions) and holds the connection encrypted with the project's keyset; it is never customer-supplied and never appears in `.swirls`. When the schema changes, the next deploy migrates it: additive changes (new model, new field, new index) auto-apply; destructive or unclassifiable changes are gated for approval rather than applied silently. See `resource-migration` for data transforms a schema diff can't express, and `node-database` and `context-db` for querying.
