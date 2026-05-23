---
title: Stream Filter Field Paths
impact: MEDIUM
tags: stream, filter, fields, column, naming, version
---

## Stream Filter Field Paths

Stream filters reference two kinds of fields uniformly: system columns and the payload fields of the persisted record. The runtime decides which is which — you just use the key name. (Filter fragments below live inside a `type: stream` node, which also needs `stream:` and `version:` — see `node-stream`.)

### System columns

These are the first-class columns exposed on every stream row.

| Name | Type | Meaning |
|------|------|---------|
| `id` | identifier | Row id. |
| `created_at` | timestamp | When the row was persisted. |
| `deployment_id` | string | Deployment that wrote the row. |
| `graph_execution_id` | string | Execution that produced the row. |

Use them directly in the filter object:

```swirls
filter: @ts {
  return {
    created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
  }
}
```

System columns are filterable but are **stripped from the returned rows** — a queried row contains only your payload fields.

### Payload fields

Every other key in the filter is a field of the persisted record — the shape your version's `prepare:` returned (and described by that version's `schema`). Filter on the same top-level key names your `prepare` produced; the runtime maps them to the matching column (camelCase keys are matched case-insensitively against their snake_case column).

If your version's `prepare` returns `{ email, name, score }`, filter on `email`, `name`, `score`:

```swirls
filter: @ts {
  return {
    score: { gte: 80 },
    email: { like: "%@example.com" }
  }
}
```

### Conventions

- The shape of each persisted record is fully controlled by the version's `prepare` return value and described by that version's `schema`. Think of the filter as filtering the prepared record, not a graph's raw node outputs.
- Reads are pinned to one `version`, so filter fields must exist in **that version's** schema/prepared shape. Different versions can expose different fields.
- If you need to filter on multiple node outputs, combine them inside `prepare` so the persisted record exposes the fields you want.
- `like` uses SQL `LIKE` semantics — `%` is the wildcard. No regex.

### Legacy column names

If you see older examples using `"root.field"` or other dotted column names in SQL strings, those apply to the removed SQL-query form of stream nodes. They do not apply to filters. Filter keys are flat top-level names only.

See `node-stream` for the full filter API and `resource-stream` for declaring versions.
