---
title: Stream Nodes
impact: MEDIUM
tags: node, stream, query, sql, persistence
---

## Stream Nodes

Stream nodes query persisted data from other graphs. They reference a stream name and optionally include a SQL query with `{{table}}` placeholder.

**Required fields:** `stream` (or `streamId`)

**Correct (stream node with SQL query):**

```swirls
node recent {
  type: stream
  label: "Recent submissions"
  stream: "submissions"
  query: @sql {
    SELECT "root.score" AS score, "root.message" AS message
    FROM {{table}}
    WHERE created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 10
  }
  schema: @json {
    {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
  }
}
```

See the `stream-query-sql` and `stream-column-naming` rules for SQL query details.

Stream node fields:
| Field | Required | Type |
|-------|----------|------|
| `stream` | yes | String (stream/graph name) |
| `query` | no | `@sql` block |
| `schema` | no | `@json` block (use `outputSchema` only on root nodes) |
