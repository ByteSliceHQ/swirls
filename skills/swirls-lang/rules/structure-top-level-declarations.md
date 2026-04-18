---
title: Top-Level Declarations
impact: HIGH
tags: file, structure, declarations, form, webhook, schedule, graph, stream, trigger, secret, auth, postgres
---

## Top-Level Declarations

A `.swirls` file contains nine kinds of top-level declarations, in any order. There are no imports, exports, or module syntax.

**Incorrect (using unsupported syntax):**

```swirls
import { helper } from "./utils.swirls"

export graph my_graph {
  // ...
}
```

The parser errors: `Unexpected token: expected form, webhook, schedule, graph, stream, trigger, secret, auth, or postgres`.

**Correct (all top-level declarations demonstrated):**

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

stream process_log {
  label: "Process log"
  graph: process
  schema: @json { { "type": "object" } }
  prepare: @ts { return {} }
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

postgres my_db {
  label: "External DB"
  connection: "postgresql://localhost:5432/mydb"

  table users {
    schema: @json { { "type": "object", "properties": { "email": { "type": "string" } } } }
  }
}

trigger on_contact {
  form:contact -> process
  enabled: true
}
```

### The nine valid top-level blocks

- `form <name> { }` — UI forms and API endpoints. See `resource-form`.
- `webhook <name> { }` — HTTP endpoints for external payloads. See `resource-webhook`.
- `schedule <name> { }` — Cron-based triggers. See `resource-schedule`.
- `graph <name> { }` — Workflow DAGs. See `graph-anatomy`.
- `stream <name> { }` — Persist a graph's output as typed records. See `resource-stream`.
- `trigger <name> { }` — Binds resources to graphs. See `resource-trigger-binding`.
- `secret <name> { }` — Named groups of secret var identifiers. See `resource-secrets`.
- `auth <name> { }` — Authentication configuration for http nodes. See `resource-auth`.
- `postgres <name> { }` — External PostgreSQL connection and table schemas. See `resource-postgres`.

### Version line

`version: <number>` is optional. If present, it appears once, typically at the top. The parser accepts it anywhere and stores the number on the AST.

### Block comments are preserved

`/* ... */` block comments immediately before a top-level declaration attach to it as a doc comment and are preserved by the serializer.
