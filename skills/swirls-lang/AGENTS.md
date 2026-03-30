# Swirls Language - Complete Reference

> Comprehensive guide for authoring .swirls workflow files. Generated from individual rule files.

# 1. File Structure

### 1.1. Comment Syntax and ASCII Restriction

Swirls supports single-line (`//`) and multi-line (`/* */`) comments. Doc comments (`/* */`) placed before a declaration are shown on hover in the LSP.

Unicode characters in comments break the parser's line counting and cause graphs after the comment to be silently dropped.

**Incorrect (Unicode in comments):**

```swirls
// ──────────────────────────────
// Graph: get_token → fetch OAuth
// ──────────────────────────────
graph get_token {
  // This graph may be silently dropped
}
```

**Correct (ASCII only in comments):**

```swirls
// -------------------------------------------
// Graph: get_token - fetch OAuth
// -------------------------------------------
graph get_token {
  // This graph is parsed correctly
}
```

Doc comments appear in editor hover tooltips:

```swirls
/* Normalizes name, email, and message (trim + lowercase email). */
root {
  type: code
  label: "Entry"
  code: @ts { return {} }
}
```

Use only ASCII characters in comments: letters, digits, spaces, hyphens, underscores, periods, parentheses, and standard punctuation. Avoid box-drawing characters, arrows, em dashes, and other Unicode.

---

### 1.2. File Discovery and Extensions

The Swirls CLI discovers `.swirls` files recursively from the project root. Files with `.ts.swirls` extension are standalone TypeScript files referenced from `code: @ts "./path.ts.swirls"` and are not parsed as DSL.

**Incorrect (wrong file extension for external TypeScript):**

```
handlers/normalize.ts        // Not discovered by Swirls
handlers/normalize.swirls    // Parsed as DSL, will fail
```

**Correct (proper extensions):**

```
workflow.swirls               // DSL file - discovered and parsed
handlers/normalize.ts.swirls  // Standalone TS - only included via @ts reference
```

Discovery rules:
- Searches `.swirls` files recursively from project root
- Ignores `node_modules/` and `__fixtures__/` directories
- Ignores `.ts.swirls` files (only loaded when referenced)
- Each `.swirls` file is parsed independently

A standalone `.ts.swirls` file contains a TypeScript function body (use `return`) with the same `context` object as inline `@ts` blocks:

```typescript
// handlers/normalize.ts.swirls
const raw = context.nodes.root.input.email ?? ""
return { email: raw.trim().toLowerCase() }
```

Reference it from a node:

```swirls
root {
  type: code
  label: "Normalize"
  code: @ts "./handlers/normalize.ts.swirls"
}
```

---

### 1.3. Top-Level Declarations

A `.swirls` file contains five kinds of top-level declarations in any order. There are no imports, exports, or module syntax.

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

