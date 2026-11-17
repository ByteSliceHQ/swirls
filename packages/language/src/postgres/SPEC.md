# Postgres Blocks — Language Specification

> Declares user-managed external PostgreSQL databases in `.swirls` files and provides `type: postgres` nodes for parameterized reads (`select:`) and writes (`insert:`, `update:`, `delete:`).

**Status:** Draft  
**Version:** 0.3.0

---

## Overview

`postgres` blocks represent **user-managed external PostgreSQL databases** — systems outside the Swirls platform that the user owns and operates. This is distinct from platform-managed `persistence` (stream storage) and from `secret` / `auth` blocks (which configure access but are not data stores).

This specification covers:

1. **`postgres <name> { }`** — Top-level declaration: connection credentials and table schemas (JSON Schema).
2. **`type: postgres` nodes with `select:`** — Read-only queries; rows become node output.
3. **`type: postgres` nodes with `insert:`** — Write queries (INSERT / upsert); no row output by default.
4. **`type: postgres` nodes with `update:`** — Write queries (UPDATE); no row output by default.
5. **`type: postgres` nodes with `delete:`** — Write queries (DELETE); no row output by default.

Writes are **regular nodes in the graph flow**, not graph-level finalizers.

---

## 1. `postgres` block

There is **no** `type:` field — the keyword `postgres` identifies the block.

### Syntax

```swirls
postgres <name> {
  label: "<optional label>"
  secrets: <secret_block_name>   // optional; validates bare connection identifiers
  connection: <SECRET_VAR>       // bare identifier or "literal" string

  table <table_name> {
    schema: @json {
      { ... JSON Schema for one row ... }
    }
  }
}
```

At least one `table { }` is required; repeat the nested block for additional tables.

### Example

