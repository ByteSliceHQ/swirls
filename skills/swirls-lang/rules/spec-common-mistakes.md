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

### 2. Using `type: email` instead of `type: resend`

**Incorrect:**

```swirls
node notify {
  type: email
  from: @ts { return "noreply@example.com" }
  to: @ts { return "user@example.com" }
  subject: @ts { return "Hello" }
}
```

**Correct:**

```swirls
node notify {
  type: resend
  label: "Send notification"
  from: @ts { return "noreply@example.com" }
  to: @ts { return "user@example.com" }
  subject: @ts { return "Hello" }
}
```

### 3. Using `type: scrape` instead of `type: firecrawl`

**Incorrect:**

```swirls
node fetch_page {
  type: scrape
  url: @ts { return "https://example.com" }
}
```

**Correct:**

```swirls
node fetch_page {
  type: firecrawl
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

graph my_graph {
  label: "My Graph"
  root {
    type: code
    label: "Entry"
    code: @ts { return utils.process(context.nodes.root.input) }
  }
}
```

**Correct:**

```swirls
graph my_graph {
  label: "My Graph"
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

graph fetch {
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
graph fetch {
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

Code nodes are sandboxed. No `fetch`, `import`, `require`, `fs`, or `process.env`. Use `http` nodes for API calls, `ai` nodes for LLM calls, `resend` nodes for email, `firecrawl` for scraping, `parallel` for multi-query research.

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
  type: map
  items: @ts { return context.nodes.root.output.list }
  fn: @ts { return (item) => item.name }
}
```

**Correct:**

```swirls
node transform {
  type: code
  label: "Transform"
  code: @ts {
    return context.nodes.root.output.list.map(item => item.name)
  }
}
```

There are exactly 13 node types: `ai`, `bucket`, `code`, `document`, `firecrawl`, `graph`, `http`, `parallel`, `postgres`, `resend`, `stream`, `switch`, `wait`. Data transformation belongs in `code` nodes.

### 12. Missing label on graph or node

Labels default to the block name, so this parses, but best practice is to set an explicit one for readability. Graphs require `label:` for proper display in the Portal.

**Sub-optimal:**

```swirls
graph my_graph {
  root {
    type: code
    code: @ts { return {} }
  }
}
```

**Correct:**

```swirls
graph my_graph {
  label: "My Graph"
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
graph my_graph {
  label: "My Graph"
  root { type: code label: "Entry" code: @ts { return {} } }
  node step { type: code label: "Step" code: @ts { return {} } }
  root -> step
}
```

The parser emits: `Edge declarations must be inside a flow { } block`.

**Correct:**

```swirls
graph my_graph {
  label: "My Graph"
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
graph submissions {
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
graph submissions {
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
  graph: submissions
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
```

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
  filter: @ts {
    return {
      score: { gte: 50 }
    }
  }
}
```

Stream nodes reference a stream block by bare identifier (not a string) and filter with an `@ts` block returning a `StreamFilter` object.

### 19. Declaring `agent:` trigger

**Incorrect:**

```swirls
trigger agent_trigger {
  agent:my_agent -> my_graph
}
```

There is no `agent` trigger type. Only `form`, `webhook`, and `schedule` are valid resource prefixes.

**Correct:**

```swirls
trigger on_submission {
  form:contact_form -> my_graph
  enabled: true
}
```

### 20. Trigger binding with separate fields

**Incorrect:**

```swirls
trigger my_trigger {
  resource: contact_form
  resourceType: form
  graph: my_graph
}
```

**Correct:**

```swirls
trigger my_trigger {
  form:contact_form -> my_graph
  enabled: true
}
```

The binding is a single syntactic line `<type>:<name> -> <graph>`. No separate fields.

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

### 22. Referencing a graph or stream as a string on a node

**Incorrect:**

```swirls
node call_helper {
  type: graph
  graph: "helper_graph"
  input: @ts { return {} }
}
```

**Correct:**

```swirls
node call_helper {
  type: graph
  graph: helper_graph
  input: @ts { return {} }
}
```

`graph:` on a graph node, `stream:` on a stream node, `postgres:` on a postgres node, and `auth:` on an http node all take **bare identifiers**, not quoted strings. (Bare identifiers are parsed as string values, so `"helper_graph"` also works, but convention is bare.)

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

Resource names match `^[a-zA-Z0-9_]+$`. No hyphens, dots, spaces, or other special characters. This applies to every name: forms, webhooks, schedules, graphs, streams, triggers, secrets, auths, postgres blocks, nodes, secret vars, switch cases, and review action ids.
