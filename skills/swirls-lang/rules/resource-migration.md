---
title: Migration Block Declaration
impact: HIGH
tags: resource, migration, database, prisma, data-transform, top-level
---

## Migration Block Declaration

Top-level `migration <name> { }` blocks declare an ordered, run-once **data transform** against a managed `database` block — the kind of change a schema diff can't express, like collapsing two columns into one. They run after their target database's schema migration, in ascending `order`, and are tracked so a workflow retry never re-applies one.

There is no `type:` field — the keyword `migration` identifies the block.

**Incorrect (missing `database`):**

```swirls
migration collapse_names {
  order: 1
  operation: @ts {
    // ...
  }
}
```

The validator errors: `Migration "collapse_names" requires "database" (a database block name)`.

**Incorrect (`database` references an undeclared block):**

```swirls
migration collapse_names {
  database: not_a_real_db
  order: 1
  operation: @ts {
    // ...
  }
}
```

The validator errors: `Migration "collapse_names" references database "not_a_real_db" which is not defined`.

**Incorrect (duplicate `order` for the same database):**

```swirls
migration first {
  database: my_db
  order: 1
  operation: @ts { /* ... */ }
}

migration second {
  database: my_db
  order: 1
  operation: @ts { /* ... */ }
}
```

The validator errors: `Migration "second" reuses order 1 for database "my_db" (already used by "first")`. `order` must be a non-negative integer, unique per target database.

**Correct:**

```swirls
migration collapse_names {
  database: my_db
  order: 1
  operation: @ts {
    const users = await context.db.my_db.user.findMany({ where: { name: null } })
    for (const user of users) {
      await context.db.my_db.user.update({
        where: { id: user.id },
        data: { name: `${user.firstName} ${user.lastName}` },
      })
    }
  }
}
```

The body runs over the same single-call bridge as a `code` node. Use model methods (`findMany`, `update`, `updateMany`) awaited one at a time. Streaming helpers like `.stream()` and `for await` are not available over the bridge; page with `findMany` instead.

### Fields

| Field | Required | Description |
|-------|----------|--------------|
| `database` | yes | Bare identifier naming a declared top-level `database` block (same file or workspace). |
| `order` | yes | Non-negative integer. Migrations targeting the same database apply in ascending order. |
| `operation` | yes | Non-empty `@ts` block: the typed Prisma data-migration body, run against `context.db.<name>` (the full client, same as a `code` node — see `context-db`). |

### Semantics

- Data migrations run in the post-deploy migration workflow, after the schema migration for the same `database` block, each **exactly once**.
- A pending data migration gates its deploy for approval, the same way a destructive schema change does — it does not apply silently.
- Migrations are ordered **per target database** — `order: 1` in one database's migrations does not conflict with `order: 1` in another's.
- `operation:` runs the same full, un-narrowed Prisma client available in `code` nodes (see `context-db`); it is not a `type: database` node and does not take `operation:` as a capability narrowing field (name collision with the node's `operation` field is coincidental — here `operation:` just holds the `@ts` body).
