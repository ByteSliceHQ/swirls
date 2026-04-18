---
title: Stream Filters Replaced SQL Queries
impact: MEDIUM
tags: stream, filter, query, removed, operators, migration
---

## Stream Filters Replaced SQL Queries

Older docs and examples mentioned `@sql { SELECT ... FROM {{table}} }` on stream nodes. That is gone. Stream nodes now use a `filter: @ts { ... }` that returns a plain `StreamFilter` object. The runtime — not you — composes the SQL.

**Incorrect (old SQL form):**

```swirls
node recent {
  type: stream
  stream: "submissions"
  query: @sql {
    SELECT * FROM {{table}} WHERE created_at > NOW() - INTERVAL '7 days'
  }
}
```

The validator errors: `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)`.

**Correct (filter object):**

```swirls
node recent {
  type: stream
  label: "Recent high scorers"
  stream: scored_leads
  filter: @ts {
    return {
      score: { gte: 80 }
    }
  }
}
```

### Operator reference

| Operator | Meaning |
|----------|---------|
| `eq` | Equal to the given value |
| `ne` | Not equal |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `like` | SQL `LIKE` pattern match (use `%` wildcards) |
| `in` | Value is in the given array |

Multiple top-level keys AND together; multiple operators under one key also AND:

```ts
return {
  score: { gte: 50, lte: 100 },
  category: { in: ["A", "B"] },
  name: { like: "%@example.com" }
}
```

### Sorting, limits, pagination

Not configurable yet. Default: newest first (by `created_at DESC`), all matching rows. Do not try to add `sort:` or `limit:` fields — they are not parsed.

### If you truly need raw SQL

For arbitrary SQL against a user-managed database, use a `postgres` node with `select:` against a declared top-level `postgres` block. Stream storage is not user-addressable by raw SQL; it is filtered only.

See `node-stream` for required fields and `resource-stream` for the write side.
