---
title: Top-Level Declarations
impact: HIGH
tags: file, structure, declarations, schema, form, webhook, schedule, graph, stream, trigger, secret, auth, postgres, disk, agent
---

## Top-Level Declarations

A `.swirls` file contains twelve kinds of top-level declarations (plus the optional `version:` line), in any order. There are no imports, exports, or module syntax.

**Incorrect (using unsupported syntax):**

```swirls
import { helper } from "./utils.swirls"

export graph my_graph {
  // ...
}
```

The parser errors: `Unexpected token: expected schema, form, webhook, schedule, graph, stream, trigger, secret, auth, postgres, disk, or agent`.

**Correct (all top-level declarations demonstrated):**

```swirls
version: 1

schema contact_payload {
  label: "Contact payload"
  schema: @json {
    { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
  }
}

form contact {
  label: "Contact"
  enabled: true
  visibility public
  schema: contact_payload
}

webhook inbound {
  label: "Inbound"
  enabled: true
  secret: api_creds.SHARED_SECRET
  header: "X-Webhook-Signature"
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
    inputSchema: contact_payload
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
  vars: [API_KEY, SHARED_SECRET]
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

### The twelve valid top-level blocks

- `schema <name> { }` — Reusable JSON Schema referenced by bare identifier from forms, webhooks, root `inputSchema`/`outputSchema`, and node `schema`. See `resource-schema`.
- `form <name> { }` — UI forms and API endpoints. See `resource-form`.
- `webhook <name> { }` — HTTP endpoints for external payloads. See `resource-webhook`.
- `schedule <name> { }` — Cron-based triggers. See `resource-schedule`.
- `graph <name> { }` — Workflow DAGs. See `graph-anatomy`.
- `stream <name> { }` — Persist a graph's output as typed records. See `resource-stream`.
- `trigger <name> { }` — Binds resources to graphs. See `resource-trigger-binding`.
- `secret <name> { }` — Named groups of secret var identifiers. See `resource-secrets`.
- `auth <name> { }` — Authentication configuration for http nodes. See `resource-auth`.
- `postgres <name> { }` — External PostgreSQL connection and table schemas. See `resource-postgres`.
- `disk <name> { }` — Archil-backed remote disk mount; `type: disk` nodes bind to it and run bash. See `resource-disk`.
- `agent <name> { }` — LLM agent definition (provider, model, tools, roles); `type: agent` nodes bind to it. See `resource-agent`.

### Version line

`version: <number>` is optional. If present, it appears once, typically at the top. The parser accepts it anywhere and stores the number on the AST.

### Block comments are preserved

`/* ... */` block comments immediately before a top-level declaration attach to it as a doc comment and are preserved by the serializer.