trigger on_contact {
  form:contact -> process
  enabled: true
}
```

The five valid top-level blocks are:
- `form <name> { }` - UI forms and API endpoints
- `webhook <name> { }` - HTTP endpoints for external payloads
- `schedule <name> { }` - Cron-based triggers
- `graph <name> { }` - Workflow DAGs
- `trigger <name> { }` - Binds resources to graphs

`version: <number>` is optional and can appear once at the top.

---

# 2. Graph & Node Basics

### 2.1. Graph Anatomy

A graph is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, optional persistence block, exactly one root node, zero or more additional nodes, and a flow block.

**Incorrect (missing required parts):**

```swirls
graph my_graph {
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

This fails because there is no `label` and no `root { }` block.

**Correct (complete graph structure):**

```swirls
graph my_graph {
  label: "My Graph"
  description: "Optional description"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }
    code: @ts {
      return context.nodes.root.input ?? {}
    }
  }

  node process {
    type: code
    label: "Process"
    code: @ts {
      const x = context.nodes.root.output.x
      return { result: x }
    }
  }

  flow {
    root -> process
  }
}
```

Graph fields:
- `label` - Required display name
- `description` - Optional description
- `persistence { }` - Optional stream persistence config
- `root { }` - Required entry node (exactly one)
- `node <name> { }` - Additional nodes (zero or more)
- `flow { }` - Edge declarations connecting nodes

---

### 2.2. DAG Constraints

Graphs must be directed acyclic graphs (DAGs). The validator enforces no cycles, exactly one root, and valid edge references.

**Incorrect (cycle in edges):**

```swirls
flow {
  root -> step_a
  step_a -> step_b
  step_b -> step_a
}
```

Error: "Graph contains a cycle - DAG workflows cannot have cycles"

**Incorrect (edge references non-existent node):**

```swirls
flow {
  root -> process
  process -> nonexistent_node
}
```

Error: "Edge references non-existent target node 'nonexistent_node'"

**Incorrect (self-referencing edge):**

```swirls
flow {
  root -> root
}
```

Error: "Edge cannot connect a node to itself"

**Correct (valid DAG with parallel and sequential branches):**

```swirls
graph pipeline {
  label: "Pipeline"

  root {
    type: code
    label: "Entry"
    code: @ts { return context.nodes.root.input ?? {} }
  }

  node enrich { type: code label: "Enrich" code: @ts { return {} } }
  node validate { type: code label: "Validate" code: @ts { return {} } }
  node combine { type: code label: "Combine" code: @ts { return {} } }

  flow {
    root -> enrich
    root -> validate
    enrich -> combine
    validate -> combine
  }
}
```

Validation rules:
- No cycles (topological sort must include all nodes)
- Exactly one node with zero incoming edges (the root)
- The zero-incoming-edge node must be declared with `root { }` syntax
- All edge sources and targets must reference existing node names
- No self-edges

---

### 2.3. Flow Block and Edges

The `flow { }` block connects nodes with directed edges. Simple edges use `->`. Labeled edges (for switch nodes) use `-["label"]->`.

**Incorrect (wrong edge syntax):**

```swirls
flow {
  root => process           // Wrong: use -> not =>
  root -> process -> done   // Wrong: no chaining
  classify -[urgent]-> h    // Wrong: label must be quoted
}
```

**Correct (valid edge syntax):**

```swirls
flow {
  root -> process
  process -> done
}
```

**Correct (labeled edges for switch routing):**

```swirls
node classify {
  type: switch
  label: "Classify"
  cases: ["urgent", "normal", "low"]
  router: @ts {
    const body = context.nodes.root.output.body.toLowerCase()
    if (body.includes("urgent")) return "urgent"
    if (body.length > 500) return "normal"
    return "low"
  }
}

node handle_urgent {
  type: ai
  kind: text
  label: "Handle urgent"
  model: "gpt-4o-mini"
  prompt: @ts { return context.nodes.root.output.body }
}

node handle_normal {
  type: code
  label: "Handle normal"
  code: @ts { return { status: "normal" } }
}

flow {
  root -> classify
  classify -["urgent"]-> handle_urgent
  classify -["normal"]-> handle_normal
  classify -["low"]-> handle_low
}
```

Edge rules:
- One edge per line: `source -> target`
- Labeled edges: `source -["label"]-> target`
- Labels must be quoted strings matching a case in the switch node
- Source and target must reference defined node names
- No chaining: each edge is its own line
- Parallel branches are fine (root -> a, root -> b)

---

### 2.4. Root Node Requirements

Every graph must have exactly one `root { }` block. The root is the entry point. It receives the trigger payload via `context.nodes.root.input`. It is the only node that should use `inputSchema`.

**Incorrect (using node instead of root for entry):**

```swirls
graph my_graph {
  label: "My Graph"

  node entry {
    type: code
    label: "Entry"
    code: @ts { return {} }
  }
}
```

This fails validation: "Graph must declare root { } as the entry node."

**Incorrect (multiple root blocks):**

```swirls
graph my_graph {
  label: "My Graph"

  root {
    type: code
    label: "Entry A"
    code: @ts { return {} }
  }

  root {
    type: code
    label: "Entry B"
    code: @ts { return {} }
  }
}
```

**Correct (single root block with inputSchema):**

```swirls
graph my_graph {
  label: "My Graph"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["email"],
        "properties": {
          "email": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["email"],
        "properties": {
          "email": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
    code: @ts {
      const email = context.nodes.root.input.email ?? ""
      return { email: email.toLowerCase().trim() }
    }
  }
}
```

Root node rules:
- Declared with `root { }` syntax (not `node root { }`)
- Exactly one per graph
- Must have no incoming edges in the flow block
- Only node where `inputSchema` is meaningful (defines trigger payload shape)
- Can be any node type (code, ai, switch, etc.)

---

# 3. Node Types

### 3.1. AI Nodes

AI nodes call language models and other AI services. The `kind` field determines the output type and which additional fields are valid.

**Required fields:** `kind`, `model`, `prompt`

**Incorrect (object kind without schema):**

```swirls
node classify {
  type: ai
  label: "Classify"
  kind: object
  model: "anthropic/claude-3.5-sonnet"
  prompt: @ts { return "Classify this text" }
}
```

Error: AI nodes with `kind: object` require a `schema` to define the structured output.

**Correct (object kind with schema):**

```swirls
node classify {
  type: ai
  label: "Classify"
  kind: object
  model: "anthropic/claude-3.5-sonnet"
  prompt: @ts {
    const msg = context.nodes.root.output.message
    return "Classify this message as spam or not:\n\n" + msg
  }
  schema: @json {
    {
      "type": "object",
      "required": ["category", "confidence"],
      "properties": {
        "category": { "type": "string", "enum": ["spam", "not_spam"] },
        "confidence": { "type": "number" }
      }
    }
  }
}
```

**Correct (text kind for plain string output):**

```swirls
node summarize {
  type: ai
  label: "Summarize"
  kind: text
  model: "gpt-4o-mini"
  temperature: 0.7
  maxTokens: 200
  prompt: @ts {
    return "Summarize: " + context.nodes.root.output.body
  }
}
```

**Correct (image kind):**

```swirls
node generate_image {
  type: ai
  label: "Generate"
  kind: image
  model: "openai/dall-e-3"
  prompt: @ts { return "A professional illustration of " + context.nodes.root.output.topic }
  options: { n: 1, size: "1024x1024" }
}
```

**Correct (embed kind):**

```swirls
node embed {
  type: ai
  label: "Embed"
  kind: embed
  model: "openai/text-embedding-3-small"
  prompt: @ts { return [context.nodes.root.output.text] }
}
```

AI kinds: `text`, `object`, `image`, `video`, `embed`

AI node fields:
| Field | Required | Type |
|-------|----------|------|
| `kind` | yes | text, object, image, video, embed |
| `model` | yes | String (provider/model format) |
| `prompt` | yes | `@ts` block |
| `schema` | required for object | `@json` block |
| `temperature` | no | Number (0-1) |
| `maxTokens` | no | Number |
| `options` | no | Object (kind-specific, e.g. n, size) |

AI nodes infer `OPENROUTER_API_KEY` as a secret. You do not need to declare it.

---

### 3.2. Bucket Nodes

Bucket nodes perform S3-like file operations: upload, download, and delete.

**Required fields:** `operation`

**Correct (upload a file):**

```swirls
node store_file {
  type: bucket
  label: "Store file"
  operation: "upload"
  path: @ts { return "files/data.json" }
}
```

Bucket node fields:
| Field | Required | Type |
|-------|----------|------|
| `operation` | yes | "upload", "download", "delete" |
| `path` | no | `@ts` block or string |
| `bucket` | no | String |

---

### 3.3. Code Nodes

Code nodes execute TypeScript in an isolated sandbox. They are for data transformation only: reshaping inputs, normalizing strings, computing derived values, and structuring outputs. They cannot make network requests, import modules, or access the filesystem.

**Required fields:** `code`

**Incorrect (trying to use fetch or imports in a code node):**

```swirls
node fetch_data {
  type: code
  label: "Fetch data"
  code: @ts {
    const res = await fetch("https://api.example.com/data")
    return await res.json()
  }
}
```

This fails silently at runtime. Code nodes have no access to `fetch`, `require`, or any I/O.

**Correct (pure data transformation):**

```swirls
node normalize {
  type: code
  label: "Normalize"
  outputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
  code: @ts {
    const { name, email } = context.nodes.root.output
    return {
      name: name.trim(),
      email: email.trim().toLowerCase(),
    }
  }
}
```

**Correct (referencing external TypeScript file):**

```swirls
node normalize {
  type: code
  label: "Normalize"
  code: @ts "./handlers/normalize.ts.swirls"
}
```

If you need network access, use an `http` node. If you need AI, use an `ai` node. If you need to send email, use an `email` node. Break your graph into multiple nodes with the right types.

Code node fields:
| Field | Required | Type |
|-------|----------|------|
| `code` | yes | `@ts` block or `@ts "file.ts.swirls"` |
| `outputSchema` | no | `@json` block |
| `inputSchema` | no | `@json` block (usually only on root) |
| `review` | no | Review config block |
| `secrets` | no | Array of secret key identifiers |

---

### 3.4. Document Nodes

Document nodes handle document processing tasks.

**Correct (basic document node):**

```swirls
node process_doc {
  type: document
  label: "Process document"
  documentId: "uuid-here"
}
```

Document node fields:
| Field | Required | Type |
|-------|----------|------|
| `documentId` | no | String (UUID) |

---

### 3.5. Email Nodes

Email nodes send email via Resend. Every email node requires `from`, `to`, and `subject`.

**Required fields:** `from`, `to`, `subject`

**Incorrect (missing from field):**

```swirls
node notify {
  type: email
  label: "Notify"
  to: @ts { return "team@example.com" }
  subject: @ts { return "Alert" }
  text: @ts { return "Something happened" }
}
```

Error: "Node type 'email' requires 'from'"

**Correct (complete email node):**

```swirls
node notify {
  type: email
  label: "Send notification"
  from: @ts { return "noreply@example.com" }
  to: @ts { return context.nodes.root.output.email }
  subject: @ts { return "We received your message" }
  text: @ts {
    const summary = context.nodes.summarize.output.text ?? ""
    return "Thanks for reaching out. Summary: " + summary
  }
}
```

**Correct (with HTML body):**

```swirls
node notify {
  type: email
  label: "Send HTML email"
  from: @ts { return "noreply@example.com" }
  to: @ts { return context.nodes.root.output.email }
  subject: @ts { return "Welcome" }
  html: @ts {
    const name = context.nodes.root.output.name
    return "<h1>Welcome, " + name + "!</h1><p>Thanks for signing up.</p>"
  }
}
```

Email node fields:
| Field | Required | Type |
|-------|----------|------|
| `from` | yes | `@ts` block or string |
| `to` | yes | `@ts` block or string |
| `subject` | yes | `@ts` block or string |
| `text` | no | `@ts` block or string |
| `html` | no | `@ts` block or string |
| `replyTo` | no | `@ts` block or string |

Email nodes infer `RESEND_API_KEY` as a secret. You do not need to declare it.

---

### 3.6. Graph Nodes (Subgraphs)

Graph nodes call another graph as a subgraph. The child graph runs independently with the provided input, and its leaf node outputs become available to downstream nodes.

**Required fields:** `graph`, `input`

**Incorrect (missing input):**

```swirls
node run_helper {
  type: graph
  label: "Run helper"
  graph: helper_graph
}
```

Error: "Node type 'graph' requires 'input'"

**Incorrect (referencing graph in another file):**

```swirls
// helper.swirls defines helper_graph
// main.swirls references it
node run_helper {
  type: graph
  label: "Run helper"
  graph: helper_graph
  input: @ts { return context.nodes.root.input }
}
```

Warning: `swirls doctor` does not resolve cross-file references. It reports "Graph node references graph 'helper_graph' which is not defined." Keep related graphs in the same file.

**Correct (subgraph in same file):**

```swirls
graph helper_graph {
  label: "Helper"
  root {
    type: code
    label: "Double"
    inputSchema: @json {
      { "type": "object", "required": ["value"], "properties": { "value": { "type": "number" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["value"], "properties": { "value": { "type": "number" } } }
    }
    code: @ts {
      return { value: context.nodes.root.input.value * 2 }
    }
  }
}

graph main_graph {
  label: "Main"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "required": ["value"], "properties": { "value": { "type": "number" } } }
    }
    code: @ts { return { value: context.nodes.root.input.value } }
  }

  node run_helper {
    type: graph
    label: "Run helper"
    graph: helper_graph
    input: @ts {
      return context.nodes.root.input
    }
  }

  node result {
    type: code
    label: "Result"
    code: @ts {
      const out = context.nodes.run_helper.output.root
      return { doubled: out.value }
    }
  }

  flow {
    root -> run_helper
    run_helper -> result
  }
}
```

Subgraph output is accessed as `context.nodes.<graphNodeName>.output.<leafNodeName>`. The leaf node names come from the child graph.

Graph node fields:
| Field | Required | Type |
|-------|----------|------|
| `graph` | yes | Graph name (must be defined in same file) |
| `input` | yes | `@ts` block |

---

### 3.7. HTTP Nodes

HTTP nodes make external API requests. Use these instead of trying to use `fetch` in code nodes.

**Required fields:** `url`

**Incorrect (using fetch in a code node):**

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

Code nodes cannot make network requests.

**Correct (HTTP node for API calls):**

```swirls
node call_api {
  type: http
  label: "Call API"
  method: "POST"
  url: @ts {
    return "https://api.example.com/data"
  }
  body: @ts {
    return JSON.stringify({
      query: context.nodes.root.output.query,
    })
  }
  outputSchema: @json {
    {
      "type": "object",
      "properties": {
        "results": { "type": "array" }
      }
    }
  }
}
```

**Warning:** Do not use `headers` with hyphenated keys like `Content-Type`. The parser treats hyphens as subtraction operators and silently drops the rest of the file. HTTP nodes default to JSON content type. See the parser-hyphenated-headers rule.

HTTP node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `method` | no | "GET", "POST", "PUT", "DELETE", "PATCH" (default: "GET") |
| `headers` | no | Object (avoid hyphenated keys) |
| `body` | no | `@ts` block |
| `outputSchema` | no | `@json` block |

---

### 3.8. Scrape Nodes

Scrape nodes fetch and extract content from web pages. They support CSS selectors for targeted extraction.

**Required fields:** `url`

**Correct (basic scrape):**

```swirls
node scrape_page {
  type: scrape
  label: "Scrape webpage"
  url: @ts { return context.nodes.root.input.url }
}
```

**Correct (with CSS selector and options):**

```swirls
node scrape_article {
  type: scrape
  label: "Scrape article"
  url: @ts { return context.nodes.root.output.url }
  selector: ".article-content"
  onlyMainContent: true
  formats: ["markdown", "html"]
  maxAge: 3600
}
```

Scrape node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `selector` | no | CSS selector string |
| `onlyMainContent` | no | Boolean |
| `formats` | no | String array ("markdown", "html") |
| `maxAge` | no | Number (cache seconds) |
| `parsers` | no | String array |

Scrape nodes infer `FIRECRAWL_API_KEY` as a secret. You do not need to declare it.

---

### 3.9. Stream Nodes

Stream nodes query persisted data from other graphs. They reference a stream name and optionally include a SQL query with `{{table}}` placeholder.

**Required fields:** `stream` (or `streamId`)

**Correct (stream node with SQL query):**

```swirls
node recent {
  type: stream
  label: "Recent submissions"
  stream: "submissions"
  query: @sql {
    SELECT "root.score" AS score, "root.message" AS message
    FROM {{table}}
    WHERE created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 10
  }
  outputSchema: @json {
    {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
  }
}
```

See the `stream-query-sql` and `stream-column-naming` rules for SQL query details.

Stream node fields:
| Field | Required | Type |
|-------|----------|------|
| `stream` | yes | String (stream/graph name) |
| `query` | no | `@sql` block |
| `outputSchema` | no | `@json` block |

---

### 3.10. Switch Nodes

Switch nodes route execution to one of several branches based on a TypeScript router function. The router returns a case name that determines which labeled edge to follow.

**Required fields:** `cases`, `router`

**Incorrect (router returns value not in cases):**

```swirls
node route {
  type: switch
  label: "Route"
  cases: ["a", "b"]
  router: @ts {
    return "c"
  }
}
```

The router must return one of the declared case strings.

**Incorrect (edges missing labels for switch):**

```swirls
flow {
  root -> classify
  classify -> handle_a
  classify -> handle_b
}
```

Switch nodes require labeled edges.

**Correct (switch with labeled edges):**

```swirls
node classify {
  type: switch
  label: "Classify urgency"
  cases: ["urgent", "normal", "low"]
  router: @ts {
    const body = (context.nodes.root.output.body ?? "").toLowerCase()
    if (body.includes("urgent") || body.includes("asap")) return "urgent"
    if (body.length > 500) return "normal"
    return "low"
  }
}

node handle_urgent {
  type: ai
  kind: text
  label: "Draft escalation"
  model: "gpt-4o-mini"
  prompt: @ts {
    return "Draft escalation for: " + context.nodes.root.output.subject
  }
}

node handle_normal {
  type: code
  label: "Standard response"
  code: @ts { return { status: "acknowledged" } }
}

node handle_low {
  type: code
  label: "Auto-acknowledge"
  code: @ts { return { status: "logged" } }
}

flow {
  root -> classify
  classify -["urgent"]-> handle_urgent
  classify -["normal"]-> handle_normal
  classify -["low"]-> handle_low
}
```

Switch node fields:
| Field | Required | Type |
|-------|----------|------|
| `cases` | yes | String array |
| `router` | yes | `@ts` block (must return a case string) |

---

### 3.11. Wait Nodes

Wait nodes pause graph execution for a specified duration.

**Correct (static wait):**

```swirls
node delay {
  type: wait
  label: "Wait 5 minutes"
  amount: 5
  unit: "minutes"
}
```

Wait node fields:
| Field | Required | Type |
|-------|----------|------|
| `amount` | no | Number |
| `unit` | no | "seconds", "minutes", "hours", "days" |

---

# 4. TypeScript Blocks

### 4.1. TypeScript Block Syntax

TypeScript code can be embedded inline with `@ts { }` or referenced from an external `.ts.swirls` file with `@ts "path"`. Both forms have the same `context` object in scope.

**Incorrect (missing @ts prefix):**

```swirls
node process {
  type: code
  label: "Process"
  code: {
    return { result: 42 }
  }
}
```

**Incorrect (using .ts extension instead of .ts.swirls):**

```swirls
code: @ts "./handler.ts"
```

**Correct (inline @ts block):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const email = context.nodes.root.input.email ?? ""
    return { email: email.toLowerCase() }
  }
}
```

**Correct (external file reference):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts "./handlers/process.ts.swirls"
}
```

