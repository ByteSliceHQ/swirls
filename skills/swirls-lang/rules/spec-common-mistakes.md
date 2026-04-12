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

Non-root nodes use `schema`, not `outputSchema`. The parser rejects `outputSchema` on non-root nodes.

### 5. Inventing conditional edges

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

### 6. Using imports or require

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

### 7. Using variables or assignments at DSL level

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

### 8. Using `fetch` or `import` inside @ts blocks

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

Code nodes are sandboxed. No `fetch`, `import`, `require`, `fs`, or `process.env`. Use `http` nodes for API calls, `ai` nodes for LLM calls, `resend` nodes for email.

### 9. Using `process.env` instead of `context.secrets`

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

### 10. Inventing node types

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

There are exactly 12 node types: `ai`, `bucket`, `code`, `document`, `resend`, `graph`, `http`, `postgres`, `firecrawl`, `stream`, `switch`, `wait`. Data transformation belongs in `code` nodes.

### 11. Missing label on graph or node

**Incorrect:**

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

Every graph and every node requires a `label` field.

### 12. Edges outside of flow block

**Incorrect:**

```swirls
graph my_graph {
  label: "My Graph"
  root { type: code label: "Entry" code: @ts { return {} } }
  node step { type: code label: "Step" code: @ts { return {} } }
  root -> step
}
```

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

All edges must be inside a `flow { }` block.

### 13. Using @yaml, @graphql, or other invented block types

**Incorrect:**

```swirls
node query {
  type: code
  label: "Query"
  code: @graphql { query { users { name } } }
}
```

**Correct:**

Only `@ts`, `@json`, and `@sql` fenced blocks exist. Embed other formats as strings inside `@ts` blocks.

### 14. Chaining edges on one line

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

One edge per line. No chaining.
