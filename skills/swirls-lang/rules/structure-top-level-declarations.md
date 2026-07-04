---
title: Top-Level Declarations
impact: HIGH
tags: file, structure, declarations, schema, form, webhook, schedule, workflow, stream, view, trigger, secret, auth, postgres, database, migration, disk, skill, agent, mcp, channel, connection, app, role, policy
---

## Top-Level Declarations

A `.swirls` file contains twenty-three kinds of top-level declarations (plus the optional `version:` line), in any order. There are no imports, exports, or module syntax.

**Incorrect (using unsupported syntax):**

```swirls
import { helper } from "./utils.swirls"

export workflow my_workflow {
  // ...
}
```

The parser errors: `Unexpected token: expected form, webhook, schedule, graph, workflow, stream, view, trigger, secret, auth, connection, action, app, postgres, database, migration, disk, skill, agent, mcp, channel, schema, role, or policy`.

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
  visibility: public
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

workflow process {
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
  workflow: process
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return {} }
    }
  }
}

view process_log_table {
  label: "Process log table"
  streams: [process_log]
  schema: @json { { "type": "object" } }
  columns: @ts { return { ...context.streams.process_log.output } }
}

secret api_creds {
  vars: [API_KEY, SHARED_SECRET]
}

secret vendor_keys {
  vars: [OPENROUTER_API_KEY]
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

database app_db {
  label: "App database"
  schema: @prisma {
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
    }
  }
}

migration backfill_defaults {
  database: app_db
  order: 1
  operation: @ts {
    return { ok: true }
  }
}

trigger on_contact {
  form:contact -> process
  enabled: true
}

skill product_kb {
  name: "product-kb"
}

mcp support_desk {
  label: "Support desk"
  description: "Remote MCP server for the support tooling"
}

agent concierge {
  label: "Concierge"
  secrets: vendor_keys
  provider: openrouter
  model: "openai/gpt-4o-mini"
  skills: [product_kb]
  mcp: [support_desk]
}

channel concierge_web {
  label: "Concierge (Web)"
  platform: web
  agent: concierge
  mode: dm
  enabled: true
}

connection acme_slack {
  label: "Acme Slack"
  provider: slack
}

app concierge_portal {
  description "Customer-facing portal: chat with the concierge agent and see process runs."

  expose {
    agent concierge
    view  process_log_table
  }
}

role admins {
  match {
    org_role: admin
  }
}

policy {
  allow admins -> agent concierge
}
```

### The twenty-three valid top-level blocks

- `schema <name> { }` — Reusable JSON Schema referenced by bare identifier from forms, webhooks, root `inputSchema`/`outputSchema`, and node `schema`. See `resource-schema`.
- `form <name> { }` — UI forms and API endpoints. See `resource-form`.
- `webhook <name> { }` — HTTP endpoints for external payloads. See `resource-webhook`.
- `schedule <name> { }` — Cron-based triggers. See `resource-schedule`.
- `workflow <name> { }` — Workflow DAGs (legacy keyword: `graph`). See `workflow-anatomy`.
- `stream <name> { }` — Persist a workflow's output as typed records. See `resource-stream`.
- `view <name> { }` — Compose stream blocks into a spreadsheet: map each source row through `columns`, optionally add `computed` columns that run a graph per row. See `resource-view`.
- `trigger <name> { }` — Binds resources to workflows. See `resource-trigger-binding`.
- `secret <name> { }` — Named groups of secret var identifiers. See `resource-secrets`.
- `auth <name> { }` — Authentication configuration for http nodes. See `resource-auth`.
- `postgres <name> { }` — External, bring-your-own PostgreSQL connection and table schemas. See `resource-postgres`.
- `database <name> { }` — Swirls-managed Postgres with a Prisma-language `schema: @prisma { }` island; provisioned and migrated by Swirls. See `resource-database`.
- `migration <name> { }` — Ordered, run-once data transform against a `database` block. See `resource-migration`.
- `disk <name> { }` — Platform-provisioned remote disk mount; `type: disk` nodes bind to it and run bash. See `resource-disk`.
- `skill <name> { }` — Local knowledge-skill package from `.agents/skills/<name>/`, referenced by `agent.skills:`. See `resource-skill`.
- `agent <name> { }` — LLM agent definition (provider, model, tools, profiles, skills, MCP slots, subagent `team`); `type: agent` nodes bind to it. See `resource-agent`.
- `mcp <name> { }` — Remote MCP server slot referenced by `agent.mcp:`; bound to a URL and optional bearer token per project in Cloud, tools discovered at runtime as `mcp__<slot>__<tool>`. See `resource-mcp`.
- `channel <name> { }` — Binds an agent to a chat platform (Slack, Linear, Discord, web) so it answers messages there. See `resource-channel`.
- `connection <name> { }` — Project-scoped, Swirls-brokered outbound OAuth slot (`provider:` slack/linear/discord/linkedin/microsoft); referenced by `http` nodes and channels via `connection:`. See `resource-connection`.
- `action <name> { }` — Typed integration operation (provider/method/path) referenced by `type: integration` nodes via `action:`. See `resource-action`.
- `app <name> { }` — Generated application surface over the deployment. Requires `description` and a non-empty `expose { }` naming the agents, workflows, views, and databases it surfaces; `brand { }` is optional. Every field inside is space-separated, never `key: value`. See `resource-app`.
- `role <name> { }` — Derives a named role from verified principal attributes via `match { }`. See `resource-access-control`.
- `policy { }` — Nameless; `allow|deny <role> -> agent <name>|*` grants. Declaring a grant flips the project to deny-by-default. See `resource-access-control`.

### Version line

`version: <number>` is optional. If present, it appears once, typically at the top. The parser accepts it anywhere and stores the number on the AST.

### Block comments are preserved

`/* ... */` block comments immediately before a top-level declaration attach to it as a doc comment and are preserved by the serializer.