The external file contains a function body (not a module). Use `return` and `context` directly:

```typescript
// handlers/process.ts.swirls
const email = context.nodes.root.input.email ?? ""
return { email: email.toLowerCase() }
```

The `@ts` prefix is used for: `code`, `prompt`, `router`, `from`, `to`, `subject`, `text`, `html`, `replyTo`, `url`, `body`, `input`, `path`, and persistence `condition` fields.

Brace balancing: the lexer counts `{` and `}` depth to find the closing brace. Inner braces (objects, if-blocks, functions) are fine as long as they are balanced.

---

### 4.2. No Dollar Sign Before Interpolation

A literal `$` immediately before `${...}` interpolation (e.g. formatting currency) breaks `@ts` block parsing. The parser sees `$${` and fails to determine where the interpolation begins.

**Incorrect (dollar sign before interpolation):**

```swirls
code: @ts {
  return `Total: $${amount.toFixed(2)}`
}
```

**Correct (use concatenation):**

```swirls
code: @ts {
  return "Total: $" + amount.toFixed(2)
}
```

**Incorrect (price formatting):**

```swirls
prompt: @ts {
  return `The price is $${price} per unit`
}
```

**Correct (concatenation):**

```swirls
prompt: @ts {
  return "The price is $" + price + " per unit"
}
```

