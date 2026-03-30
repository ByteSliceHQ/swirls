---
title: Stream Column Naming Convention
impact: MEDIUM
tags: stream, sql, column, naming, node
---

## Stream Column Naming Convention

Persisted stream data stores node outputs as columns. Column names follow the `"nodeName.field"` pattern. When referencing them in SQL, use double-quoted identifiers.

**Incorrect (unquoted dot notation):**

```sql
SELECT root.score, root.message FROM {{table}}
```

This is interpreted as table alias `root` with column `score`, not the persisted column.

**Correct (quoted column names with aliases):**

```swirls
query: @sql {
  SELECT "root.score" AS score, "root.message" AS message
  FROM {{table}}
  ORDER BY created_at DESC
  LIMIT 10
}
```

Column naming pattern:
- `"root.field"` - Root node output fields
- `"nodeName.field"` - Any node's output fields
- `created_at` - Built-in timestamp (no quotes needed)

Always alias quoted columns with `AS` for cleaner results.
