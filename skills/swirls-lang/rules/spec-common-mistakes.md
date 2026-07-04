---
title: Common LLM Mistakes
impact: CRITICAL
tags: spec, mistakes, hallucination, wrong, incorrect, common
---

## Common Mistakes

These are patterns that look plausible but are wrong. Each example shows the incorrect version followed by the correct version.

### 1. Writing TypeScript outside of @ts blocks

**Incorrect:**

```swirls
node process {
  type: code
  label: "Process"
  code: return { value: 1 }
}
```

**Correct:**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts { return { value: 1 } }
}
```

All executable code must be inside `@ts { }` blocks.

### 2. Using `type: resend` instead of `type: email`

**Incorrect:**

```swirls
node notify {
  type: resend
  from: @ts { return "noreply@example.com" }
  to: @ts { return "user@example.com" }
  subject: @ts { return "Hello" }
}
```

`resend` is not a valid node type. Resend is the underlying vendor; the DSL type name is `email`.

**Correct:**

```swirls
node notify {
  type: email
  label: "Send notification"
  from: @ts { return "noreply@example.com" }
  to: @ts { return "user@example.com" }
  subject: @ts { return "Hello" }
}
```

### 3. Using `type: firecrawl` instead of `type: scrape`

**Incorrect:**

```swirls
node fetch_page {
  type: firecrawl
  url: @ts { return "https://example.com" }
}
```

`firecrawl` is not a valid node type. Firecrawl is the underlying vendor; the DSL type name is `scrape`.

**Correct:**

```swirls
node fetch_page {
  type: scrape
  label: "Fetch page"
  url: @ts { return "https://example.com" }
}
```

### 4. Using `outputSchema` on a non-root node

**Incorrect:**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts { return { value: 1 } }
  outputSchema: @json { { "type": "object" } }
}
```

**Correct:**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts { return { value: 1 } }
  schema: @json { { "type": "object" } }
}
```

Non-root nodes use `schema`, not `outputSchema`. The parser rejects `outputSchema` on non-root nodes and drops the node.

### 5. Using `inputSchema` on a non-root node

**Incorrect:**

```swirls
node enrich {
  type: code
  label: "Enrich"
  inputSchema: @json { { "type": "object" } }
  code: @ts { return {} }
}
```

The parser errors: `inputSchema is only allowed in root { } blocks` and the entire node is silently dropped from the AST. Only root nodes have an `inputSchema` (the trigger payload shape). Non-root nodes' inputs are derived from upstream `schema` outputs.

**Correct:**

```swirls
root {
  type: code
  label: "Entry"
  inputSchema: @json { { "type": "object" } }
  code: @ts { return context.nodes.root.input }
}

node enrich {
  type: code
  label: "Enrich"
  code: @ts { return context.nodes.root.output }
}
```

### 6. Inventing conditional edges

**Incorrect:**

```swirls
flow {
  root -> process
  process -> notify if process.output.shouldNotify
  process -> skip if !process.output.shouldNotify
}
```

**Correct:**

```swirls
node route {
  type: switch
  label: "Route"
  cases: ["notify", "skip"]
  router: @ts {
    if (context.nodes.process.output.shouldNotify) return "notify"
    return "skip"
  }
}

flow {
  root -> process
  process -> route
  route -["notify"]-> notify
  route -["skip"]-> skip
}
```

Conditional routing requires a switch node with labeled edges.

### 7. Using imports or require

**Incorrect:**

```swirls
import { utils } from "./helpers"

workflow my_workflow {
  label: "My Workflow"
  root {
    type: code
    label: "Entry"
    code: @ts { return utils.process(context.nodes.root.input) }
  }
}
```

**Correct:**

```swirls
workflow my_workflow {
  label: "My Workflow"
  root {
    type: code
    label: "Entry"
    code: @ts { return { value: context.nodes.root.input.value } }
  }
}
```

No imports exist. For reusable code, use `@ts "path.ts.swirls"` file references within individual node fields.

### 8. Using variables or assignments at DSL level

**Incorrect:**

```swirls
const API_URL = "https://api.example.com"