Any time you need a literal `$` followed by a `${` interpolation, use string concatenation instead of a template literal.

---

### 4.3. No Double-Quote Characters in @ts Blocks

Literal `"` characters inside `@ts { }` blocks confuse the parser's string boundary detection. The `@ts` block appears to parse correctly, but all subsequent graphs in the file are silently dropped. `swirls doctor` reports fewer graphs than expected with no error.

**Incorrect (regex with double-quote):**

```swirls
code: @ts {
  s.replace(/"/g, '""')
}
```

**Incorrect (string containing double-quote):**

```swirls
code: @ts {
  return '"' + value + '"'
}
```

**Incorrect (checking for double-quote):**

```swirls
code: @ts {
  if (s.includes('"')) { }
}
```

**Correct (use String.fromCharCode(34)):**

```swirls
code: @ts {
  const Q = String.fromCharCode(34)
  s.split(Q).join(Q + Q)          // instead of s.replace(/"/g, '""')
  return Q + value + Q            // instead of '"' + value + '"'
  if (s.indexOf(Q) >= 0) { }      // instead of s.includes('"')
}
```

This is one of the most common causes of "missing graphs" with no error message.

---

### 4.4. No Nested Template Literals in @ts Blocks

Template literals inside `${}` interpolation expressions break `@ts` block parsing. The inner backtick is mistaken for the end of the outer template literal. All subsequent content in the file may be silently dropped.

**Incorrect (nested template literals):**

```swirls
code: @ts {
  const result = `Summary:\n${items.map(w => `  - ${w}`).join("\n")}`
}
```

**Correct (use string concatenation for the inner expression):**

```swirls
code: @ts {
  const result = "Summary:\n" + items.map(w => "  - " + w).join("\n")
}
```

**Incorrect (nested template in prompt):**

```swirls
prompt: @ts {
  return `Results:\n${data.map(r => `${r.name}: ${r.score}`).join("\n")}`
}
```

**Correct (concatenation):**

```swirls
prompt: @ts {
  return "Results:\n" + data.map(r => r.name + ": " + r.score).join("\n")
}
```

Rule: never use backticks inside `${}` interpolation. Use `+` concatenation or helper variables instead.

---

### 4.5. Safe TypeScript Patterns

The Swirls parser has known issues with certain TypeScript patterns inside `@ts { }` blocks. Some patterns are always safe. Others silently break parsing. Use this as a quick reference.

**Always safe:**

```typescript
// Simple string concatenation
return "Hello, " + name + "!"

// Single-level template literals with ${} interpolation
return `Hello, ${name}!`

// Nullish coalescing
const val = input.field ?? "default"

// JSON.stringify (no nested templates)
return JSON.stringify({ key: value })

// Array methods with concatenation (not nested templates)
items.map(x => "- " + x).join("\n")

// Ternary expressions
const label = score > 80 ? "high" : "low"

// Object spreads
return { ...context.nodes.root.output, extra: "value" }
```

**Avoid (breaks parsing):**

```typescript
// Nested template literals - use concatenation instead
`outer ${`inner ${x}`}`
// Fix: "outer " + `inner ${x}`

// Dollar sign before interpolation - use concatenation
`$${amount}`
// Fix: "$" + amount

// Literal double-quote characters - use String.fromCharCode(34)
s.includes('"')
// Fix: s.indexOf(String.fromCharCode(34)) >= 0

// Regex with double-quote
s.replace(/"/g, '""')
// Fix: s.split(String.fromCharCode(34)).join(String.fromCharCode(34) + String.fromCharCode(34))
```

When in doubt, use string concatenation instead of template literals, and `String.fromCharCode(34)` instead of literal double-quote characters.

