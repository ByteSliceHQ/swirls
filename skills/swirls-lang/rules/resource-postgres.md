---
title: Postgres Block Declaration
impact: HIGH
tags: resource, postgres, database, connection, table, schema, top-level
---

## Postgres Block Declaration

Top-level `postgres` blocks declare user-managed external PostgreSQL databases. They define the connection and the tables available for validation and LSP support. Nodes with `type: postgres` reference these blocks by name.

**Incorrect (no table declarations):**

```swirls
postgres my_db {
  connection: "postgresql://localhost:5432/mydb"
}
```

At least one `table` block is required per postgres declaration.

**Correct (connection with table schema):**

```swirls
postgres my_db {
  label: "Production CRM"
  secrets: project_secrets
  connection: DATABASE_URL

  table leads {
    schema: @json {
      {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "email": { "type": "string" },
          "score": { "type": "number" }
        },
        "required": ["id", "email"]
      }
    }
  }

  table events {
    schema: @json {
      {
        "type": "object",
        "properties": {
          "event_type": { "type": "string" },
          "payload": { "type": "object" },
          "created_at": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label. |
| `secrets` | no | References a top-level `secret` block. Validates bare connection identifiers against that block's `vars`. |
| `connection` | yes | Postgres connection string. Bare identifier (secret ref) or quoted literal (local dev; produces a warning). |
| `table <name> { }` | yes (at least one) | Declares a table with a JSON Schema for one row. Used for validation and LSP autocomplete. |

### Connection modes

1. **Secret reference**: `secrets: my_secrets` + `connection: DATABASE_URL` (bare identifier validated against the secret block's vars).
2. **Project-level secret**: `connection: DATABASE_URL` without `secrets:` (bare identifier treated as project secret).
3. **Literal string**: `connection: "postgresql://localhost:5432/db"` (quoted string, produces a validator warning for production use).

### Table declarations

- Table names are unqualified (e.g., `leads`). Runtime uses the `public` schema.
- The JSON Schema describes one row. The validator and LSP use it for column autocomplete and type checking in SQL.
- Table names in node SQL must match a declared table in the referenced postgres block.
