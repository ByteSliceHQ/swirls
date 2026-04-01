---
title: SQL Queries with {{table}} Placeholder
impact: MEDIUM
tags: stream, sql, query, table, placeholder, select
---

## SQL Queries with {{table}} Placeholder

Stream nodes can include a `@sql { }` block to filter, aggregate, or sort persisted data. The `{{table}}` placeholder is resolved at runtime to the stream's actual table name.

**Incorrect (hardcoded table name):**

```swirls
query: @sql {
  SELECT * FROM submissions_table
}
```

**Incorrect (non-SELECT query):**

```swirls
query: @sql {
  DELETE FROM {{table}} WHERE created_at < NOW() - INTERVAL '30 days'
}
```

Only SELECT queries are allowed.

**Correct (SELECT with {{table}} placeholder):**

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

Rules:
- Always use `{{table}}` as the table name placeholder
- Only SELECT queries are allowed
- Column names follow the `"nodeName.field"` pattern (see stream-column-naming rule)
- Use aliases (`AS score`) for cleaner output