---

### 4.6. Code Node Sandbox Limits

`@ts` blocks in `code` nodes run in an isolated sandbox with no access to the outside world. They cannot import modules, make network requests, access the filesystem, or use environment variables directly.

**Incorrect (trying to import modules):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    import crypto from "crypto"
    return { hash: crypto.randomUUID() }
  }
}
```

**Incorrect (trying to use fetch):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const res = await fetch("https://api.example.com")
    return await res.json()
  }
}
```

**Incorrect (trying to read env vars):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const key = process.env.API_KEY
    return { key }
  }
}
```

**Correct (pure data transformation only):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const { name, email } = context.nodes.root.output
    return {
      name: name.trim(),
      email: email.trim().toLowerCase(),
    }
  }
}
```

**Correct (use the right node type for I/O):**

| Need | Use |
|------|-----|
| HTTP requests | `http` node |
| AI model calls | `ai` node |
| Send email | `email` node |
| Scrape web pages | `scrape` node |
| Read persisted data | `stream` node |
| Access secrets | `context.secrets.KEY_NAME` in @ts block |

Code nodes are strictly for reshaping inputs, normalizing strings, computing derived values, and structuring outputs. Break your workflow into multiple nodes with the right types.

---

# 5. Schema & Typing

### 5.1. Inline Schema Syntax

Schemas can use either `@json { }` blocks (with double-quoted JSON) or inline object literal syntax (without `@json`, no quotes on keys). Both are valid.

**Correct (@json block syntax):**

```swirls
inputSchema: @json {
  {
    "type": "object",
    "required": ["title", "body"],
    "properties": {
      "title": { "type": "string" },
      "body": { "type": "string" }
    },
    "additionalProperties": false
  }
}
```

**Correct (inline object literal syntax):**

```swirls
inputSchema: {
  type: "object"
  required: ["title", "body"]
  properties: {
    title: {
      type: "string"
    }
    body: {
      type: "string"
    }
  }
  additionalProperties: false
}
```

The inline syntax uses the DSL's own object format: keys are unquoted, commas are optional, and string values are double-quoted.

Both produce the same AST. Use whichever style is more readable for your case. `@json` is more common and maps directly to JSON Schema documentation.

---

### 5.2. inputSchema and outputSchema

`inputSchema` defines the shape of data a node receives. `outputSchema` defines what it produces. The LSP uses these to type `context.nodes.<name>.input` and `context.nodes.<name>.output` for autocomplete and validation.

**Key rule:** `inputSchema` is meaningful only on the root node. It defines the shape of the trigger payload. On non-root nodes, input is derived from upstream node outputs via the flow edges.

**Incorrect (inputSchema on a non-root node for typing upstream):**

```swirls
node process {
  type: code
  label: "Process"
  inputSchema: @json {
    { "type": "object", "properties": { "email": { "type": "string" } } }
  }
  code: @ts {
    return { email: context.nodes.root.output.email }
  }
}
```

Defining `inputSchema` on non-root nodes is allowed but rarely useful. The LSP infers input types from upstream `outputSchema` declarations.

**Correct (inputSchema on root, outputSchema on all nodes):**

```swirls
root {
  type: code
  label: "Entry"
  inputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
  outputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
  code: @ts {
    const { name, email } = context.nodes.root.input
    return { name: name.trim(), email: email.trim().toLowerCase() }
  }
}

node greet {
  type: code
  label: "Greet"
  outputSchema: @json {
    {
      "type": "object",
      "required": ["greeting"],
      "properties": { "greeting": { "type": "string" } }
    }
  }
  code: @ts {
    return { greeting: "Hello, " + context.nodes.root.output.name + "!" }
  }
}
```

Best practice: define `outputSchema` on every node that produces data. This enables LSP autocomplete for all downstream `@ts` blocks.

---

### 5.3. JSON Schema Format

All schemas in Swirls use JSON Schema (draft 7) format inside `@json { }` blocks. Schemas define the shape of form inputs, node outputs, AI structured responses, and review forms.

**Incorrect (using TypeScript types instead of JSON Schema):**

```swirls
outputSchema: @json {
  { name: string, email: string }
}
```

**Correct (JSON Schema format):**

```swirls
outputSchema: @json {
  {
    "type": "object",
    "required": ["name", "email"],
    "properties": {
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    },
    "additionalProperties": false
  }
}
```

**Correct (array schema):**

```swirls
outputSchema: @json {
  {
    "type": "array",
    "items": {
      "type": "object",
      "required": ["id", "value"],
      "properties": {
        "id": { "type": "string" },
        "value": { "type": "number" }
      }
    }
  }
}
```

Supported JSON Schema features:
- `type`: string, number, boolean, array, object, null
- `required`, `properties`, `items`, `additionalProperties`
- `enum`, `const`
- `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`
- `minItems`, `maxItems`, `uniqueItems`
- `allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`
- `$ref`, `$id`, `$schema`

The `@json { }` block must contain valid JSON. Keys must be double-quoted. Trailing commas are not allowed.

---

# 6. Context Object

### 6.1. context.meta - Execution Metadata

`context.meta` provides metadata about the current execution.

**Correct (accessing execution metadata):**

```swirls
root {
  type: code
  label: "Entry"
  code: @ts {
    const triggerId = context.meta.triggerId
    const triggerType = context.meta.triggerType
    return {
      triggerId: triggerId ?? "unknown",
      triggerType: triggerType ?? "unknown",
    }
  }
}
```

Available fields:
- `context.meta.triggerId` - String or null. The trigger that started this execution.
- `context.meta.triggerType` - "form", "webhook", "schedule", "agent", or null.

---

### 6.2. context.nodes - Accessing Node Data

In `@ts` blocks, `context.nodes` provides access to all ancestor node inputs and outputs. The root node has both `input` (trigger payload) and `output` (its return value). Downstream nodes access upstream outputs.

**Incorrect (accessing input on a non-root node):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    // Non-root nodes don't have .input in the typical sense
    const email = context.nodes.process.input.email
    return { email }
  }
}
```

**Correct (root accesses input, downstream accesses output):**

```swirls
root {
  type: code
  label: "Entry"
  code: @ts {
    // Root has .input from the trigger payload
    const email = context.nodes.root.input.email ?? ""
    return { email: email.toLowerCase() }
  }
}

