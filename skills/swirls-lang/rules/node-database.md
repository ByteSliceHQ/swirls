---
title: Database Nodes
impact: CRITICAL
tags: node, database, prisma, operation, transaction, managed, query, insert, update, delete
---

## Database Nodes

`type: database` nodes are an **opt-in governed surface** for mutations against a managed `database` block: visible in `flow { }`, gateable with `review:`, and traced as their own step. They coexist with the full, un-narrowed `context.db.<name>` client available in `code` nodes (see `context-db`) — reach for `code` for unrestricted programming power, reach for `database` when a specific mutation needs to be governed.

**Required fields:** `database`, `operation`, `run`.

**Incorrect (missing `operation`):**

```swirls
node purge_stale {
  type: database
  database: my_db
  run: @ts {
    return context.db.my_db.user.deleteMany({ where: { active: false } })
  }
}
```

The validator errors: `Database node requires an "operation" field`.

**Incorrect (`operation` outside the allowed set):**

```swirls
node purge_stale {
  type: database
  database: my_db
  operation: remove
  run: @ts {
    return context.db.my_db.user.deleteMany({ where: { active: false } })
  }
}
```

The validator errors: `Database node "operation" must be one of: query, insert, update, delete, transaction, got "remove"`.

**Incorrect (a call outside the declared operation):**

```swirls
node load_admins {
  type: database
  database: my_db
  operation: query
  run: @ts {
    // "query" only exposes reads — this call is rejected at runtime
    return context.db.my_db.user.deleteMany({ where: { role: "ADMIN" } })
  }
}
```

The declared `operation` mints a capability-narrowed client: `deleteMany` is not reachable from a `query` node. This is enforced host-side at runtime (not only as a type), so it cannot be worked around by constructing the call dynamically.

**Correct (query):**

```swirls
node load_admins {
  type: database
  label: "Load admins"
  database: my_db
  operation: query
  run: @ts {
    return context.db.my_db.user.findMany({ where: { role: "ADMIN" } })
  }
}
```

**Correct (governed delete with review and condition):**

```swirls
node purge_stale {
  type: database
  label: "Purge stale users"
  database: my_db
  operation: delete
  review: { enabled: true }
  condition: @ts {
    return context.nodes.root.output.confirmed === true
  }
  run: @ts {
    return context.db.my_db.user.deleteMany({
      where: { lastSeen: { lt: context.nodes.root.output.cutoff } },
    })
  }
}
```

**Correct (transaction — the full client, atomically):**

```swirls
node settle_invoice {
  type: database
  label: "Settle invoice"
  database: my_db
  operation: transaction
  review: { enabled: true }
  run: @ts {
    return context.db.my_db.$transaction(async (tx) => {
      const invoice = await tx.invoice.update({
        where: { id: context.nodes.root.output.invoiceId },
        data: { status: "PAID" },
      })
      await tx.ledgerEntry.create({
        data: { invoiceId: invoice.id, amount: invoice.total },
      })
      return invoice
    })
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|--------------|
| `database` | yes | Bare identifier naming a top-level `database` block. |
| `operation` | yes | One of `query`, `insert`, `update`, `delete`, `transaction`. |
| `condition` | no | `@ts` block returning boolean. When `false`, the node is skipped (output `{ skipped: true }`); mirrors the `postgres` insert node's `condition`. |
| `run` | yes | Non-empty `@ts` block: the typed Prisma body, executed against the operation-narrowed client. |

Every node also accepts the shared optional fields (`label`, `description`, `secrets`, `review`, `failurePolicy`, `format`).

### Operation → client capability

| `operation` | Client exposes |
|---|---|
| `query` | `findMany`, `findFirst`, `findUnique`, `findFirstOrThrow`, `findUniqueOrThrow`, `count`, `aggregate`, `groupBy` |
| `insert` | `create`, `createMany`, `createManyAndReturn` |
| `update` | `update`, `updateMany`, `updateManyAndReturn`, `upsert` |
| `delete` | `delete`, `deleteMany` |
| `transaction` | the full client (every action above), inside one interactive `$transaction` |

`transaction` is the deliberate exception: it spans every operation class for the atomic multi-step case a single narrowed operation can't express (insert then update, or a read that decides a delete, in one atomic block). Because of that it is governed **at the node grain, not per operation** — `review:` and `policy` treat the whole transaction as one step.

### Output

- Output is whatever `run` returns.
- When `condition` is present and evaluates `false`, the node is skipped: output is `{ skipped: true }` and the node does not execute `run`.
- `database` nodes require the cloud managed-database provider; they are not available to the local CLI worker (managed databases are a hosted-only feature).

### Key rules

- Exactly one `database:` and one `operation:` per node; `operation` is required even for a single-statement `run`.
- A call the declared `operation` does not expose is rejected before it reaches the client, even if constructed dynamically — there is no way to compute around the narrowing.
- Only an `operation: transaction` node's `run` body may call `$transaction`; see `context-db` for why `code` nodes cannot.
- `database:` must reference a top-level `database` block declared in the workspace (same file or another `.swirls` file), the same rule as `postgres:` on a `postgres` node.