workflow fetch {
  label: "Fetch"
  root {
    type: http
    label: "Call API"
    url: API_URL
  }
}
```

**Correct:**

```swirls
workflow fetch {
  label: "Fetch"
  root {
    type: http
    label: "Call API"
    url: @ts { return "https://api.example.com" }
  }
}
```

No variables or constants exist at the DSL level.

### 9. Using `fetch` or `import` inside @ts blocks

**Incorrect:**

```swirls
node call_api {
  type: code
  label: "Call API"
  code: @ts {
    const res = await fetch("https://api.example.com/data")
    return await res.json()
  }
}
```

**Correct:**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com/data" }
}
```

Code nodes are sandboxed. No `fetch`, `import`, `require`, `fs`, or `process.env`. Use `http` nodes for API calls, `ai` nodes for LLM calls, `email` nodes for email, `scrape` for web scraping, `parallel` for multi-query research, `agent` for agentic loops with tools, `disk` for filesystem exec.

### 10. Using `process.env` instead of `context.secrets`

**Incorrect:**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: @ts { return { Authorization: "Bearer " + process.env.API_KEY } }
}
```

**Correct:**

```swirls
secret my_creds {
  vars: [API_KEY]
}

node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: @ts { return { Authorization: "Bearer " + context.secrets.my_creds.API_KEY } }
  secrets: {
    my_creds: [API_KEY]
  }
}
```

The `secrets:` field on a node is an **object literal**, not an array. It maps secret block names to arrays of var names: `{ blockName: [VAR1, VAR2] }`.

### 11. Inventing node types

**Incorrect:**

```swirls
node transform {
  type: each
  items: @ts { return context.nodes.root.output.list }
  fn: @ts { return (item) => item.name }
}
```

**Correct (transform stays in a code node):**

```swirls
node transform {
  type: code
  label: "Transform"
  code: @ts {
    return context.nodes.root.output.list.map(item => item.name)
  }
}
```

**Correct (per-item iteration with subgraph uses `type: map`):**

```swirls
node per_item {
  type: map
  label: "Process each"
  items: @ts { return context.nodes.root.output.list }
  maxItems: 100

  subgraph {
    root {
      type: code
      inputSchema: @json { { "type": "object", "properties": { "name": { "type": "string" } } } }
      code: @ts { return { name: context.iteration.item.name.toUpperCase() } }
    }
  }
}
```

There are exactly 18 node types: `agent`, `ai`, `bucket`, `code`, `database`, `disk`, `email`, `http`, `integration`, `map`, `parallel`, `postgres`, `scrape`, `stream`, `switch`, `wait`, `while`, `workflow`. (`graph` is a legacy alias for `workflow`.) Simple data transformation belongs in `code` nodes; per-item iteration belongs in `map` nodes; counter/condition loops belong in `while` nodes; Parallel.ai web research belongs in `parallel` nodes — not workflow concurrency.

### 11b. Using `type: parallel` for workflow concurrency

**Incorrect (treating parallel as fan-out):**

```swirls
node run_steps {
  type: parallel
  label: "Run all steps"
}
```

`parallel` is the Parallel.ai vendor node (`operation: search`, `extract`, or `findall`). It does not fan out workflow steps or run DAG branches concurrently.

**Correct (per-item iteration; iterations run one at a time):**

```swirls
node per_item {
  type: map
  label: "Process each"
  items: @ts { return context.nodes.root.output.items }
  maxItems: 100
  workflow: process_one
}
```

**Correct (independent DAG branches — no special node):**

```swirls
flow {
  root -> enrich
  root -> validate
  enrich -> combine
  validate -> combine
}
```

**Correct (Parallel.ai web research):**

```swirls
node research {
  type: parallel
  label: "Research topic"
  operation: search
  objective: @ts { return "Find recent articles about " + context.nodes.root.output.topic }
  searchQueries: @ts {
    const topic = context.nodes.root.output.topic
    return [topic + " overview", topic + " trends"]
  }
}
```

### 12. Missing label on workflow or node

Labels default to the block name, so this parses, but best practice is to set an explicit one for readability. Workflows require `label:` for proper display in the Portal.

**Sub-optimal:**

```swirls
workflow my_workflow {
  root {
    type: code
    code: @ts { return {} }
  }
}
```

**Correct:**

```swirls
workflow my_workflow {
  label: "My Workflow"
  root {
    type: code
    label: "Entry"
    code: @ts { return {} }
  }
}
```

### 13. Edges outside of flow block

**Incorrect:**

```swirls
workflow my_workflow {
  label: "My Workflow"
  root { type: code label: "Entry" code: @ts { return {} } }
  node step { type: code label: "Step" code: @ts { return {} } }
  root -> step
}
```

The parser emits: `Edge declarations must be inside a flow { } block`.

**Correct:**

```swirls
workflow my_workflow {
  label: "My Workflow"
  root { type: code label: "Entry" code: @ts { return {} } }
  node step { type: code label: "Step" code: @ts { return {} } }
  flow {
    root -> step
  }
}
```

### 14. Using @yaml, @graphql, or other invented block types

**Incorrect:**

```swirls
node query {
  type: code
  label: "Query"
  code: @graphql { query { users { name } } }
}
```

Only `@ts`, `@json`, and `@sql` fenced blocks exist. Embed other formats as strings inside `@ts` blocks.

### 15. Chaining edges on one line

**Incorrect:**

```swirls
flow {
  root -> validate -> process -> notify
}
```

**Correct:**

```swirls
flow {
  root -> validate
  validate -> process
  process -> notify
}
```

One edge per line. No chaining. Parallel branches (multiple edges from the same source) are fine.

### 16. Referencing a `.ts.swirls` file that does not exist

**Incorrect:**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts "./handlers/transform.ts.swirls"
}
```