node enrich {
  type: code
  label: "Enrich"
  code: @ts {
    // Downstream accesses root's output
    const email = context.nodes.root.output.email
    return { email, domain: email.split("@")[1] ?? "" }
  }
}
```

**Correct (accessing any upstream node):**

```swirls
node result {
  type: code
  label: "Result"
  code: @ts {
    const rootEmail = context.nodes.root.output.email
    const enrichDomain = context.nodes.enrich.output.domain
    return { email: rootEmail, domain: enrichDomain }
  }
}
```

**Accessing subgraph output:**

When using a `type: graph` node, the output is keyed by the child graph's leaf node names:

```swirls
node result {
  type: code
  label: "Result"
  code: @ts {
    // run_helper is a graph node calling helper_graph
    // helper_graph's root is its leaf node
    const out = context.nodes.run_helper.output.root
    return { doubled: out.value }
  }
}
```

Pattern summary:
- `context.nodes.root.input` - trigger payload (root node only)
- `context.nodes.<name>.output` - any upstream node's return value
- `context.nodes.<graphNode>.output.<leafName>` - subgraph leaf output

---

### 6.3. context.reviews - Accessing Review Responses

When a node has a `review` block with a `schema`, downstream nodes can access the reviewer's response via `context.reviews.<nodeName>`.

**Correct (accessing review data):**

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts {
    return { title: context.nodes.root.output.title }
  }
  review: {
    enabled: true
    title: "Review draft"
    schema: @json {
      {
        "type": "object",
        "required": ["approved"],
        "properties": {
          "approved": { "type": "boolean" },
          "feedback": { "type": "string" }
        }
      }
    }
  }
}

node publish {
  type: code
  label: "Publish"
  code: @ts {
    const { approved, feedback } = context.reviews.draft
    if (!approved) {
      return { published: false, message: "Rejected: " + (feedback ?? "none") }
    }
    return { published: true, message: "Published" }
  }
}

flow {
  root -> draft
  draft -> publish
}
```

The review response shape is determined by the `schema` in the review block. The LSP provides autocomplete for review fields based on this schema.

A node can also access its own review via `context.reviews.<itsOwnName>`.

---

### 6.4. context.secrets - Accessing Secrets

Secrets are accessed via `context.secrets.KEY_NAME` in `@ts` blocks. Custom secrets must be declared on the node with `secrets: [KEY_NAME]`. Some node types have inferred default secrets that do not need declaration.

**Incorrect (declaring secrets as a string array):**

```swirls
node process {
  type: code
  label: "Process"
  secrets: ["MY_TOKEN"]
  code: @ts { return { token: context.secrets.MY_TOKEN } }
}
```

Error: "Unexpected token: expected form, webhook, schedule, graph, or trigger"

**Incorrect (using process.env):**

```swirls
code: @ts {
  const key = process.env.API_KEY
}
```

Code nodes have no access to `process.env`.

**Correct (declaring secrets as identifiers):**

```swirls
root {
  type: code
  label: "Entry"
  secrets: [MY_SERVICE_TOKEN, ANOTHER_KEY]
  code: @ts {
    const token = context.secrets.MY_SERVICE_TOKEN
    return { hasToken: Boolean(token) }
  }
}
```

Secret keys are unquoted identifiers, not strings. They must match `[a-zA-Z0-9_]+`.

**Inferred secrets (no declaration needed):**

| Node Type | Inferred Secret |
|-----------|----------------|
| `ai` | `OPENROUTER_API_KEY` |
| `email` | `RESEND_API_KEY` |
| `scrape` | `FIRECRAWL_API_KEY` |

Set secret values via `bunx swirls env set KEY_NAME` or the dashboard.

---

# 7. Resources & Triggers

### 7.1. Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields.

**Correct (form with schema):**

```swirls
form contact_form {
  label: "Contact Form"
  description: "Public contact form: name, email, and message."
  enabled: true
  schema: @json {
    {
      "type": "object",
      "required": ["name", "email", "message"],
      "properties": {
        "name": { "type": "string", "title": "Name" },
        "email": { "type": "string", "title": "Email" },
        "message": { "type": "string", "title": "Message" }
      },
      "additionalProperties": false
    }
  }
}
```

Form fields:
| Field | Required | Type |
|-------|----------|------|
| `label` | yes | String |
| `description` | no | String |
| `enabled` | no | Boolean (default: true) |
| `schema` | no | `@json` block |

The `title` property in schema fields is used as the form field label in the Portal UI.

Form names must match `[a-zA-Z_][a-zA-Z0-9_]*` (letters, digits, underscores, starting with a letter or underscore).

---

### 7.2. Schedule Declarations

Schedules trigger graphs on a cron schedule. The payload is an empty object `{}`.

**Incorrect (missing cron):**

```swirls
schedule daily {
  label: "Daily run"
  timezone: "America/New_York"
}
```

Schedules require a `cron` field.

**Correct (schedule with cron and timezone):**

```swirls
schedule daily {
  label: "Daily run"
  cron: "0 9 * * *"
  timezone: "America/New_York"
  enabled: true
}
```

Schedule fields:
| Field | Required | Type |
|-------|----------|------|
| `label` | yes | String |
| `cron` | yes | Cron expression string |
| `timezone` | no | IANA timezone string |
| `enabled` | no | Boolean (default: true) |

Common cron expressions:
- `"0 9 * * *"` - Daily at 9 AM
- `"0 */6 * * *"` - Every 6 hours
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"*/15 * * * *"` - Every 15 minutes

---

### 7.3. Trigger Bindings

Triggers connect resources (forms, webhooks, schedules, agents) to graphs. When the resource fires, the graph executes with the resource payload as `context.nodes.root.input`.

**Incorrect (wrong syntax):**

```swirls
trigger my_trigger {
  form: contact_form
  graph: process_form
}
```

**Correct (binding syntax: resourceType:name -> graphName):**

```swirls
trigger on_contact {
  form:contact_form -> process_form
  enabled: true
}
```

**Correct (multiple triggers for one graph):**

```swirls
trigger webhook_trigger {
  webhook:inbound -> handle_event
  enabled: true
}

