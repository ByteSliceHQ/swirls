---
title: Stream Filter Field Paths
impact: MEDIUM
tags: stream, filter, fields, jsonb, column, naming
---

## Stream Filter Field Paths

Stream filters reference two kinds of fields uniformly: table-level columns and fields inside the persisted output JSON. The runtime decides which is which — you just use the key name.

### Table-level columns

These are the two first-class columns exposed on every stream row.

| Name | Type | Meaning |
|------|------|---------|
| `created_at` | timestamp | When the row was persisted. |
| `graph_execution_id` | string | Execution that produced the row. |

Use them directly in the filter object:

```swirls
filter: @ts {
  return {
    created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
  }
}
```

### Output JSON fields

Every other key in the filter is looked up inside the persisted `output` JSON (the shape your `prepare:` returned in the stream block). Nested paths are not currently supported — filter on top-level keys of the prepared record.

If your stream block's `prepare` returns `{ email, name, score }`, filter on `email`, `name`, `score`:

```swirls
filter: @ts {
  return {
    score: { gte: 80 },
    email: { like: "%@example.com" }
  }
}
```

### Conventions

- The shape of each persisted record is fully controlled by the stream block's `prepare` return value and described by the block's `schema`. Think of the filter as filtering the prepared record, not a graph's raw node outputs.
- If you need to filter on multiple node outputs, combine them inside `prepare` so the persisted record exposes the fields you want.
- `like` uses SQL `LIKE` semantics — `%` is the wildcard. No regex.

### Legacy column names

If you see older examples using `"root.field"` or other dotted column names in SQL strings, those apply to the removed SQL-query form of stream nodes. They do not apply to filters. Filter keys are flat top-level names only.

See `node-stream` for the full filter API.
