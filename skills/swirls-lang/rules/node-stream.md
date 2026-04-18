---
title: Stream Nodes
impact: HIGH
tags: node, stream, filter, persisted, query, read
---

## Stream Nodes

A `type: stream` node **reads** from a top-level `stream { }` block. It is the read side of Swirls' graph-to-graph communication. The node's output is an array of previously persisted records matching the filter.

**Required fields:** `stream` (bare identifier naming a top-level stream block in the same project) and `filter` (@ts returning a `StreamFilter` object).

**Not valid (removed from schema):** `streamId`, `query`, `querySql`. Using any of them produces a validator error.

### Syntax

```swirls
<node_name> {
  type: stream
  stream: <stream_block_name>
  filter: @ts {
    return {
      <field>: { <op>: <value> },
      ...
    }
  }
}
```

### Example

```swirls
node recent_high_scorers {
  type: stream
  label: "Recent high-scoring leads"
  stream: scored_leads
  filter: @ts {
    return {
      score: { gte: 80 },
      name: { eq: context.nodes.root.input.name }
    }
  }
}
```

### StreamFilter shape

`filter` must return a plain object whose keys are field names and whose values are operator objects.

```typescript
type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in'

type StreamFilter = Record<string, Partial<Record<FilterOperator, unknown>>>
```

Multiple top-level keys AND together. Multiple operators on the same key also AND together:

```typescript
// score >= 50 AND score <= 100 AND name equals input
{
  score: { gte: 50, lte: 100 },
  name: { eq: context.nodes.root.input.name }
}
```

### Table vs output fields

Filters address two field kinds uniformly:

- **Table-level columns:** `created_at`, `graph_execution_id` — mapped to direct SQL column comparisons.
- **Output JSON fields:** anything else — mapped to jsonb field extraction (Postgres) or `json_extract` (SQLite).

You do not need to distinguish; the runtime infers it.

### Node output

The node's output is `SchemaShape[]` — an array of records matching the referenced stream block's `schema`. Zero matches is not an error. Downstream nodes see it as `context.nodes.<stream_node>.output`.

When the stream block has a `schema:`, the LSP types `context.nodes.<stream_node>.output` as the matching TypeScript array. If the stream block has no schema or the reference is missing, the LSP types it as `unknown[]`.

### Pagination and sorting

Not implemented yet. All queries return all matching rows ordered by `created_at DESC` (newest first). Pagination / sort will be added as optional fields later.

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `stream` | yes | bare identifier | Must match a top-level `stream <name> { }` block. |
| `filter` | yes | `@ts { }` or `@ts "file.ts.swirls"` | Must be non-empty; must return a `StreamFilter` object. |

### Common mistakes

**Incorrect (old `query` field):**

```swirls
node recent {
  type: stream
  stream: "submissions"
  query: @sql { SELECT * FROM {{table}} }
}
```

Error: `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)`.

**Incorrect (referencing an undefined stream block):**

```swirls
node recent {
  type: stream
  stream: undefined_stream
  filter: @ts { return {} }
}
```

Error: `Stream node references stream block "undefined_stream" which is not defined`.

**Incorrect (empty filter):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  filter: @ts { }
}
```

Error: `Stream node filter must be a non-empty @ts block`. If you want all rows, return `{}` from the filter: `filter: @ts { return {} }`.

See `resource-stream` for the write side (top-level `stream { }` block declaration).
