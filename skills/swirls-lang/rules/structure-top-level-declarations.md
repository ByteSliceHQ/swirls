---
title: Top-Level Declarations
impact: HIGH
tags: file, structure, declarations, form, webhook, schedule, graph, trigger, secret, auth, postgres
---

## Top-Level Declarations

A `.swirls` file contains eight kinds of top-level declarations in any order. There are no imports, exports, or module syntax.

**Incorrect (using unsupported syntax):**

```swirls
import { helper } from "./utils.swirls"

export graph my_graph {
  // ...
}
```

**Correct (valid top-level declarations):**

```swirls
version: 1

form contact {
  label: "Contact"
  enabled: true
  schema: @json { { "type": "object", "properties": { "email": { "type": "string" } } } }
}

webhook inbound {
  label: "Inbound"
  enabled: true
}

schedule daily {
  label: "Daily"
  cron: "0 9 * * *"
}

graph process {
  label: "Process"
  root {
    type: code
    label: "Entry"
    code: @ts { return {} }
  }
}

secret api_creds {
  vars: [API_KEY]
}

auth my_auth {
  type: api_key
  secrets: api_creds
  key: API_KEY
  header: "x-api-key"
}

trigger on_contact {
  form:contact -> process
  enabled: true
}

postgres my_db {
  label: "External DB"
  connection: "postgresql://localhost:5432/mydb"

  table users {
    schema: @json { { "type": "object", "properties": { "email": { "type": "string" } } } }
  }
}
```

The eight valid top-level blocks are:
- `form <name> { }` - UI forms and API endpoints
- `webhook <name> { }` - HTTP endpoints for external payloads
- `schedule <name> { }` - Cron-based triggers
- `graph <name> { }` - Workflow DAGs
- `trigger <name> { }` - Binds resources to graphs
- `secret <name> { }` - Named groups of secret key identifiers
- `auth <name> { }` - Authentication configuration linked to secret blocks
- `postgres <name> { }` - External PostgreSQL database connections and table schemas

`version: <number>` is optional and can appear once at the top.