If the referenced path does not exist on disk, `swirls doctor` will report: `@ts file not found: ./handlers/transform.ts.swirls`. The file must exist before you can reference it. The path must end with `.ts.swirls`, never `.ts`.

**Correct:**

Create the `.ts.swirls` file first, or use an inline `@ts` block:

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const items = context.nodes.root.output.items || []
    return { count: items.length }
  }
}
```

### 17. Using `persistence { }` (removed)

**Incorrect:**

```swirls
workflow submissions {
  label: "Submissions"
  persistence {
    enabled: true
    condition: @ts { return true }
  }
  root {
    type: code
    label: "Entry"
    code: @ts { return context.nodes.root.input }
  }
}
```

The parser errors: `persistence { } blocks have been removed — use a top-level stream block instead`.

**Correct:**

```swirls
workflow submissions {
  label: "Submissions"
  root {
    type: code
    label: "Entry"
    outputSchema: @json { { "type": "object", "properties": { "message": { "type": "string" } } } }
    code: @ts { return context.nodes.root.input }
  }
}

stream submission_log {
  label: "Submission log"
  workflow: submissions
  version: v1
  versions: {
    v1 {
      schema: @json {
        {
          "type": "object",
          "properties": { "message": { "type": "string" } }
        }
      }
      condition: @ts { return true }
      prepare: @ts {
        return { message: context.output.root.message }
      }
    }
  }
}
```

`schema`, `condition`, and `prepare` go **inside a `versions:` entry**, not at the top level. Placing them at the top level errors: `top-level "schema" is invalid on stream blocks — use versions { v1 { schema, condition?, prepare } }`.

### 18. Using `query` or `querySql` on a stream node

**Incorrect:**

```swirls
node recent {
  type: stream
  stream: "submissions"
  query: @sql { SELECT * FROM {{table}} LIMIT 10 }
}
```

The validator errors: `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)`.

**Correct:**

```swirls
node recent {
  type: stream
  label: "Recent submissions"
  stream: submissions
  version: v1
  filter: @ts {
    return {
      score: { gte: 50 }
    }
  }
}
```

Stream nodes reference a stream block by bare identifier (not a string), pin a `version:` (a `versions:` key on that stream), and filter with an `@ts` block returning a `StreamFilter` object.

### 19. Declaring `agent:` trigger

**Incorrect:**

```swirls
trigger agent_trigger {
  agent:my_agent -> my_workflow
}
```

There is no `agent` trigger type. Only `form`, `webhook`, and `schedule` are valid resource prefixes.

**Correct:**

```swirls
trigger on_submission {
  form:contact_form -> my_workflow
  enabled: true
}
```

### 20. Trigger binding with separate fields

**Incorrect:**

```swirls
trigger my_trigger {
  resource: contact_form
  resourceType: form
  workflow: my_workflow
}
```

**Correct:**

```swirls
trigger my_trigger {
  form:contact_form -> my_workflow
  enabled: true
}
```

The binding is a single syntactic line `<type>:<name> -> <workflow>`. No separate fields.

### 21. Using an array for `secrets:`

**Incorrect:**

```swirls
node call_api {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: [API_KEY]
}
```

The parser errors: `Expected { after secrets:`.

**Correct:**

```swirls
node call_api {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: {
    my_creds: [API_KEY]
  }
}
```

### 22. Referencing a workflow or stream as a string on a node

**Incorrect:**

```swirls
node call_helper {
  type: workflow
  workflow: "helper_workflow"
  input: @ts { return {} }
}
```

**Correct:**

```swirls
node call_helper {
  type: workflow
  workflow: helper_workflow
  input: @ts { return {} }
}
```

`workflow:` on a workflow node, `stream:` on a stream node, `postgres:` on a postgres node, and `auth:` on an http node all take **bare identifiers**, not quoted strings. (Bare identifiers are parsed as string values, so `"helper_workflow"` also works, but convention is bare.)

### 23. Hyphenated or non-alphanumeric resource name

**Incorrect:**

```swirls
form contact-form {
  label: "Contact"
}
```

The validator errors: `Form name: Name must contain only letters, numbers, and underscores`.

**Correct:**

```swirls
form contact_form {
  label: "Contact"
}
```

Resource names match `^[a-zA-Z0-9_]+$`. No hyphens, dots, spaces, or other special characters. This applies to every name: forms, webhooks, schedules, workflows, streams, triggers, secrets, auths, postgres blocks, schemas, nodes, secret vars, switch cases, and review action ids.

### 24. Quoting the `visibility` value (or dropping its colon) on a form

**Incorrect (quoted value):**

```swirls
form contact {
  label: "Contact"
  visibility: "public"
}
```

The parser errors: `Expected \`public\` or \`internal\` after \`visibility:\``. The value must be a **bare identifier** (`public` or `internal`), never a quoted string.

**Incorrect (missing colon):**

```swirls
form contact {
  label: "Contact"
  visibility public
}
```

The parser errors: `Expected \`:\` after \`visibility\``. `visibility` is a normal key:value field — the colon is required.

**Correct:**

```swirls
form contact {
  label: "Contact"
  visibility: public
}
```

Default is `internal` when omitted. `public` exposes the form via Triggers; `internal` returns 404. See `resource-form`.

### 25. Webhook with no auth (silently accepts any request)

**Sub-optimal (warning):**

```swirls
webhook inbound {
  label: "Inbound"
}
```

The validator warns: `Webhook "inbound" has no "secret" or "header" set and will accept any POST without verification.`

**Incorrect (only one of the pair set):**

```swirls
webhook inbound {
  label: "Inbound"
  secret: my_creds.SHARED
}
```

The validator errors: `Webhook "inbound" has "secret" but is missing "header".` Both fields must be set together.

**Correct:**

```swirls
secret my_creds {
  vars: [SHARED_SECRET]
}

webhook inbound {
  label: "Inbound"
  secret: my_creds.SHARED_SECRET
  header: "X-Webhook-Signature"
}
```

`secret:` uses dot notation (no quotes). `header:` is a quoted custom header name. Reserved headers (`Cookie`, `Host`, `Content-Type`, `User-Agent`, `X-Forwarded-*`, etc.) are rejected. See `resource-webhook`.

### 26. Using `subgraph:` with a colon

**Incorrect:**

```swirls
node each_item {
  type: map
  items: @ts { return [{ x: 1 }] }
  maxItems: 10

  subgraph: {
    root { type: code code: @ts { return {} } }
  }
}
```

`subgraph` is a bare block, not a key:value pair. There is no colon.

**Correct:**

```swirls
node each_item {
  type: map
  items: @ts { return [{ x: 1 }] }
  maxItems: 10

  subgraph {
    root {
      type: code
      inputSchema: @json { { "type": "object", "properties": { "x": { "type": "number" } } } }
      code: @ts { return { doubled: context.iteration.item.x * 2 } }
    }
  }
}
```

See `workflow-subgraph`.

### 27. Map / while node with both `subgraph { }` and `workflow:`

**Incorrect:**

```swirls
node each_item {
  type: map
  items: @ts { return [] }
  maxItems: 10
  workflow: helper_workflow
  subgraph {
    root { type: code code: @ts { return {} } }
  }
}
```

The validator errors: `map node requires exactly one of subgraph { } or workflow: <name>`. Pick one. Use `workflow: <name>` to call an existing top-level workflow; use `subgraph { }` to inline the iteration body.

### 28. Map / while subgraph root without `inputSchema`

**Incorrect:**

```swirls
node each_item {
  type: map
  items: @ts { return [{ x: 1 }] }
  maxItems: 10

  subgraph {
    root {
      type: code
      code: @ts { return context.iteration.item }
    }
  }
}
```

The validator errors: `map/while subgraph root must declare inputSchema for typed iteration`. The subgraph root needs `inputSchema` (inline @json, object literal, or bare schema name) so the iteration item is typed.

**Correct:**

```swirls
schema item_shape {
  label: "Item"
  schema: @json {
    { "type": "object", "required": ["x"], "properties": { "x": { "type": "number" } } }
  }
}

node each_item {
  type: map
  items: @ts { return [{ x: 1 }] }
  maxItems: 10

  subgraph {
    root {
      type: code
      inputSchema: item_shape
      code: @ts { return { doubled: context.iteration.item.x * 2 } }
    }
  }
}
```

### 29. Forgetting `maxItems` / `maxIterations`

**Incorrect (map without `maxItems`):**

```swirls
node per_item {
  type: map
  items: @ts { return [] }
  subgraph { root { type: code code: @ts { return {} } } }
}
```

The validator errors: `map node requires maxItems as a positive number` and `Node type "map" requires "maxItems"`. `maxItems` is mandatory and bounds the iteration.

**Incorrect (while without `maxIterations`):**

```swirls
node refine {
  type: while
  input: @ts { return { count: 0 } }
  condition: @ts { return context.iteration.input.count < 10 }
  update: @ts { return { count: context.iteration.input.count + 1 } }
  subgraph { root { type: code code: @ts { return {} } } }
}
```

Errors: `while node requires maxIterations as a positive integer` and `Node type "while" requires "maxIterations"`. `maxIterations` is the safety cap that prevents runaway loops.

### 30. Setting `schema:` on a vendor-managed node type

**Incorrect:**

```swirls
node send_email {
  type: email
  from: @ts { return "from@example.com" }
  to: @ts { return "to@example.com" }
  subject: @ts { return "Hello" }
  schema: @json { { "type": "object" } }
}
```

The validator errors: `"email" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.` This applies to `scrape`, `parallel`, `email`, and `disk` — their output shape is fixed by the platform.

### 31. Using `kind: text` with a `schema:` on an AI node

**Sub-optimal (warning):**

```swirls
node summarize {
  type: ai
  kind: text
  prompt: @ts { return "Summarize: " + context.nodes.root.output.text }
  schema: @json {
    { "type": "object", "properties": { "summary": { "type": "string" } } }
  }
}
```

The validator warns: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` Either remove the schema (string output) or change to `kind: object` (structured JSON output).

### 32. Ignoring a top-level `schema` block by inlining the same JSON repeatedly

**Sub-optimal (duplication):**

```swirls
form contact {
  label: "Contact"
  schema: @json {
    { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
  }
}

workflow handle {
  label: "Handle"
  root {
    type: code
    inputSchema: @json {
      { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
    }
    code: @ts { return context.nodes.root.input }
  }
}
```

**Correct (factor out a top-level schema and reference it by name):**

```swirls
schema contact_payload {
  label: "Contact payload"
  schema: @json {
    { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
  }
}

form contact {
  label: "Contact"
  schema: contact_payload
}

workflow handle {
  label: "Handle"
  root {
    type: code
    inputSchema: contact_payload
    outputSchema: contact_payload
    code: @ts { return context.nodes.root.input }
  }
}
```

The bare identifier (`contact_payload`) references the top-level `schema` block. See `resource-schema`.

### 33. Using `schema:` on a root block

**Incorrect:**

```swirls
root {
  type: code
  code: @ts { return {} }
  schema: @json { { "type": "object" } }
}
```

`schema:` is not a recognized key on `root { }` blocks — the parser cannot consume the `@json` value, emits `Unexpected token`, and drops the rest of the root config. Root blocks use `inputSchema` and `outputSchema`; only non-root nodes use `schema`.

**Correct:**

```swirls
root {
  type: code
  code: @ts { return {} }
  outputSchema: @json { { "type": "object" } }
}
```

### 34. Agent `team` that references itself or forms a cycle

`team: [ … ]` names other `agent` blocks as subagents. An agent cannot list itself, a team member cannot collide with one of the agent's `tools:` workflow names, and the delegation chain cannot contain a cycle.

**Incorrect:**

```swirls
agent orchestrator {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  team: [orchestrator]   // self-reference
}
```

Error: `Agent "orchestrator" cannot include itself in team:`. A loop such as `a -> b -> a` errors with `Agent team contains a cycle: a -> b -> a`.

**Correct:**

```swirls
agent orchestrator {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  team: [researcher, writer]
}
```

Team members are bare identifiers, not quoted strings. See `resource-agent`.

### 35. Putting a `datasource` or `generator` block inside a `@prisma` island

**Incorrect:**

```swirls
database my_db {
  schema: @prisma {
    datasource db {
      provider = "postgresql"
      url      = env("DATABASE_URL")
    }
    generator client {
      provider = "prisma-client-js"
    }
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
    }
  }
}
```

Swirls provisions the database and holds the connection; the `@prisma` island is **models and enums only**. Swirls wraps your schema with its own fixed `datasource` + `generator` header before validating it at deploy time, so a user-supplied one collides and the deploy fails Prisma's validator.

**Correct:**

```swirls
database my_db {
  schema: @prisma {
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
    }
  }
}
```

See `resource-database`.

### 36. Calling `$transaction` from a `code` node

**Incorrect:**

```swirls
node settle_invoice {
  type: code
  code: @ts {
    return context.db.my_db.$transaction(async (tx) => {
      return tx.invoice.update({ where: { id: 1 }, data: { status: "PAID" } })
    })
  }
}
```

This throws at runtime: `Managed database: transactions are only available in a database node with operation: transaction`. A `code` node's `context.db.<name>` is the full client, but it is deliberately transaction-free.

**Correct:**

```swirls
node settle_invoice {
  type: database
  database: my_db
  operation: transaction
  run: @ts {
    return context.db.my_db.$transaction(async (tx) => {
      return tx.invoice.update({ where: { id: 1 }, data: { status: "PAID" } })
    })
  }
}
```

See `node-database` and `context-db`.

### 37. Using `postgres` and `database` interchangeably

**Incorrect (assuming `postgres` provisions a database):**

```swirls
postgres my_db {
  label: "New database"
  connection: DATABASE_URL

  table users {
    schema: @json { { "type": "object", "properties": { "email": { "type": "string" } } } }
  }
}
```

`postgres` never provisions anything — it is a connection to a database you already run, and `connection:` must resolve to a real, existing database or every query fails at runtime.

**Correct (want Swirls to provision and manage the database):**

```swirls
database my_db {
  label: "New database"
  schema: @prisma {
    model User {
      id    Int    @id @default(autoincrement())
      email String @unique
    }
  }
}
```

Use `postgres` for a database you own and operate; use `database` when you want Swirls to provision, migrate, and hold the connection for you. See `resource-postgres` and `resource-database`.