```swirls
postgres my_db {
  label: "Production CRM"
  secrets: project_secrets
  connection: SHARED_DATABASE_URL

  table leads {
    schema: @json {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "email": { "type": "string" },
        "score": { "type": "number" }
      },
      "required": ["id", "email"]
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label. |
| `secrets` | no | References a top-level `secret` block; validates `connection` bare identifiers against that block’s `vars`. |
| `connection` | yes | Postgres connection string: bare identifier (secret ref) or quoted literal (local dev; validator warning). |
| `table <name> { }` | yes (≥1) | Declares a table available for validation; at least one table per block. |

### Connection and secrets

Same behavior as before: **Mode 1** — `secrets:` + bare `connection:` var validated against the secret block. **Mode 2** — bare `connection:` as project-level secret. **Mode 3** — quoted literal with a **warning** for production.

### Table declarations

Table names are **unqualified** (e.g. `leads`). Runtime uses the `public` schema unless extended later.

Compile-time validation uses these schemas to check SQL references (e.g. table and explicit INSERT column names). **`params:` keys and `{{...}}` names are not required to match JSON Schema property names** — they are arbitrary labels bound by position (INSERT) or by the SQL expression (e.g. `column = {{name}}` on SELECT). Tooling infers types from that SQL context where possible.

---

## 2. `type: postgres` node — `select:` (read)

### Syntax

```swirls
node <name> {
  type: postgres
  label: "<optional label>"
  postgres: <postgres_block_name>

  select: @sql {
    SELECT ...
    FROM <table>
    WHERE col = {{key}}
  }

  params: @ts {
    return { key: context.nodes.<upstream_node>.output.<field>, ... }
  }

  schema: @json { ... JSON Schema for result rows ... }
}
```

### Example

```swirls
node load_leads {
  type: postgres
  label: "Active leads"
  postgres: my_db

  select: @sql {
    SELECT id, email, score
    FROM leads
    WHERE score >= {{min_score}}
  }

  params: @ts {
    return {
      min_score: context.nodes.root.output.threshold
    }
  }

  schema: @json {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "email": { "type": "string" },
        "score": { "type": "number" }
      }
    }
  }
}
```

### Fields (read / `select:`)

These fields apply to nodes that use **`select:`** for reads. For writes, see §3.

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label for the node. |
| `postgres` | yes | Name of a top-level `postgres` block. |
| `select` | yes | `@sql` block: must be a `SELECT` statement. |
| `params` | optional | `@ts` block returning a **plain object** whose keys match `{{key}}` placeholders in the SQL (required when the SQL contains placeholders). |
| `schema` / `outputSchema` | recommended | JSON Schema for query result rows (e.g. array of objects). |

---

## 3. `type: postgres` node — `insert:` (write)

### Syntax

`condition:` is optional; when present, the insert runs only when the `@ts` block returns true.

```swirls
node <name> {
  type: postgres
  postgres: <postgres_block_name>

  condition: @ts {
    return <boolean expression>
  }

  insert: @sql {
    INSERT ...
  }

  params: @ts {
    return { <key>: <value>, ... }
  }
}
```

### Example

```swirls
node upsert_lead {
  type: postgres
  postgres: my_db

  condition: @ts {
    return context.nodes.classify.output.score > 20
  }

  insert: @sql {
    INSERT INTO leads (name, email, score)
    VALUES ({{name}}, {{email}}, {{score}})
    ON CONFLICT (email) DO UPDATE SET score = EXCLUDED.score
  }

  params: @ts {
    return {
      name: context.nodes.root.output.name,
      email: context.nodes.root.output.email,
      score: context.nodes.classify.output.score
    }
  }
}
```

### Fields (write / `insert:`)

These fields apply to nodes that use **`insert:`** for writes. For reads, see §2.

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label for the node. |
| `postgres` | yes | Name of a top-level `postgres` block. |
| `insert` | yes | `@sql` block: must be an `INSERT` (or upsert) statement. |
| `params` | **required** | `@ts` block returning a **plain object** whose keys match `{{key}}` placeholders in the SQL. |
| `condition` | no | `@ts` block returning boolean; if false, the insert is skipped. |
| `schema` / `outputSchema` | n/a | Not used for typical insert nodes (no row output by default). |

Include the node in `flow { ... }` like any other node.

Each `type: postgres` node must have **exactly one** of `select:`, `insert:`, `update:`, or `delete:` (documented in §2–§5).

---

## 4. `type: postgres` node — `update:` (write)

Same shape as `insert:`, with an `UPDATE` statement. `condition:` is optional; when
present, the update runs only when the `@ts` block returns true. `params:` is required
when the SQL contains `{{key}}` placeholders; a static statement may omit it.

### Example

```swirls
node refresh_score {
  type: postgres
  postgres: my_db

  update: @sql {
    UPDATE leads
    SET score = {{score}}
    WHERE email = {{email}}
  }

  params: @ts {
    return {
      score: context.nodes.classify.output.score,
      email: context.nodes.root.output.email
    }
  }
}
```

### Fields (write / `update:`)

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label for the node. |
| `postgres` | yes | Name of a top-level `postgres` block. |
| `update` | yes | `@sql` block: must be an `UPDATE` statement. |
| `params` | required when the SQL has `{{...}}` placeholders | `@ts` block returning a **plain object** whose keys match `{{key}}` placeholders in the SQL. |
| `condition` | no | `@ts` block returning boolean; if false, the update is skipped. |
| `schema` / `outputSchema` | n/a | Not used (no row output by default). |

An `UPDATE` without a `WHERE` clause modifies every row in the table; the validator
emits a **warning**. Explicit `SET col = ...` column names are validated against the
declared table schema (same rule as explicit INSERT column lists).

---

## 5. `type: postgres` node — `delete:` (write)

Same shape as `update:`, with a `DELETE` statement.

### Example

```swirls
node purge_stale_leads {
  type: postgres
  postgres: my_db

  condition: @ts {
    return context.nodes.root.output.confirmed === true
  }

  delete: @sql {
    DELETE FROM leads
    WHERE score < {{min_score}}
  }

  params: @ts {
    return { min_score: context.nodes.root.output.threshold }
  }
}
```

### Fields (write / `delete:`)

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label for the node. |
| `postgres` | yes | Name of a top-level `postgres` block. |
| `delete` | yes | `@sql` block: must be a `DELETE` statement. |
| `params` | required when the SQL has `{{...}}` placeholders | `@ts` block returning a **plain object** whose keys match `{{key}}` placeholders in the SQL. |
| `condition` | no | `@ts` block returning boolean; if false, the delete is skipped. |
| `schema` / `outputSchema` | n/a | Not used (no row output by default). |

A `DELETE` without a `WHERE` clause removes every row in the table; the validator
emits a **warning**.

---

## 6. `{{key}}` interpolation and SQL safety

### No SQL injection

Values are **never** concatenated into the SQL string. The engine:

1. **Compile step:** Replaces each `{{key}}` in the SQL text with positional placeholders `$1`, `$2`, … in order of appearance.
2. **Execution step:** Builds the value list from the object returned by `params:` (or empty for a static query with no placeholders).
3. **Driver:** Sends `query(text, values)` to PostgreSQL as a **parameterized** statement.

User data never becomes part of the SQL parse tree as raw text.

### Readability and tooling

- **`{{email}}`** in SQL is self-documenting compared to opaque `$1`.
- The validator can ensure every `{{key}}` has a matching property in the `params` return object (when `params:` is present). It does **not** require that param or placeholder **names** match table column names; names are user-chosen. The LSP infers types from SQL (e.g. INSERT column list ↔ first `VALUES` row, or `column = {{param}}` on SELECT) when the table row schema is available.
- Editors can highlight `{{...}}` distinctly inside `@sql` blocks.

### Param names vs column names

Placeholder and `params:` keys are **identifiers for bound values**, not aliases for schema property names. For example, `INSERT INTO greetings (greeting) VALUES ({{funky}})` maps `funky` to the `greeting` column by **position** in the column and `VALUES` lists; the row schema type for that value comes from the `greeting` column, not from a property named `funky`.

### Static analysis without a separate `table:` field on nodes

Table names are taken from the SQL (`FROM`, `INSERT INTO`, …) and matched against `postgres` block `table { }` declarations. The LSP can offer the same column autocomplete and hovers once the table is known from the query text.

---

## 7. Field matrix (quick reference)

| Field | `select:` node | `insert:` node | `update:` node | `delete:` node |
|-------|----------------|----------------|----------------|----------------|
| `label:` | optional | optional | optional | optional |
| `postgres:` | required | required | required | required |
| `select:` | required | — | — | — |
| `insert:` | — | required | — | — |
| `update:` | — | — | required | — |
| `delete:` | — | — | — | required |
| `params:` | optional (required if SQL has `{{...}}`) | required | required if SQL has `{{...}}` | required if SQL has `{{...}}` |
| `schema:` / `outputSchema` | recommended | n/a | n/a | n/a |
| `condition:` | — | optional | optional | optional |

---


## 8. AST (conceptual)

- `PostgresDecl` — top-level `postgres` block (name, label, secrets, connection, tables).
- `PostgresTableDecl` — nested `table` with JSON Schema.
- Graph nodes use `type: postgres` with config fields `postgres`, `select`, `insert`, `update`, `delete`, `params`, `condition`.

Persist blocks and generic `resource` types are **removed** from the language model described here.

---

## 9. Validation rules (summary)

- Unique `postgres` block names; at least one `table` per block; connection / secret rules as documented.
- For each `type: postgres` node: reference to a defined `postgres` block; exactly one of `select`, `insert`, `update`, or `delete`.
- `select` SQL must be read-only SELECT; `insert` SQL must be an INSERT-oriented statement; `update` SQL must be an UPDATE statement; `delete` SQL must be a DELETE statement — as enforced by the validator.
- `update` / `delete` without a `WHERE` clause produce a validator **warning** (whole-table write).
- `{{key}}` tokens must have matching keys in the `params:` return object when `params:` is used (when placeholders exist). Those names need not match column names in the declared table schema.
- Table names in SQL must appear in the referenced `postgres` block’s table declarations.

---

## 10. Code organization

Implementation lives under `packages/language/src/postgres/` (`ast.ts`, `parser.ts`, `validator.ts`, `sql-utils.ts`, tests). Shared SQL regex helpers for `select:` / `insert:` / `update:` / `delete:` live in `sql-utils.ts` and are imported by the validator and by the LSP. The LSP keeps postgres-specific TypeScript inference in `packages/lsp/src/ts-service/postgres-types.ts` (params return types and `{{key}}` hover). The engine exposes a `PostgresProvider` for runtime queries.

---

## 11. Design decisions

| Decision | Choice |
|----------|--------|
| Top-level keyword | `postgres` — domain-specific, no conditional `type` field. |
| Reads vs writes | `select:` for reads; `insert:` / `update:` / `delete:` for writes — one SQL entry point per node. |
| Parameters | `params:` returns a **named object**; `{{key}}` → `$N` at runtime. |
| Graph writes | Regular nodes in `flow`, not separate persist finalizers. |
| `table:` on nodes | Omitted — derived from SQL for validation and LSP. |
