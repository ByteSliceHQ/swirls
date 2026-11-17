# Database Blocks — Language Specification

> Declares Swirls-managed Postgres databases in `.swirls` files with a Prisma-language `@prisma` schema island, plus `migration` blocks for data transforms and a forward-referenced `type: database` node for governed mutations.

**Status:** Draft
**Version:** 0.1.0

---

## Overview

A `database` block declares a **Swirls-managed** Postgres: provisioned per project
through the Prisma Postgres partner API, migrated on deploy, and queried from `@ts`
blocks through an injected, generated, fully typed Prisma client. Its schema is written
in the Prisma schema language inside an `@prisma { }` island.

This is deliberately distinct from the `postgres` block:

| | `database` (this spec) | `postgres` |
|---|---|---|
| Ownership | **Swirls-managed** — provisioned and operated by Swirls | **Bring-your-own** — the customer owns and operates it |
| Connection | Swirls-held, keyset-encrypted via the Anvil SDK; never customer-managed | Customer-supplied `connection:` (secret ref or literal) |
| Schema | Prisma schema language (`@prisma`), migrated as real DDL | Hand-written JSON Schema per `table { }`, validation-only |
| Queries | Generated typed Prisma client (`context.db.<name>`) | Raw `@sql` with `{{key}}` + `params:` |

The two coexist; this spec is only about the managed one. Swirls does **not** reinterpret
the `@prisma` island — it hands the schema to Prisma's own toolchain for validation,
migration, and client generation.

This specification covers:

1. **`database <name> { }`** — Top-level declaration: a Prisma schema island.
2. **`migration <name> { }`** — Top-level declaration: an ordered data transform.
3. **The `@prisma` island** — a new embedded-language block type alongside `@ts` / `@sql` / `@json`.
4. **`type: database` node** — forward reference to the governed mutation surface (implemented separately).

---

## 1. `database` block

There is **no** `type:` field — the keyword `database` identifies the block.

### Syntax

```swirls
database <name> {
  label: "<optional label>"
  description: "<optional description>"
  schema: @prisma {
    // Prisma schema language, verbatim
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label. |
| `description` | no | Human-readable description. |
| `schema` | yes | `@prisma` island: the Prisma schema language, verbatim (models, enums, relations, attributes). |

### Nested `connection` blocks

Optional named connections for direct application access. Each declared connection is provisioned with its own connection string (cloud UI or CLI).

```swirls
connection app {
  label: "Application connection"
  description: "Primary app database access"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label. |
| `description` | no | Human-readable description. |

### The `@prisma` island

`@prisma { ... }` is brace-balanced like `@ts` / `@json` / `@sql`. Because the Prisma
schema language uses double-quoted strings and `//` / `///` line comments (no
single-quoted strings, no block comments), only those two constructs can hide a brace
from the lexer. The island content is captured verbatim as `schemaSource` and is not
re-lexed by Swirls.

Physical table and column names are controlled by standard Prisma **`@@map`** (model →
table) and **`@map`** (field → column) attributes. Without them, the model name is the
Postgres table name (PascalCase models require quoted identifiers in raw SQL). Swirls
passes these attributes through to migrations, client generation, and the data browser
unchanged.

---

## 2. `migration` block

A checksum diff cannot express intent like "collapse `first_name` and `last_name` into
`name`", so data transforms are declared as their own block. They run in `order` after
the schema migration, each exactly once, via typed Prisma query-builder code.

### Syntax

```swirls
migration <name> {
  database: <database_block_name>
  order: <non-negative integer>
  operation: @ts {
    // typed Prisma Next data-migration body
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `database` | yes | Bare identifier naming a declared `database` block. |
| `order` | yes | Non-negative integer; unique per target database. Migrations apply in ascending order. |
| `operation` | yes | `@ts` island holding the typed Prisma data-migration body. |

---

## 3. `type: database` node (forward reference)

Beside the full injected client available in `code` nodes, a first-class `database` node
is an **opt-in governed surface** for mutations a customer wants visible in `flow { }`,
addressable by `policy`, gateable by `review:`, and traced. Implemented separately from
this language milestone.

```swirls
node purge_stale: database {
  database: <database_block_name>
  operation: delete           // query | insert | update | delete | transaction
  review: { enabled: true }
  condition: @ts { return context.nodes.root.output.confirmed === true }
  run: @ts {
    return context.db.<name>.user.deleteMany({ where: { /* ... */ } })
  }
}
```

The declared `operation` mints a capability-narrowed view of the generated client
(`query` exposes reads only, `delete` exposes `delete`/`deleteMany` only, and so on);
`transaction` receives the full client inside a `$transaction` scope. The narrowing is a
compile-time type error in the `@ts` island, enforced by per-operation type views over
the one generated client.

| `operation` | Client exposes |
|---|---|
| `query` | `findMany`, `findFirst`, `count`, `aggregate` |
| `insert` | `create`, `createMany` |
| `update` | `update`, `updateMany`, `upsert` |
| `delete` | `delete`, `deleteMany` |
| `transaction` | the full client, inside a `$transaction` scope |

---

## 4. Validation rules (summary)

- Unique `database` block names; valid resource-name format; non-empty `@prisma` schema.
- Unique `migration` block names; `database:` must reference a declared `database` block
  (local file or workspace); `order` must be a non-negative integer, unique per target
  database; `operation:` must be a non-empty `@ts` block.
- **Prisma-schema correctness is deliberately NOT validated here.** The deploy path owns
  it via Prisma's own validator and migration engine. The language layer only checks the
  Swirls envelope around the schema.

---

## 5. Code organization

Implementation lives under `packages/language/src/database/` (`ast.ts`, `parser.ts`,
`validator.ts`, tests). The `@prisma` island is a `FencedBlockLang` in
`packages/language/src/lexer.ts`. Cross-file `database:` references resolve through the
workspace resource index (`databases` / `databaseBlocks`), the same way `postgres` blocks
are indexed.

---

## 6. AST (conceptual)

- `DatabaseDecl` — top-level `database` block (name, label, description, schemaSource, schemaBlock).
- `PrismaBlockInfo` — the `@prisma` island content + inner range (for LSP forwarding).
- `MigrationDecl` — top-level `migration` block (name, database, order, operation @ts block).

---

## 7. Design decisions

| Decision | Choice |
|----------|--------|
| Top-level keyword | `database` — domain-specific, no conditional `type` field, distinct from `postgres`. |
| Schema language | Prisma schema language via `@prisma`, delegated to Prisma's toolchain (not reinterpreted). |
| Data migrations | Declared `migration` block, ordered, in `.swirls` (repo-local, deploy-atomic, diff-visible). |
| Mutation governance | First-class `type: database` node with `operation` capability narrowing. |