trigger schedule_trigger {
  schedule:daily -> handle_event
  enabled: true
}
```

**Correct (agent trigger):**

```swirls
trigger agent_trigger {
  agent:my_agent -> my_graph
}
```

Trigger binding syntax: `resourceType:resourceName -> graphName`

Valid resource types: `form`, `webhook`, `schedule`, `agent`

Validation rules:
- The resource and graph must be defined in the same file (except `agent` type)
- Trigger names must be unique
- A graph can have multiple triggers from different resources
- `swirls doctor` validates that referenced resources and graphs exist

---

### 7.4. Webhook Declarations

Webhooks create HTTP endpoints for receiving external payloads. They accept any HTTP POST and deliver the body to the connected graph.

**Correct (webhook with schema):**

```swirls
webhook inbound {
  label: "Inbound Webhook"
  enabled: true
  schema: @json {
    {
      "type": "object",
      "properties": {
        "event": { "type": "string" },
        "payload": { "type": "object" }
      },
      "additionalProperties": true
    }
  }
}
```

Webhook fields:
| Field | Required | Type |
|-------|----------|------|
| `label` | yes | String |
| `description` | no | String |
| `enabled` | no | Boolean (default: true) |
| `schema` | no | `@json` block |

Webhooks use the same name rules as forms: `[a-zA-Z_][a-zA-Z0-9_]*`.

---

# 8. Persistence & Streams

### 8.1. Stream Column Naming Convention

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

---

### 8.2. Persistence Block

A `persistence { }` block inside a graph stores each execution's node outputs in a queryable stream. The `condition` determines whether a given execution is persisted.

**Incorrect (persistence without condition):**

```swirls
graph my_graph {
  label: "My Graph"
  persistence {
    enabled: true
  }
  root { ... }
}
```

Error: "persistence block requires a non-empty condition (@ts { } or @ts '...')"

**Correct (persistence with condition):**

```swirls
graph submissions {
  label: "Record submission"

  persistence {
    enabled: true
    condition: @ts {
      return true
    }
  }

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    code: @ts {
      const { score, message } = context.nodes.root.input
      return { score: Number(score) ?? 0, message: String(message ?? "").trim() }
    }
  }
}
```

Persistence fields:
| Field | Required | Type |
|-------|----------|------|
| `enabled` | yes | Boolean |
| `condition` | yes | `@ts` block (must return boolean) |
| `name` | no | String (defaults to graph name) |

Rules:
- One graph = at most one stream
- Stream name defaults to graph name unless `name:` is specified
- Condition must be a non-empty `@ts` block returning `true` (persist) or `false` (skip)
- `name` must match `[a-zA-Z_][a-zA-Z0-9_]*`

---

### 8.3. SQL Queries with {{table}} Placeholder

Stream nodes can include a `@sql { }` block to filter, aggregate, or sort persisted data. The `{{table}}` placeholder is resolved at runtime to the stream's actual table name.

**Incorrect (hardcoded table name):**

```swirls
query: @sql {
  SELECT * FROM submissions_table
}
```

**Incorrect (non-SELECT query):**

```swirls
query: @sql {
  DELETE FROM {{table}} WHERE created_at < NOW() - INTERVAL '30 days'
}
```

Only SELECT queries are allowed.

**Correct (SELECT with {{table}} placeholder):**

```swirls
node recent {
  type: stream
  label: "Recent submissions"
  stream: "submissions"
  query: @sql {
    SELECT "root.score" AS score, "root.message" AS message
    FROM {{table}}
    WHERE created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 10
  }
  outputSchema: @json {
    {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
  }
}
```

Rules:
- Always use `{{table}}` as the table name placeholder
- Only SELECT queries are allowed
- Column names follow the `"nodeName.field"` pattern (see stream-column-naming rule)
- Use aliases (`AS score`) for cleaner output

---

# 9. Reviews

### 9.1. Accessing Review Data Downstream

Review responses are available in downstream nodes via `context.reviews.<nodeName>`. A common pattern is to route execution based on the review outcome using a switch node.

**Correct (route based on review approval):**

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts {
    return { text: "Draft content here" }
  }
  review: {
    enabled: true
    title: "Review draft"
    schema: @json {
      {
        "type": "object",
        "required": ["approved"],
        "properties": {
          "approved": { "type": "boolean" },
          "feedback": { "type": "string" }
        }
      }
    }
  }
}

node route {
  type: switch
  label: "Route"
  cases: ["publish", "revise"]
  router: @ts {
    const approved = context.reviews.draft?.approved
    return approved ? "publish" : "revise"
  }
}

node publish {
  type: code
  label: "Publish"
  code: @ts {
    return { published: true, text: context.nodes.draft.output.text }
  }
}

node revise {
  type: code
  label: "Revise"
  code: @ts {
    const feedback = context.reviews.draft?.feedback ?? "No feedback"
    return { published: false, feedback }
  }
}

flow {
  root -> draft
  draft -> route
  route -["publish"]-> publish
  route -["revise"]-> revise
}
```

The review schema determines the shape of `context.reviews.<nodeName>`. The LSP provides autocomplete based on the review schema fields.

---

### 9.2. Review Block Configuration

Review blocks pause graph execution at a node and wait for human input. The reviewer sees the node's output and can fill in a form defined by the review schema.

**Correct (basic review with schema):**

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts {
    return { title: context.nodes.root.output.title }
  }
  review: {
    enabled: true
    title: "Review draft"
    description: "Approve or request changes"
    schema: @json {
      {
        "type": "object",
        "required": ["approved"],
        "properties": {
          "approved": { "type": "boolean", "title": "Approved" },
          "feedback": { "type": "string", "title": "Feedback" }
        },
        "additionalProperties": false
      }
    }
  }
}
```

**Correct (review with custom actions):**

```swirls
review: {
  enabled: true
  title: "Approve content"
  actions: [
    { id: "approve", label: "Approve", outcome: "approve" },
    { id: "reject", label: "Reject", outcome: "reject" }
  ]
}
```

Review block fields:
| Field | Required | Type |
|-------|----------|------|
| `enabled` | yes | Boolean |
| `title` | no | String |
| `description` | no | String |
| `content` | no | String |
| `schema` | no | `@json` block (defines review form) |
| `approvedOutput` | no | String |
| `rejectedOutput` | no | String |
| `actions` | no | Array of action objects |

Action object fields: `id` (string), `label` (string), `outcome` ("approve" or "reject")

Any node type can have a review block. The review pauses execution after the node runs but before downstream nodes execute.

---

# 10. Parser Pitfalls

### 10.1. Parse Errors Cascade Past the Actual Problem

A single syntax issue causes the parser to lose its place. The reported line number is often after the actual problem. When you see "expected form, webhook, schedule, graph, or trigger", look above the reported line.

**Common causes of cascading errors:**

1. Unrecognized fields (like `secrets: ["KEY"]` with quoted strings)
2. Inline objects with special characters in keys
3. Mismatched braces in `@ts` or `@json` blocks
4. Double-quote characters inside `@ts` blocks
5. Nested template literals or `$${...}` in `@ts` blocks
6. Unicode characters in comments

**Debugging strategy:**

When doctor reports an error at line N, look at lines 1 through N for:
- Unbalanced `{` and `}` in `@ts` or `@json` blocks
- Any of the parser-breaking patterns from the parser pitfalls section
- Unrecognized field names on nodes

The actual problem is usually 5-50 lines above the reported line.

---

### 10.2. Dollar Sign Before Interpolation Breaks Parsing

A literal `$` immediately before a `${...}` interpolation (e.g. formatting currency as `$${amount}`) breaks `@ts` parsing. The parser sees `$${` and cannot determine where the interpolation begins.

**Incorrect:**

```swirls
code: @ts {
  return `Total: $${amount.toFixed(2)}`
}
```

**Correct (concatenation):**

```swirls
code: @ts {
  return "Total: $" + amount.toFixed(2)
}
```

Any time you need a literal `$` followed by a `${` interpolation, use string concatenation.

---

### 10.3. Double-Quote Characters Inside @ts Blocks

Literal `"` characters inside `@ts { }` blocks confuse the parser's string boundary detection. The `@ts` block itself appears to parse correctly, but all subsequent graphs, triggers, and resources in the file are silently dropped.

This is one of the most common causes of "missing graphs" with no error output.

**Incorrect (regex with double-quote):**

```swirls
code: @ts {
  s.replace(/"/g, '""')
}
```

**Incorrect (string containing double-quote):**

```swirls
code: @ts {
  return '"' + value + '"'
}
```

**Incorrect (checking for double-quote):**

```swirls
code: @ts {
  if (s.includes('"')) { }
}
```

**Correct (use String.fromCharCode(34)):**

```swirls
code: @ts {
  const Q = String.fromCharCode(34)
  s.split(Q).join(Q + Q)          // instead of s.replace(/"/g, '""')
  return Q + value + Q            // instead of '"' + value + '"'
  if (s.indexOf(Q) >= 0) { }      // instead of s.includes('"')
}
```

When `swirls doctor` reports fewer graphs than you defined with no error messages, check all `@ts` blocks for literal `"` characters.

---

### 10.4. Hyphenated Header Keys Parsed as Subtraction

Header keys like `Content-Type` cause the parser to treat the hyphen as a subtraction operator. Everything from that point to EOF is silently consumed. All subsequent graphs, triggers, and resources are dropped.

**Incorrect (hyphenated header key, unquoted):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: { Content-Type: "application/json" }
}
```

**Incorrect (hyphenated header key, quoted):**

```swirls
headers: { "Content-Type": "application/json" }
```

Even quoted keys with hyphens cause the same issue.

**Correct (omit the headers field entirely):**

```swirls
node call_api {
  type: http
  label: "Call API"
  method: "POST"
  url: @ts { return "https://api.example.com" }
  body: @ts {
    return JSON.stringify({ query: context.nodes.root.output.query })
  }
}
```

HTTP nodes default to JSON content type. There is currently no safe way to set custom headers with hyphenated keys. If you need `application/x-www-form-urlencoded`, the server may infer it from the body format.

---

### 10.5. Nested Template Literals Break @ts Parsing

Template literals inside `${}` interpolation (valid JavaScript/TypeScript) break `@ts` block parsing. The inner backtick is mistaken for the end of the outer template literal. All content after the broken block may be silently dropped.

**Incorrect:**

```swirls
code: @ts {
  const result = `Summary:\n${items.map(w => `  - ${w}`).join("\n")}`
}
```

**Correct (concatenation for the inner expression):**

```swirls
code: @ts {
  const result = "Summary:\n" + items.map(w => "  - " + w).join("\n")
}
```

**Incorrect (nested template in prompt):**

```swirls
prompt: @ts {
  return `Results:\n${data.map(r => `${r.name}: ${r.score}`).join("\n")}`
}
```

**Correct:**

```swirls
prompt: @ts {
  return "Results:\n" + data.map(r => r.name + ": " + r.score).join("\n")
}
```

Rule: never use backticks inside `${}` interpolation. Use string concatenation (`+`) instead.

---

### 10.6. Parser Silently Drops Graphs

The Swirls parser has several bugs where invalid or unsupported syntax causes it to silently stop parsing the rest of the file. `swirls doctor` reports success but with fewer graphs/forms/triggers than expected. No error is emitted.

**How to detect:** Always compare the doctor summary counts against what you defined. If doctor reports 2 graphs but you wrote 4, the parser silently dropped 2.

**Common causes of silent drops (in order of likelihood):**

1. **Double-quote characters inside @ts blocks** - The parser's string boundary detection gets confused. Everything after the block is dropped.

2. **Nested template literals** - Inner backticks inside `${}` interpolation are mistaken for block boundaries.

3. **Dollar sign before interpolation** - `$${amount}` breaks interpolation parsing.

4. **Unicode in comments** - Non-ASCII characters in `//` comments break line counting.

5. **Hyphenated header keys** - `Content-Type` in headers is parsed as subtraction, consuming everything to EOF.

**Debugging steps:**

1. Run `bunx swirls doctor` and note the counts
2. Count the forms, graphs, and triggers you defined
3. If counts don't match, binary-search by commenting out halves of the file
4. Check the section above the first missing graph for parser-breaking patterns
5. Fix the pattern and re-run doctor

The issue is always in or before the first missing item, never after it.

---

### 10.7. Unicode in Comments Breaks Line Counting

Using Unicode characters in `//` comments causes the parser to miscount lines. Graphs defined after the comment are silently dropped. `swirls doctor` reports success but with fewer graphs than expected. No error is emitted.

**Incorrect (Unicode box-drawing and arrow characters):**

```swirls
// ──────────────────────────────
// Graph: get_token → fetch OAuth
// ──────────────────────────────
graph get_token {
  label: "Get Token"
  root { type: code label: "Entry" code: @ts { return {} } }
}
```

The `get_token` graph is silently dropped.

**Correct (ASCII only):**

```swirls
// -------------------------------------------
// Graph: get_token - fetch OAuth
// -------------------------------------------
graph get_token {
  label: "Get Token"
  root { type: code label: "Entry" code: @ts { return {} } }
}
```

Characters to avoid in comments: `─`, `│`, `→`, `←`, `↑`, `↓`, `—`, `╌`, `═`, `║`, `╔`, `╗`, `╚`, `╝`, and any other non-ASCII characters.

---

### 10.8. Pre-Flight Validation Checklist

Before running `bunx swirls doctor`, verify every item on this checklist. Each item corresponds to a known parser bug or validation failure.

**Parser safety (silent drops):**

- [ ] Comments use ASCII only (no box-drawing, arrows, em dashes, or other Unicode)
- [ ] No `headers` field with hyphenated keys on `http` nodes
- [ ] No literal `"` characters inside `@ts` blocks (use `String.fromCharCode(34)`)
- [ ] No nested template literals inside `@ts` blocks (use concatenation)
- [ ] No `$${...}` patterns in template literals (use concatenation)

**Structure validation:**

- [ ] Every `graph` has exactly one `root { }` block
- [ ] Every `graph` has a `label` field
- [ ] `flow { }` edges only reference defined node names
- [ ] No cycles in edges
- [ ] No self-referencing edges

**Node validation:**

- [ ] Every `email` node has `from`, `to`, and `subject` fields
- [ ] Every `ai` node has `kind`, `model`, and `prompt` fields
- [ ] Every `ai` node with `kind: object` has a `schema`
- [ ] Every `code` node has a `code` field
- [ ] Every `switch` node has `cases` and `router` fields
- [ ] Every `http` node has a `url` field
- [ ] Every `graph` node has `graph` and `input` fields
- [ ] Every `bucket` node has an `operation` field

**Trigger validation:**

- [ ] All graphs referenced by `type: graph` nodes are in the same file
- [ ] Trigger bindings reference resources and graphs defined in the same file
- [ ] Secret keys use only `[a-zA-Z0-9_]` characters

**Schema validation:**

- [ ] `@json` blocks contain valid JSON (double-quoted keys, no trailing commas)
- [ ] Braces are balanced in all `@ts { }`, `@json { }`, and `@sql { }` blocks

**After running doctor:**

- [ ] Doctor summary counts match the number of forms/graphs/triggers you defined
- [ ] No unexpected warnings about unused schemas or types

---

*48 rules across 10 sections.*
