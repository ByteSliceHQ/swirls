---
title: context.db - Querying a Managed Database
impact: HIGH
tags: context, database, prisma, transaction, managed, query
---

## context.db - Querying a Managed Database

Every `@ts` block reaches a declared `database` block's data through `context.db.<name>` — a generated, fully typed Prisma client. No SQL, no `params:` block, no JSON Schema to keep in sync with the table.

**Incorrect (writing raw SQL against a `database` block):**

```swirls
node load_admins {
  type: code
  code: @ts {
    return context.db.my_db.query("SELECT * FROM \"User\" WHERE role = 'ADMIN'")
  }
}
```

There is no `.query()` escape hatch and no raw SQL surface on `context.db`. Use the typed Prisma client methods instead.

**Correct (typed client in a `code` node — the full client):**

```swirls
node active_admins {
  type: code
  label: "Active admins"
  code: @ts {
    return await context.db.my_db.user.findMany({
      where: { role: "ADMIN" },
      include: { posts: true },
    })
  }
}
```

### Two surfaces, two capability levels

- **`code` node.** `context.db.<name>` is the **full, un-narrowed** client: every model, every method — reads, writes, deletes. This is the unrestricted power path.
- **`type: database` node.** `context.db.<name>` is **narrowed to the node's declared `operation`** (see `node-database`). A method outside that operation is rejected at runtime, not merely a lint warning.

### `$transaction` is only available in a `type: database` node with `operation: transaction`

**Incorrect (calling `$transaction` from a `code` node):**

```swirls
node settle_invoice {
  type: code
  code: @ts {
    return context.db.my_db.$transaction(async (tx) => {
      const invoice = await tx.invoice.update({ where: { id: 1 }, data: { status: "PAID" } })
      return invoice
    })
  }
}
```

This throws at runtime: `Managed database: transactions are only available in a database node with operation: transaction`. A `code` node's client is deliberately transaction-free.

**Correct:**

```swirls
node settle_invoice {
  type: database
  database: my_db
  operation: transaction
  run: @ts {
    return context.db.my_db.$transaction(async (tx) => {
      const invoice = await tx.invoice.update({ where: { id: 1 }, data: { status: "PAID" } })
      return invoice
    })
  }
}
```

### `return await` works directly in `@ts` bodies

Every `@ts` block (not only `context.db` usage) is wrapped in an async function before it runs, so `return await someAsyncCall()` is valid without any extra ceremony. A returned Promise resolves before it becomes the node's (or the migration's) output.

```swirls
code: @ts {
  return await context.db.my_db.user.findFirst({ where: { email: "a@b.com" } })
}
```

### Data types round-trip

Values pass between the sandbox and the host client with their real types, not lossy JSON:

- `DateTime` fields come back as JavaScript `Date` objects.
- `BigInt` columns and byte (`Bytes`) columns round-trip as `BigInt` and byte arrays, not stringified.
- `Decimal` values come back as strings (avoids floating-point precision loss across the boundary).

### Where `context.db` is valid

- Any `@ts` block in a `code` node.
- The `run:` body of a `type: database` node (narrowed per `operation`).
- The `operation:` body of a top-level `migration` block (full client, same as `code`).

See `resource-database`, `resource-migration`, and `node-database` for the block and node syntax.
