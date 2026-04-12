---
title: Postgres Nodes
impact: CRITICAL
tags: node, postgres, sql, select, insert, params, database, query
---

## Postgres Nodes

Postgres nodes read from and write to user-managed external PostgreSQL databases. Each node references a top-level `postgres` block and uses either `select:` (read) or `insert:` (write). Never both.

**Incorrect (missing postgres reference, mixing select and insert):**

```swirls
node bad_query {
  type: postgres
  select: @sql { SELECT * FROM leads }
  insert: @sql { INSERT INTO leads (name) VALUES ({{name}}) }
}
```

**Correct (select node with params):**

```swirls
node load_leads {
  type: postgres
  label: "Active leads"
  postgres: my_db

  select: @sql {
    SELECT id, email, score
    FROM leads
    WHERE score >= {{min_score}}
  }

  params: @ts {
    return {
      min_score: context.nodes.root.output.threshold
    }
  }

  schema: @json {
    {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "email": { "type": "string" },
          "score": { "type": "number" }
        }
      }
    }
  }
}
```

**Correct (insert node with condition):**

```swirls
node upsert_lead {
  type: postgres
  label: "Upsert lead"
  postgres: my_db

  condition: @ts {
    return context.nodes.classify.output.score > 20
  }

  insert: @sql {
    INSERT INTO leads (name, email, score)
    VALUES ({{name}}, {{email}}, {{score}})
    ON CONFLICT (email) DO UPDATE SET score = EXCLUDED.score
  }

  params: @ts {
    return {
      name: context.nodes.root.output.name,
      email: context.nodes.root.output.email,
      score: context.nodes.classify.output.score
    }
  }
}
```

### Field reference

| Field | `select:` node | `insert:` node |
|-------|----------------|----------------|
| `label` | optional | optional |
| `postgres` | required | required |
| `select` | required | not allowed |
| `insert` | not allowed | required |
| `params` | optional (required if SQL has `{{...}}`) | required |
| `schema` | recommended | not used |
| `condition` | not allowed | optional |

### Key rules

- `postgres:` must reference a top-level `postgres` block defined in the same file.
- `select:` SQL must be a SELECT statement. `insert:` SQL must be INSERT (upsert with ON CONFLICT is allowed).
- `{{key}}` placeholders are replaced with positional `$N` parameters at runtime. Values come from the `params:` return object. No SQL injection is possible.
- Placeholder names do not need to match column names. They match by position in the INSERT column list, or by the SQL expression context on SELECT.
- Table names in SQL must appear in the referenced `postgres` block's `table` declarations.
- Insert nodes produce no row output by default. Select nodes return an array of row objects.
