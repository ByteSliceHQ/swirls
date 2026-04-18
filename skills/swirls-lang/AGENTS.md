# Swirls Language - Complete Reference

> Comprehensive guide for authoring `.swirls` workflow files. Compiled from the individual rule files under `rules/`. If something is not documented here, it does not exist in the language.

# 1. Language Specification (READ FIRST)

### Strict Syntax Specification

The Swirls DSL is a declarative configuration language. It is not TypeScript, YAML, or a general-purpose programming language. Only the constructs listed below are valid. If something is not listed here, it does not exist in the language. Do not invent syntax by analogy with other languages.

#### Complete keyword list

These are the only keywords recognized by the lexer (`packages/language/src/lexer.ts`). Any other word is parsed as an identifier or a quoted string.

```
form, webhook, schedule, graph, trigger, secret, auth, postgres, stream,
node, root, type, label, description, enabled, schema, cron, timezone,
version, review, condition, name, flow, select, insert, params, table
```

Note: `persistence` is NOT a keyword. The old `persistence { }` block has been removed. Use a top-level `stream { }` block instead.

#### Complete top-level declaration list

These are the only valid top-level blocks. Nothing else can appear at the top level of a `.swirls` file.

```
version: <number>
form <name> { }
webhook <name> { }
schedule <name> { }
graph <name> { }
stream <name> { }
trigger <name> { }
secret <name> { }
auth <name> { }
postgres <name> { }
```

#### Resource name pattern

All resource names (forms, webhooks, schedules, graphs, streams, triggers, secrets, auth, postgres, nodes, secret vars, switch cases, review action ids) must match:

```
^[a-zA-Z0-9_]+$
```

Names may start with a digit. Hyphens, dots, spaces, and other characters are not allowed. `bad-name`, `1.0`, and `with space` are invalid. `my_name`, `name1`, and `_name` are valid.

#### Complete node type list

These are the only valid values for `type:` inside a node or root block. There are **13** node types. The canonical names come from `nodeTypeMap` in `packages/core/src/schemas.ts`.

```
ai, bucket, code, document, firecrawl, graph, http,
parallel, postgres, resend, stream, switch, wait
```

Notes on aliases that do NOT exist:
- `resend` is the type name, not `email`.
- `firecrawl` is the type name, not `scrape`.
- `http` is the type name, not `api`, `request`, or `fetch`.
- `wait` is the type name, not `delay` or `sleep`.
- `ai` is the type name, not `llm`, `chat`, or `prompt`.
- `graph` is the type name for subgraphs, not `subgraph`, `call`, or `child`.
- `postgres` is the type name, not `db`, `database`, or `sql`.
- `bucket` is the type name, not `storage`, `file`, or `s3`.
- `parallel` is the type name, not `map`, `loop`, `fanout`, or `workers`.

#### Complete config value types

These are the only value forms that can appear after a `:` in a field assignment.

- String literal: `"value"`
- Number: `42`, `3.14`
- Boolean: `true`, `false`
- Bare identifier: `my_name` (parsed as a string)
- Object literal: `{ key: value, key2: value2 }` (comma-separated)
- Array literal: `[item1, item2]` (comma-separated)
- TypeScript block: `@ts { ... }`
- TypeScript file ref: `@ts "path.ts.swirls"` (file must exist on disk)
- JSON block: `@json { ... }`
- SQL block: `@sql { ... }`

Nothing else is valid. No expressions, no arithmetic, no ternary, no function calls, no variables.

#### Complete fenced block languages

Only three: `@ts`, `@json`, `@sql`. No others exist. No `@yaml`, `@html`, `@css`, `@graphql`, `@py`, `@sh`.

#### Complete edge syntax

Inside a `flow { }` block only:

- Simple edge: `source -> target`
- Labeled edge: `source -["label"]-> target`

No other edge syntax exists. No conditional edges, no weighted edges, no `=>`, no `-->`, no `.`.

#### Trigger binding syntax

Inside a `trigger <name> { }` block, exactly one binding line:

```
form:<formName> -> <graphName>
webhook:<webhookName> -> <graphName>
schedule:<scheduleName> -> <graphName>
```

Only three resource types are valid in triggers: `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, `trigger:`, `http:`, or any other prefix.

#### Complete auth types

Inside an `auth <name> { }` block, `type:` must be one of:

```
oauth, api_key, basic, bearer, cloud
```

No other types exist. `jwt`, `mtls`, `session`, `cookie`, `saml`, `digest`, `ntlm` are not valid.

#### Constructs that DO NOT exist

The following constructs do not exist in the Swirls DSL. Do not use them.

**No control flow at DSL level:** `if`, `else`, `while`, `for`, `do`, `switch` (as a keyword), `case`, `default`, `break`, `continue`, `return`, `match`.

**No variables:** `const`, `let`, `var`, `declare`, `=` assignment, top-level constants.

**No functions:** `function`, `async`, `await`, `=>` arrow functions (outside @ts blocks).

**No imports/exports:** `import`, `export`, `from`, `require`, `module`, `package`.

**No types at DSL level:** `interface`, `type` (as a declaration), `extends`, `implements`, `class`, `enum`, `namespace`.

**No error handling at DSL level:** `try`, `catch`, `throw`, `finally`. (These work inside `@ts` blocks.)

**No operators at DSL level:** `+`, `-`, `*`, `/`, `%`, `&&`, `||`, `!`, `==`, `!=`, `<`, `>`, `?`, `:` (ternary), `...` (spread).

**No string interpolation at DSL level.** Template literals and `${}` only work inside `@ts` blocks. SQL uses `{{name}}` placeholders only.

**No inline TypeScript outside of `@ts` blocks.** You cannot write `code: return {}`. It must be `code: @ts { return {} }`.

**No `persistence { }` blocks.** They have been removed. The parser emits: `persistence { } blocks have been removed — use a top-level stream block instead`. Use `stream <name> { graph: g, schema, condition, prepare }` at the top level.

**No `outputSchema` on non-root nodes.** Use `schema` instead. The parser rejects `outputSchema` on non-root nodes with: `Use "schema" instead of "outputSchema" in node blocks`.

**No `inputSchema` on non-root nodes.** Only the root node accepts `inputSchema`. The parser emits: `inputSchema is only allowed in root { } blocks` and drops the entire node.

**No conditional routing at the edge level.** Conditional routing requires a `switch` node with `cases` and `router`, plus labeled edges in the flow block.

**No chaining of edges on one line.** `root -> a -> b` is invalid. Each edge is one line: `root -> a` then `a -> b`.

**No `email` node type.** The correct type name is `resend`.

**No `scrape` node type.** The correct type name is `firecrawl`.

**No `api`, `request`, or `fetch` node type.** The correct type name is `http`.

**No `delay` or `sleep` node type.** The correct type name is `wait`.

**No `llm`, `prompt`, or `chat` node type.** The correct type name is `ai`.

**No `subgraph`, `child`, or `call` node type.** The correct type name is `graph`.

**No `db`, `database`, or `sql` node type for external databases.** The correct type name is `postgres`.

**No `storage`, `file`, or `s3` node type.** The correct type name is `bucket`.

**No `template` or `render` node type.** Generate text in `code` or `ai` nodes.

**No `loop`, `retry`, or `map` node type.** The graph is a DAG. No cycles, no retries, no fork/join primitives. Parallel fan-out to multiple URLs / search queries uses the `parallel` node type (only for its specific operations: search, extract, findall).

**No `webhook` or `form` or `schedule` as node types.** These are top-level resource declarations only. Nodes receive data through triggers via `context.nodes.root.input`.

**No `trigger` node type.** Triggers are top-level declarations that bind resources to graphs.

#### Valid fields per node type

Only these fields have semantics for each node type. All types additionally accept `type`, `label`, `description`, `secrets`, `review`. Root nodes additionally accept `inputSchema` and `outputSchema`. Non-root nodes accept `schema` (not `outputSchema`).

**ai** — required: `kind`. Valid kinds: `text`, `object`, `image`, `video`, `embed`. Other fields: `model`, `prompt` (@ts), `temperature`, `maxTokens`, `options` (object; for image: `n`, `size`, `aspectRatio`), `schema` (required for `kind: object`; warning if set on `kind: text`).

**code** — required: `code` (@ts block or `@ts "file.ts.swirls"`). Other fields: `schema`.

**switch** — required: `cases` (non-empty array of alphanumeric+underscore strings), `router` (@ts returning one of the case strings).

**http** — required: `url` (@ts or string). Other fields: `method` (`GET`/`POST`/`PUT`/`DELETE`/`PATCH`), `headers` (@ts returning object), `body` (@ts), `auth` (bare identifier referencing an auth block; `auth` is only valid on http nodes).

**firecrawl** — required: `url`. Other fields: `onlyMainContent`, `formats` (array), `maxAge`, `parsers` (array). No user `schema:` — vendor-managed output shape.

**resend** — required: `from`, `to`, `subject` (all @ts or string). Other fields: `text`, `html`, `replyTo`. No user `schema:` — vendor-managed output.

**parallel** — required: `operation` (`search`, `extract`, or `findall`), `objective`.
- `operation: search` also requires `searchQueries` (@ts returning string[]). Optional: `mode`, `excerptsMaxCharsPerResult`, `excerptsMaxCharsTotal`.
- `operation: extract` also requires `urls` (@ts returning string[]). Optional: `excerpts`, `fullContent`.
- `operation: findall` also requires `entityType`, `generator` (`base`/`core`/`pro`/`preview`), `matchConditions` (@ts), `matchLimit` (number). Optional: `excludeList`, `pollInterval`, `pollIntervalUnit` (`seconds`/`minutes`), `pollTimeout`, `pollTimeoutUnit`.
No user `schema:` — vendor-managed output shape.

**stream** (node, read side) — required: `stream` (bare identifier naming a top-level `stream <name> { }` block), `filter` (@ts returning a `StreamFilter` object of shape `{ field: { op: value } }` where op is `eq`/`ne`/`gt`/`gte`/`lt`/`lte`/`like`/`in`). `streamId`, `query`, `querySql` are removed; using them produces validator errors.

**graph** — required: `graph` (bare identifier naming a graph in the same file), `input` (@ts returning the input object to pass to the subgraph).

**wait** — no required fields. Optional: `amount` (number), `unit` (`seconds`/`minutes`/`hours`/`days`), `secondsFromConfig`.

**bucket** — required: `operation` (`download` or `upload`). Optional: `path`.

**document** — no required fields. Optional: `documentId` (UUID string).

**postgres** (node) — required: `postgres` (bare identifier naming a top-level `postgres <name> { }` block) and exactly one of `select:` (@sql SELECT or WITH) or `insert:` (@sql INSERT, optionally with ON CONFLICT). Other fields: `params` (@ts returning an object whose keys match `{{key}}` placeholders in the SQL; required when SQL has placeholders, always required for `insert:`), `condition` (@ts returning boolean; only valid on `insert:` nodes), `schema` (recommended for `select:` to type the row output).

#### Shared optional fields on every node

- `label` — display string. Defaults to the node name (or `"root"` for root).
- `description` — longer descriptive string.
- `secrets` — object literal: `{ blockName: [VAR1, VAR2], otherBlock: [VAR3] }`. The block name must be a declared top-level `secret` block and each var must appear in that block's `vars` list. Accessed at runtime as `context.secrets.blockName.VAR1`.
- `review` — either `review: true` or `review: { enabled, title, description, content, schema, actions, approvedOutput, rejectedOutput }`. See `review-config`.
- `failurePolicy` (optional) — `{ strategy: "fail" | "retry" | "skip" | "fallback", maxRetries, backoffMs, fallbackValue }`.

---

### Common Mistakes

These are patterns that look plausible but are wrong. Each example shows the incorrect version followed by the correct version.

#### 1. Writing TypeScript outside of @ts blocks

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

#### 2. Using `type: email` instead of `type: resend`

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

#### 3. Using `type: scrape` instead of `type: firecrawl`

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

#### 4. Using `outputSchema` on a non-root node

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

#### 5. Using `inputSchema` on a non-root node

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

#### 6. Inventing conditional edges

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

#### 7. Using imports or require

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

#### 8. Using variables or assignments at DSL level

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

#### 9. Using `fetch` or `import` inside @ts blocks

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

#### 10. Using `process.env` instead of `context.secrets`

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

#### 11. Inventing node types

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

#### 12. Missing label on graph or node

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

#### 13. Edges outside of flow block

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

#### 14. Using @yaml, @graphql, or other invented block types

**Incorrect:**

```swirls
node query {
  type: code
  label: "Query"
  code: @graphql { query { users { name } } }
}
```

Only `@ts`, `@json`, and `@sql` fenced blocks exist. Embed other formats as strings inside `@ts` blocks.

#### 15. Chaining edges on one line

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

#### 16. Referencing a `.ts.swirls` file that does not exist

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

#### 17. Using `persistence { }` (removed)

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

#### 18. Using `query` or `querySql` on a stream node

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

#### 19. Declaring `agent:` trigger

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

#### 20. Trigger binding with separate fields

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

#### 21. Using an array for `secrets:`

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

#### 22. Referencing a graph or stream as a string on a node

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

#### 23. Hyphenated or non-alphanumeric resource name

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

---


# 2. File Structure

### Top-Level Declarations

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

#### The nine valid top-level blocks

- `form <name> { }` — UI forms and API endpoints. See `resource-form`.
- `webhook <name> { }` — HTTP endpoints for external payloads. See `resource-webhook`.
- `schedule <name> { }` — Cron-based triggers. See `resource-schedule`.
- `graph <name> { }` — Workflow DAGs. See `graph-anatomy`.
- `stream <name> { }` — Persist a graph's output as typed records. See `resource-stream`.
- `trigger <name> { }` — Binds resources to graphs. See `resource-trigger-binding`.
- `secret <name> { }` — Named groups of secret var identifiers. See `resource-secrets`.
- `auth <name> { }` — Authentication configuration for http nodes. See `resource-auth`.
- `postgres <name> { }` — External PostgreSQL connection and table schemas. See `resource-postgres`.

#### Version line

`version: <number>` is optional. If present, it appears once, typically at the top. The parser accepts it anywhere and stores the number on the AST.

#### Block comments are preserved

`/* ... */` block comments immediately before a top-level declaration attach to it as a doc comment and are preserved by the serializer.

---

### File Discovery and Extensions

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

### Comment Syntax and ASCII Restriction

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


# 3. Graph & Node Basics

### Graph Anatomy

A graph is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, exactly one root node, zero or more additional nodes, and an optional `flow { }` block.

**Incorrect (missing root):**

```swirls
graph my_graph {
  label: "My Graph"
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

Every graph must declare exactly one `root { }` block.

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
    schema: @json {
      { "type": "object", "properties": { "result": { "type": "string" } } }
    }
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

#### Valid top-level keys inside `graph { }`

| Key | Required | Notes |
|-----|----------|-------|
| `label:` | implicit required | Display string. Defaults to the graph name if omitted. |
| `description:` | no | Free-form. |
| `root { }` | yes | Exactly one; the entry node. Uses `root { }` syntax, not `node root { }`. |
| `node <name> { }` | no | Zero or more additional nodes. |
| `flow { }` | no (required if there are edges) | Contains edge declarations. |

#### Constructs that are NOT valid inside `graph { }`

- `persistence { }` — removed. The parser errors with a migration message. Use a top-level `stream { }` block instead. See `stream-persistence-block` and `resource-stream`.
- Edge lines at graph scope (`root -> foo` outside `flow { }`) — parser error: `Edge declarations must be inside a flow { } block`.
- `stream:` at graph scope (outside a node) — parser error: `"stream:" is only valid inside a node { } block`.
- Bare `type:`, `schema:`, `prompt:` at graph scope — these only belong inside `root { }` or `node { }` bodies.

#### Persistence

To persist a graph's output, add a **top-level** `stream <name> { }` block that names the graph. Do not put persistence inside the graph. See `resource-stream`.

```swirls
graph my_graph { ... }

stream my_graph_log {
  graph: my_graph
  schema: @json { ... }
  prepare: @ts { return { ... } }
}
```

---

### Root Node Requirements

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

### Flow Block and Edges

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
  model: "google/gemini-2.5-flash"
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

### DAG Constraints

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


# 4. Node Types

### Code Nodes

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
  schema: @json {
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

If you need network access, use an `http` node. If you need AI, use an `ai` node. If you need to send email, use a `resend` node. Break your graph into multiple nodes with the right types.

Code node fields:
| Field | Required | Type |
|-------|----------|------|
| `code` | yes | `@ts` block or `@ts "file.ts.swirls"` |
| `schema` | no | `@json` block. Non-root nodes use `schema`; using `outputSchema` here is a parse error. |
| `review` | no | Review config block (see `review-config`). |
| `secrets` | no | Object literal: `{ blockName: [VAR1, VAR2] }`. |

`inputSchema` is NOT valid on non-root code nodes. It is rejected by the parser with `inputSchema is only allowed in root { } blocks`, and the whole node is dropped.

---

### AI Nodes

AI nodes call language models and other AI services. The `kind` field determines the output type and which additional fields are valid.

**Default model:** Unless the user specifies a different model, always use `google/gemini-2.5-flash` for text and object kinds. Use specialized models only for image generation (e.g. `openai/dall-e-3`) and embeddings (e.g. `openai/text-embedding-3-small`).

**Required fields:** `kind`, `model`, `prompt`

**Incorrect (object kind without schema):**

```swirls
node classify {
  type: ai
  label: "Classify"
  kind: object
  model: "google/gemini-2.5-flash"
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
  model: "google/gemini-2.5-flash"
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
  model: "google/gemini-2.5-flash"
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

### Switch Nodes

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
  model: "google/gemini-2.5-flash"
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

### HTTP Nodes

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
  schema: @json {
    {
      "type": "object",
      "properties": {
        "results": { "type": "array" }
      }
    }
  }
}
```

**Correct (HTTP node with custom headers):**

When you need custom headers (including hyphenated keys like `Content-Type` or `x-api-key`), use a single `@ts` block that returns the entire headers object. Never nest `@ts` blocks inside other `@ts` blocks.

```swirls
secret api_creds {
  vars: [API_KEY]
}

node call_api {
  type: http
  label: "Call External API"
  method: "POST"
  url: "https://api.example.com/data"
  secrets: { api_creds: [API_KEY] }
  headers: @ts {
    return {
      "x-api-key": context.secrets.api_creds.API_KEY,
      "x-request-id": "abc123",
      "Content-Type": "application/json"
    }
  }
  body: @ts {
    return JSON.stringify({
      query: context.nodes.root.output.query
    })
  }
}
```

Declare the vars your node needs in a top-level `secret` block, then reference that block in the node's `secrets:` map. HTTP nodes also support an `auth:` field that references a top-level `auth` block for OAuth, API key, basic, or bearer authentication. See `resource-secrets` and `resource-auth` rules.

**Note:** Do not use HTTP nodes to call AI/LLM APIs directly. Use `ai` nodes instead — they handle model routing, authentication, and response parsing automatically.

**Warning:** Do not use `headers` as a plain object literal with hyphenated keys like `Content-Type`. The parser treats hyphens as subtraction operators and silently drops the rest of the file. Always use a `@ts` block for headers so keys are JavaScript strings. See the parser-hyphenated-headers and ts-no-nested-code-blocks rules.

HTTP node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `method` | no | "GET", "POST", "PUT", "DELETE", "PATCH" (default: "GET") |
| `headers` | no | `@ts` block returning an object (use string keys for hyphenated names) |
| `body` | no | `@ts` block |
| `schema` | no | `@json` block (use `outputSchema` only on root nodes) |

---

### Resend (Email) Nodes

Email nodes send email via Resend. The type name is `resend`, not `email`. Every resend node requires `from`, `to`, and `subject`.

**Required fields:** `from`, `to`, `subject`.

**Vendor-managed output:** Do not set `schema:` on a resend node. The validator errors: `"resend" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

#### Incorrect (wrong type name)

```swirls
node notify {
  type: email
  label: "Notify"
  from: @ts { return "noreply@example.com" }
  to: @ts { return "team@example.com" }
  subject: @ts { return "Alert" }
}
```

`email` is not a valid node type. The validator errors: `Invalid node type "email". Must be one of: ai, bucket, code, document, firecrawl, graph, http, parallel, postgres, resend, stream, switch, wait`.

#### Correct (complete resend node)

```swirls
node notify {
  type: resend
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

#### Correct (HTML body)

```swirls
node welcome {
  type: resend
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

#### Fields

| Field | Required | Type |
|-------|----------|------|
| `from` | yes | `@ts` block or string |
| `to` | yes | `@ts` block or string |
| `subject` | yes | `@ts` block or string |
| `text` | no | `@ts` block or string |
| `html` | no | `@ts` block or string |
| `replyTo` | no | `@ts` block or string |
| `schema` | **not allowed** | Vendor-managed; omit entirely. |

#### API key

`RESEND_API_KEY` is resolved by the runtime; do not declare it in a `secrets:` map.

---

### Firecrawl (Scrape) Nodes

Firecrawl nodes fetch and extract content from web pages. The type name is `firecrawl`, not `scrape`.

**Required fields:** `url`.

**Vendor-managed output:** Do not set `schema:` on a firecrawl node. The validator errors: `"firecrawl" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

#### Incorrect (wrong type name)

```swirls
node fetch {
  type: scrape
  url: @ts { return "https://example.com" }
}
```

`scrape` is not a valid node type. Use `firecrawl`.

#### Correct (basic scrape)

```swirls
node scrape_page {
  type: firecrawl
  label: "Scrape webpage"
  url: @ts { return context.nodes.root.input.url }
}
```

#### Correct (options)

```swirls
node scrape_article {
  type: firecrawl
  label: "Scrape article"
  url: @ts { return context.nodes.root.output.url }
  onlyMainContent: true
  formats: ["markdown", "html"]
  maxAge: 3600
  parsers: ["readability"]
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `url` | yes | `@ts` block or string | Target page URL. |
| `onlyMainContent` | no | Boolean | Strip navigation / ads / footers. |
| `formats` | no | Array of strings | E.g. `["markdown", "html"]`. |
| `maxAge` | no | Number | Cache lifetime in seconds. |
| `parsers` | no | Array of strings | Parser names to apply. |
| `schema` | **not allowed** | Vendor-managed; omit entirely. |

#### API key

`FIRECRAWL_API_KEY` is resolved by the runtime; do not declare it in a `secrets:` map.

#### When to use another node type

- **Structured extraction from a list of pages:** use `parallel` with `operation: extract`.
- **Long-running entity discovery:** use `parallel` with `operation: findall`.
- **Arbitrary HTTP request with full control over method / headers / body:** use `http`.

---

### Parallel Nodes

Parallel nodes call the Parallel API for parallelized web research tasks. The `operation` field selects one of three modes with different required fields. The response shape is **vendor-managed** — do not set `schema:` on a parallel node; the validator errors if you do.

**Required fields:** `operation`, `objective` (plus operation-specific fields).

**Valid operations:** `search`, `extract`, `findall`. Any other value triggers a validator error: `Parallel "operation" must be "search", "extract", or "findall"`.

#### search — multi-query web search

Runs a set of search queries in parallel and returns excerpts.

**Required:** `operation: search`, `objective`, `searchQueries` (@ts returning `string[]`).

**Optional:** `mode` (`one-shot` | `agentic` | `fast`), `excerptsMaxCharsPerResult`, `excerptsMaxCharsTotal`.

```swirls
node research {
  type: parallel
  label: "Research topic"
  operation: search
  objective: @ts {
    return "Find articles about " + context.nodes.root.output.topic
  }
  searchQueries: @ts {
    const topic = context.nodes.root.output.topic
    return [topic + " overview", topic + " 2026 trends", topic + " case studies"]
  }
  excerptsMaxCharsPerResult: 500
  excerptsMaxCharsTotal: 2000
}
```

#### extract — structured extraction from URLs

Fetches a list of URLs in parallel and extracts structured content.

**Required:** `operation: extract`, `objective`, `urls` (@ts returning `string[]`).

**Optional:** `excerpts` (boolean), `fullContent` (boolean).

```swirls
node extract_pricing {
  type: parallel
  label: "Extract pricing"
  operation: extract
  objective: @ts { return "Extract product names and prices from each page" }
  urls: @ts {
    return [
      "https://example.com/products/a",
      "https://example.com/products/b"
    ]
  }
  excerpts: true
  fullContent: false
}
```

#### findall — long-running entity discovery

Polls the Parallel API for entities matching given conditions.

**Required:** `operation: findall`, `objective`, `entityType`, `generator` (`base` | `core` | `pro` | `preview`), `matchConditions` (@ts), `matchLimit` (number).

**Optional:** `excludeList` (@ts), `pollInterval` (number), `pollIntervalUnit` (`seconds` | `minutes`), `pollTimeout` (number), `pollTimeoutUnit` (`seconds` | `minutes`).

```swirls
node discover_posts {
  type: parallel
  label: "Find related Reddit threads"
  operation: findall
  objective: @ts { return "Find Reddit posts about Kubernetes operator patterns" }
  entityType: "reddit_post"
  generator: "core"
  matchConditions: @ts {
    return [
      { name: "on_topic", description: "Post must discuss Kubernetes operators" },
      { name: "recent", description: "Posted within the last 90 days" }
    ]
  }
  matchLimit: 25
  excludeList: @ts { return [] }
  pollInterval: 30
  pollIntervalUnit: "seconds"
  pollTimeout: 10
  pollTimeoutUnit: "minutes"
}
```

#### Fields matrix

| Field | search | extract | findall |
|-------|--------|---------|---------|
| `operation` | required | required | required |
| `objective` | required | required | required |
| `searchQueries` | required | — | — |
| `urls` | — | required | — |
| `mode` | optional | — | — |
| `excerptsMaxCharsPerResult` | optional | — | — |
| `excerptsMaxCharsTotal` | optional | — | — |
| `excerpts` | — | optional | — |
| `fullContent` | — | optional | — |
| `entityType` | — | — | required |
| `generator` | — | — | required |
| `matchConditions` | — | — | required |
| `matchLimit` | — | — | required |
| `excludeList` | — | — | optional |
| `pollInterval` / `pollIntervalUnit` | — | — | optional |
| `pollTimeout` / `pollTimeoutUnit` | — | — | optional |
| `schema` | **not allowed** | **not allowed** | **not allowed** |

#### Key rules

- Parallel nodes are the **only** supported fan-out primitive for web research. There is no generic `map`, `fanout`, or `workers` node.
- `schema` is vendor-managed — setting it emits: `"parallel" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`
- `generator` for `findall` selects the compute tier; `core` is the usual default, `pro`/`preview` for larger / newer models.
- `matchLimit` must be in the API's supported range (5–1000).
- `PARALLEL_API_KEY` is resolved by the runtime; do not declare it in `secrets:`.

---

### Stream Nodes

A `type: stream` node **reads** from a top-level `stream { }` block. It is the read side of Swirls' graph-to-graph communication. The node's output is an array of previously persisted records matching the filter.

**Required fields:** `stream` (bare identifier naming a top-level stream block in the same project) and `filter` (@ts returning a `StreamFilter` object).

**Not valid (removed from schema):** `streamId`, `query`, `querySql`. Using any of them produces a validator error.

#### Syntax

```swirls
<node_name> {
  type: stream
  stream: <stream_block_name>
  filter: @ts {
    return {
      <field>: { <op>: <value> },
      ...
    }
  }
}
```

#### Example

```swirls
node recent_high_scorers {
  type: stream
  label: "Recent high-scoring leads"
  stream: scored_leads
  filter: @ts {
    return {
      score: { gte: 80 },
      name: { eq: context.nodes.root.input.name }
    }
  }
}
```

#### StreamFilter shape

`filter` must return a plain object whose keys are field names and whose values are operator objects.

```typescript
type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in'

type StreamFilter = Record<string, Partial<Record<FilterOperator, unknown>>>
```

Multiple top-level keys AND together. Multiple operators on the same key also AND together:

```typescript
// score >= 50 AND score <= 100 AND name equals input
{
  score: { gte: 50, lte: 100 },
  name: { eq: context.nodes.root.input.name }
}
```

#### Table vs output fields

Filters address two field kinds uniformly:

- **Table-level columns:** `created_at`, `graph_execution_id` — mapped to direct SQL column comparisons.
- **Output JSON fields:** anything else — mapped to jsonb field extraction (Postgres) or `json_extract` (SQLite).

You do not need to distinguish; the runtime infers it.

#### Node output

The node's output is `SchemaShape[]` — an array of records matching the referenced stream block's `schema`. Zero matches is not an error. Downstream nodes see it as `context.nodes.<stream_node>.output`.

When the stream block has a `schema:`, the LSP types `context.nodes.<stream_node>.output` as the matching TypeScript array. If the stream block has no schema or the reference is missing, the LSP types it as `unknown[]`.

#### Pagination and sorting

Not implemented yet. All queries return all matching rows ordered by `created_at DESC` (newest first). Pagination / sort will be added as optional fields later.

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `stream` | yes | bare identifier | Must match a top-level `stream <name> { }` block. |
| `filter` | yes | `@ts { }` or `@ts "file.ts.swirls"` | Must be non-empty; must return a `StreamFilter` object. |

#### Common mistakes

**Incorrect (old `query` field):**

```swirls
node recent {
  type: stream
  stream: "submissions"
  query: @sql { SELECT * FROM {{table}} }
}
```

Error: `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)`.

**Incorrect (referencing an undefined stream block):**

```swirls
node recent {
  type: stream
  stream: undefined_stream
  filter: @ts { return {} }
}
```

Error: `Stream node references stream block "undefined_stream" which is not defined`.

**Incorrect (empty filter):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  filter: @ts { }
}
```

Error: `Stream node filter must be a non-empty @ts block`. If you want all rows, return `{}` from the filter: `filter: @ts { return {} }`.

See `resource-stream` for the write side (top-level `stream { }` block declaration).

---

### Graph Nodes (Subgraphs)

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

### Wait Nodes

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

### Bucket Nodes

Bucket nodes perform object-storage operations on Swirls-managed buckets.

**Required fields:** `operation`.

**Valid operations:** `upload`, `download`. (No `delete` in the current runtime; the validator errors on any other value.)

#### Correct

```swirls
node store_file {
  type: bucket
  label: "Store file"
  operation: upload
  path: @ts { return "files/data.json" }
}

node load_file {
  type: bucket
  label: "Load file"
  operation: download
  path: @ts { return "files/data.json" }
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `operation` | yes | `upload` or `download` | Bare identifier; no other values. |
| `path` | no | `@ts` block or string | Target path within the bucket. |

---

### Document Nodes

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

### Postgres Nodes

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

#### Field reference

| Field | `select:` node | `insert:` node |
|-------|----------------|----------------|
| `label` | optional | optional |
| `postgres` | required | required |
| `select` | required | not allowed |
| `insert` | not allowed | required |
| `params` | optional (required if SQL has `{{...}}`) | required |
| `schema` | recommended | not used |
| `condition` | not allowed | optional |

#### Key rules

- `postgres:` must reference a top-level `postgres` block defined in the same file.
- `select:` SQL must be a SELECT statement. `insert:` SQL must be INSERT (upsert with ON CONFLICT is allowed).
- `{{key}}` placeholders are replaced with positional `$N` parameters at runtime. Values come from the `params:` return object. No SQL injection is possible.
- Placeholder names do not need to match column names. They match by position in the INSERT column list, or by the SQL expression context on SELECT.
- Table names in SQL must appear in the referenced `postgres` block's `table` declarations.
- Insert nodes produce no row output by default. Select nodes return an array of row objects.

---

### Node `secrets:` Map Syntax

Every node can declare which secret vars it is allowed to read using a `secrets:` field. The value is **always an object literal** mapping a declared secret block name to an array of var names from that block. It is never a bare identifier, never a string, never a flat array.

#### Shape

```swirls
secrets: {
  <block_name>: [<VAR1>, <VAR2>],
  <other_block>: [<VAR3>]
}
```

#### Parser behavior

If `secrets:` is not followed by `{`, the parser errors: `Expected { after secrets:`.

#### Incorrect (flat array)

```swirls
node call {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: [API_KEY]
}
```

#### Incorrect (bare identifier)

```swirls
node call {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: my_creds
}
```

#### Incorrect (string)

```swirls
node call {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: "my_creds"
}
```

#### Correct

```swirls
secret my_creds {
  vars: [API_KEY, API_SECRET]
}

node call {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: @ts {
    return {
      "x-api-key": context.secrets.my_creds.API_KEY
    }
  }
  secrets: {
    my_creds: [API_KEY]
  }
}
```

#### Validation rules

- Block names must match `^[a-zA-Z0-9_]+$`. Invalid names error: `Invalid secret block key "<name>" in secrets map`.
- Each block name must match a top-level `secret` block. Missing blocks error: `Node references undefined secret block "<block>" in secrets map`.
- Each var must be declared in that block's `vars` list. Missing vars error: `Secret block "<block>" has no var "<VAR>" (declared vars: …)`.
- Multiple entries are allowed — a node can pull from several secret blocks at once.

#### Runtime access

In `@ts` code, read values as `context.secrets.<block_name>.<VAR>`:

```ts
const key = context.secrets.my_creds.API_KEY
```

The node cannot access vars it did not declare in its `secrets:` map, even if they exist in the secret block.

#### Auth / postgres blocks are different

Top-level `auth { secrets: <block_name> }` and `postgres { secrets: <block_name> }` use a **bare identifier** to reference a single secret block — those are not maps. Only the per-node `secrets:` field takes a map.

---

### Node Failure Policy

Any node can declare a `failurePolicy:` to control what the durable DAG engine does when that node's execution throws. Without a policy, the default is `fail` (the whole graph execution errors).

#### Shape

```swirls
failurePolicy: {
  strategy: "fail" | "retry" | "skip" | "fallback"
  maxRetries: <number>        // used by "retry"
  backoffMs: <number>         // used by "retry"
  fallbackValue: <any>        // used by "fallback"
}
```

#### Strategies

| Strategy | Meaning |
|----------|---------|
| `fail` | Node failure errors the whole graph execution (default). |
| `retry` | Re-run the node up to `maxRetries` times, with `backoffMs` between attempts. If still failing, the graph errors. |
| `skip` | Mark the node as skipped and continue; downstream nodes run without this node's output. |
| `fallback` | Replace the node's output with `fallbackValue` and continue. |

#### Example

```swirls
node external_api {
  type: http
  url: @ts { return "https://flaky.example.com/data" }
  failurePolicy: {
    strategy: "retry"
    maxRetries: 3
    backoffMs: 1000
  }
}

node enrich {
  type: http
  url: @ts { return "https://enrichment.example.com" }
  failurePolicy: {
    strategy: "fallback"
    fallbackValue: { enriched: false }
  }
}

node optional_step {
  type: http
  url: @ts { return "https://optional.example.com" }
  failurePolicy: {
    strategy: "skip"
  }
}
```

#### Notes

- The policy lives alongside other config fields on a node; it is not a separate block.
- Downstream nodes still see `context.nodes.<name>.output` for skipped/fallback cases; `skip` sets it to `undefined` (or absent), `fallback` sets it to `fallbackValue`.
- `failurePolicy` is optional and can be omitted on any node.

---


# 5. TypeScript Blocks

### TypeScript Block Syntax

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

The referenced `.ts.swirls` file must exist on disk. `swirls doctor` validates that the file is present and will report an error if it is missing. The file contains a function body (not a module) and exists in the same namespace with the same `context` object as inline blocks:

```typescript
// handlers/process.ts.swirls
const email = context.nodes.root.input.email ?? ""
return { email: email.toLowerCase() }
```

The `@ts` prefix is used for: `code`, `prompt`, `router`, `from`, `to`, `subject`, `text`, `html`, `replyTo`, `url`, `body`, `headers`, `input`, `path`, and persistence `condition` fields.

**No nesting:** `@ts` blocks cannot contain other `@ts` blocks. Each `@ts` block is a leaf that contains executable code. If a field needs to produce a compound value (e.g., a headers object with multiple keys), use a single `@ts` block that returns the entire object. See the ts-no-nested-code-blocks rule.

Brace balancing: the lexer counts `{` and `}` depth to find the closing brace. Inner braces (objects, if-blocks, functions) are fine as long as they are balanced.

---

### Code Node Sandbox Limits

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
| Access secrets | `context.secrets.<block>.<VAR>` in @ts block |

Code nodes are strictly for reshaping inputs, normalizing strings, computing derived values, and structuring outputs. Break your workflow into multiple nodes with the right types.

---

### Safe TypeScript Patterns

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

### No Double-Quote Characters in @ts Blocks

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

### No Nested Template Literals in @ts Blocks

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

### No Dollar Sign Before Interpolation

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

### No Nested Code Blocks

`@ts` and `@json` blocks cannot be nested inside other `@ts` or `@json` blocks. Each code block must appear at the field level — never inside another code block. When a field needs to produce a compound value (like an object with multiple keys), use a single `@ts` block that returns the entire object.

**Incorrect (nested @ts blocks inside a @ts block):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
  headers: @ts {
    x-api-key: @ts {
      return context.secrets.API_KEY
    }
    x-request-id: "abc123"
  }
}
```

**Incorrect (nested @ts blocks on individual values):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
  body: @ts {
    query: @ts {
      return context.nodes.root.output.query
    }
    limit: 10
  }
}
```

**Correct (single @ts block returning the full object):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
  secrets: [API_KEY]
  headers: @ts {
    return {
      "x-api-key": context.secrets.API_KEY,
      "x-request-id": "abc123",
      "Content-Type": "application/json"
    }
  }
  body: @ts {
    return JSON.stringify({
      query: context.nodes.root.output.query,
      limit: 10
    })
  }
}
```

Rule: a code block (`@ts`, `@json`, `@sql`) is always a leaf — it contains executable code, never other code blocks. If you need to build a structured value, write one `@ts` block that constructs and returns the whole object.

---


# 6. Schema & Typing

### JSON Schema Format

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

### inputSchema, outputSchema, and schema

The three schema keywords each have a specific placement. The parser enforces this strictly and **rejects misplaced schema keys**.

| Keyword | Valid on | Purpose |
|---------|----------|---------|
| `inputSchema` | **root only** | Shape of the trigger payload. Drives `context.nodes.root.input` typing in the LSP. |
| `outputSchema` | **root only** | Shape of what the root node returns. |
| `schema` | **non-root nodes only** | Shape of what that node returns. Equivalent to outputSchema for non-root nodes. |

#### Strict parser rules

- `inputSchema` on a non-root node → parser error: `inputSchema is only allowed in root { } blocks`. The entire node is dropped from the AST.
- `outputSchema` on a non-root node → parser error: `Use "schema" instead of "outputSchema" in node blocks`. The entire node is dropped from the AST.
- `schema` on root is technically accepted but redundant — use `outputSchema` on root.

#### Incorrect (inputSchema on non-root)

```swirls
node enrich {
  type: code
  label: "Enrich"
  inputSchema: @json { { "type": "object" } }
  code: @ts { return {} }
}
```

The parser drops this node silently (after logging an error). Downstream references to `context.nodes.enrich.output` will fail at validation or runtime.

#### Incorrect (outputSchema on non-root)

```swirls
node process {
  type: code
  label: "Process"
  outputSchema: @json { { "type": "object" } }
  code: @ts { return {} }
}
```

Same outcome — the node is dropped.

#### Correct (each kind in the right place)

```swirls
root {
  type: code
  label: "Entry"
  inputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":  { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
  outputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":  { "type": "string" },
        "email": { "type": "string" }
      }
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
  schema: @json {
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

#### Best practice

Define `outputSchema` on the root node and `schema` on every non-root node that produces data. This enables LSP autocomplete for all downstream `@ts` blocks. Without schemas, `context.nodes.<name>.output` is typed as `unknown` and the LSP cannot help.

#### Vendor-managed types

Some node types have their output shape fixed by the vendor API. Do not set `schema:` on them — the validator errors: `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

Vendor-managed types:
- `firecrawl`
- `parallel`
- `resend`

These types provide their own runtime type shape; the LSP uses it automatically.

---

### Inline Schema Syntax

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


# 7. Context Object

### context.nodes - Accessing Node Data

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

### context.secrets - Accessing Secrets

Secrets are accessed via `context.secrets.<secret_block_name>.<VAR_NAME>` in `@ts` blocks. Declare which vars from which top-level `secret` blocks the node may read using `secrets: { blockName: [VAR1, VAR2] }`. Some node types resolve vendor API keys internally (not via `context.secrets`).

**Incorrect (flat access without block):**

```swirls
code: @ts {
  const key = context.secrets.MY_TOKEN
}
```

Use the block-qualified path that matches your `secrets:` map.

**Incorrect (using process.env):**

```swirls
code: @ts {
  const key = process.env.API_KEY
}
```

Code nodes have no access to `process.env`.

**Correct (secret block + map + nested access):**

```swirls
secret creds {
  vars: [MY_SERVICE_TOKEN, ANOTHER_KEY]
}

graph g {
  root {
    type: code
    label: "Entry"
    secrets: {
      creds: [MY_SERVICE_TOKEN, ANOTHER_KEY]
    }
    code: @ts {
      const token = context.secrets.creds.MY_SERVICE_TOKEN
      return { hasToken: Boolean(token) }
    }
  }
}
```

Var names in the `secret` block and in each node's `secrets:` map must match `[a-zA-Z0-9_]+`. The validator ensures block names exist and each listed var is declared in that block's `vars`.

**Inferred vendor keys (ai / resend / firecrawl):**

These are resolved by the runtime for those node types (e.g. `OPENROUTER_API_KEY` for `ai`). They are not exposed on `context.secrets` for user `@ts` code; declare your own keys in a `secret` block if you need them in code.

Set secret values via `bunx swirls env set VAR_NAME` or the dashboard (vault keys remain flat by var name).

---

### context.reviews - Accessing Review Responses

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

### context.meta - Execution Metadata

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
- `context.meta.triggerType` - `"form"`, `"webhook"`, `"schedule"`, or null. (There is no `"agent"` trigger type.)

---


# 8. Resources & Triggers

### Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields.

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
        "name":    { "type": "string", "title": "Name" },
        "email":   { "type": "string", "title": "Email" },
        "message": { "type": "string", "title": "Message" }
      },
      "additionalProperties": false
    }
  }
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | yes | String | Display name in the Portal. |
| `description` | no | String | Longer description. |
| `enabled` | no | Boolean | Default: enabled. Set to `false` to keep the declaration but pause submissions. |
| `schema` | no | `@json` block | JSON Schema for the form payload. The LSP types `context.nodes.root.input` from this schema when a trigger references the form. |

#### Name pattern

Form names must match `^[a-zA-Z0-9_]+$`. Hyphens, dots, and spaces are not allowed. Names can start with a digit.

```swirls
form contact-form { ... }  // ERROR: hyphen
form contact_form { ... }  // OK
form 2024_signup  { ... }  // OK
```

The validator errors: `Form name: Name must contain only letters, numbers, and underscores`.

#### Schema tips

- Use `"title"` on each property to set the Portal form field label.
- Use `"additionalProperties": false` on forms unless you want to accept arbitrary extra fields.
- The same JSON Schema also validates incoming API submissions.
- If you omit `schema:`, the form still works but inputs are untyped and the LSP cannot help.

#### Binding a form to a graph

Forms don't execute on their own. Declare a `trigger` to send submissions to a graph:

```swirls
trigger on_contact {
  form:contact_form -> process_contact
  enabled: true
}
```

See `resource-trigger-binding`.

---

### Webhook Declarations

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

Webhook names must match `^[a-zA-Z0-9_]+$` (letters, digits, underscores; can start with a digit). Hyphens, dots, and spaces are not allowed.

#### Binding

A webhook on its own does not execute a graph. Declare a trigger:

```swirls
trigger on_inbound {
  webhook:inbound -> handle_event
  enabled: true
}
```

---

### Schedule Declarations

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

Common cron expressions (standard 5-field form):
- `"0 9 * * *"` - Daily at 9 AM
- `"0 */6 * * *"` - Every 6 hours
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"*/15 * * * *"` - Every 15 minutes

Schedule names must match `^[a-zA-Z0-9_]+$` (letters, digits, underscores). Bind a schedule to a graph via a trigger:

```swirls
trigger daily_trigger {
  schedule:daily -> morning_report
  enabled: true
}
```

---

### Stream Block Declaration

Top-level `stream <name> { }` blocks persist one graph's output into a named, schema-typed record. They replace the removed `persistence { }` block. A `type: stream` node in another graph can read from the same stream by name to achieve graph-to-graph communication.

**There is no `type:` field on a stream block** — the keyword `stream` identifies the block.

#### Syntax

```swirls
stream <name> {
  label: "<optional label>"          // defaults to <name>
  description: "<optional string>"
  enabled: <boolean>                  // optional; default treated as true
  graph: <graph_name>                 // required; graph declared in this file
  schema: @json {                     // recommended; warning if omitted
    { ... JSON Schema for one persisted record ... }
  }
  condition: @ts {                    // optional; return true to persist
    return <boolean expression>
  }
  prepare: @ts {                      // required; return the object to persist
    return { ... }
  }
}
```

`condition` and `prepare` may also be `@ts "path.ts.swirls"` file references.

#### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `graph` | yes | Bare identifier naming a graph in the same file. |
| `prepare` | yes | Non-empty `@ts { }` or `@ts "…"` reference. Must return the record object. |
| `schema` | recommended | Warning if omitted. JSON Schema for one persisted record. |
| `condition` | no | `@ts` returning boolean; if false, skip persist. If present and empty, the validator errors. |
| `label` | no | Defaults to the stream's name. |
| `description` | no | Free-form description. |
| `enabled` | no | When false, runtime skips persistence but the stream stays in the AST and deployment. |

#### Context shape inside `condition` and `prepare`

These `@ts` blocks get a specialized `context`:

- `context.output.<leafNodeName>` — output of each DSL leaf node (node with no outgoing edges). Only leaves that actually executed appear. For a single-node graph, `context.output.root` holds the root output.
- `context.nodes.<name>.input` / `.output` — per-node access for every executed node.
- `context.nodes.root.input` — the graph's trigger input.
- `context.reviews`, `context.secrets`, `context.meta` — as in normal nodes (may be empty on CLI).

Because `context.output` is keyed by leaf, and because `switch` routing means only one branch's leaves run, every leaf key is typed as independently optional by the LSP. Narrowing one case does not narrow sibling cases. Use `'leafName' in context.output`, optional chaining (`?.`), non-null assertion (`!`), or explicit runtime checks on the fallback branch.

#### Complete example — write side

```swirls
graph process_leads {
  label: "Process incoming leads"

  root {
    type: code
    label: "Score lead"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["email", "name"],
        "properties": {
          "email": { "type": "string" },
          "name": { "type": "string" }
        }
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["email", "name", "score"],
        "properties": {
          "email": { "type": "string" },
          "name": { "type": "string" },
          "score": { "type": "number" }
        }
      }
    }
    code: @ts {
      return {
        email: context.nodes.root.input.email,
        name: context.nodes.root.input.name,
        score: Math.random() * 100
      }
    }
  }
}

stream scored_leads {
  label: "Scored leads"
  description: "Persists lead scoring output from process_leads"
  graph: process_leads

  schema: @json {
    {
      "type": "object",
      "required": ["email", "name", "score"],
      "properties": {
        "email": { "type": "string" },
        "name":  { "type": "string" },
        "score": { "type": "number" }
      }
    }
  }

  condition: @ts {
    return (context.output.root?.score ?? 0) > 50
  }

  prepare: @ts {
    const lead = context.output.root!
    return {
      email: lead.email,
      name: lead.name,
      score: lead.score
    }
  }
}
```

#### Reading a stream — the read side

A `type: stream` node in another graph reads the persisted data:

```swirls
graph enrich_leads {
  label: "Enrich high-scoring leads"

  root {
    type: stream
    label: "Read scored leads"
    stream: scored_leads
    filter: @ts {
      return {
        score: { gte: 80 }
      }
    }
  }
}
```

See `node-stream` for the full filter operator list.

#### Validation rules

- Stream names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `graph` must reference a declared graph in the same file.
- `prepare` is required; must be a non-empty `@ts` block or file reference.
- If `condition` is provided, it must be non-empty.
- `schema` is recommended (warning if omitted).

#### Top-level vs node keyword — disambiguation

The lexer treats `stream` as a keyword. At the top level:

- `stream <name> { … }` — declare a stream block.
- `stream:` at top-level is invalid and errors with: `"stream:" is only valid inside a node { } block (did you forget to close a brace?)`.

Inside a graph body, `stream:` at graph scope (outside a node) errors the same way. Inside a `node { }` body, `stream:` is a normal config field (used by `type: stream` nodes as the stream reference).

---

### Trigger Bindings

Triggers connect a resource (form, webhook, or schedule) to a graph. When the resource fires, the graph executes with the resource's payload available as `context.nodes.root.input`.

**Only three resource types are valid in triggers:** `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, or `trigger:` type.

#### Syntax

```swirls
trigger <name> {
  form:<form_name> -> <graph_name>
  enabled: <boolean>
}

trigger <name> {
  webhook:<webhook_name> -> <graph_name>
  enabled: <boolean>
}

trigger <name> {
  schedule:<schedule_name> -> <graph_name>
  enabled: <boolean>
}
```

The binding is a single syntactic line `<type>:<name> -> <graph>`. There are no separate `resource:` / `graph:` fields. `enabled:` is the only other field; everything else is ignored.

#### Incorrect (wrong syntax)

```swirls
trigger my_trigger {
  form: contact_form
  graph: process_form
}
```

Missing the `-> graphName` arrow. The trigger silently parses with empty `resourceName` and `graphName`, and the validator then complains about undefined references.

#### Incorrect (agent type)

```swirls
trigger agent_trigger {
  agent:my_agent -> my_graph
}
```

`agent` is not a valid resource type. Only `form`, `webhook`, `schedule`.

#### Correct examples

```swirls
trigger on_contact {
  form:contact_form -> process_form
  enabled: true
}

trigger webhook_trigger {
  webhook:inbound -> handle_event
  enabled: true
}

trigger daily_schedule {
  schedule:daily -> handle_event
  enabled: true
}
```

Multiple triggers can target the same graph from different sources.

#### Validation rules

- Trigger names must match `^[a-zA-Z0-9_]+$` and be unique in the file.
- The referenced `form` / `webhook` / `schedule` must be declared in the same file, else: `Trigger references <type> "<name>" which is not defined`.
- The referenced graph must be declared in the same file, else: `Trigger references graph "<name>" which is not defined`.

#### `enabled`

`enabled: false` parses fine but the runtime skips the trigger. Omit the field to default to enabled.

---

### Secret Block Declaration

Top-level `secret <name> { }` blocks declare groups of secret variable names for use by `auth` blocks, `postgres` connection references, and node-level `secrets:` maps.

```swirls
secret github_secrets {
  label: "GitHub credentials"
  description: "Optional human-readable notes for tooling"
  vars: [GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET]
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | no | String | Optional display name. |
| `description` | no | String | Optional longer description. |
| `vars` | yes | Array of identifiers | The var names available in this block. |

#### Name patterns

- **Block name:** `^[a-zA-Z0-9_]+$`.
- **Var names:** `^[a-zA-Z0-9_]+$`.

Hyphens, dots, and other special characters are invalid and the validator errors.

```swirls
secret bad-name { vars: [KEY] }   // ERROR: invalid block name
secret good_block { vars: [MY-KEY] }  // ERROR: invalid var name
```

#### Duplicate vars

Repeating the same var in one block is a validator error: `Duplicate var "<VAR>" in secret block "<name>"`.

```swirls
secret creds {
  vars: [API_KEY, API_KEY]  // ERROR
}
```

#### Consuming secrets on a node

The `secrets:` field on a node is an **object literal** mapping secret block names to arrays of var names:

```swirls
secret creds {
  vars: [MY_TOKEN, ANOTHER_KEY]
}

graph g {
  root {
    type: code
    label: "Entry"
    secrets: {
      creds: [MY_TOKEN, ANOTHER_KEY]
    }
    code: @ts {
      const token = context.secrets.creds.MY_TOKEN
      return { hasToken: Boolean(token) }
    }
  }
}
```

The validator checks that every block name is declared and every listed var appears in that block's `vars`.

#### Setting values

Values are set out-of-band (not in `.swirls` files):

- CLI: `bunx swirls env set MY_TOKEN`
- Portal: the secrets vault UI.

Vault keys are flat by var name; the block is a logical grouping for reference and validation, not a namespace at the storage layer.

#### Inferred vendor keys

Some node types auto-resolve their API keys without appearing in `secrets:`:

- `ai` → `OPENROUTER_API_KEY`
- `resend` → `RESEND_API_KEY`
- `firecrawl` → `FIRECRAWL_API_KEY`
- `parallel` → `PARALLEL_API_KEY`

Do not list these in a `secret` block unless you also want them accessible from `@ts` code.

---

### Auth Block Declaration

Declares named authentication configuration. Most types are linked to a top-level `secret` block via `secrets: <block_name>`, with identifier fields (`client_id`, `token`, etc.) that name vars declared in that block's `vars` list. `auth:` can only be referenced from `http` nodes.

#### Supported `type` values

```
oauth, api_key, basic, bearer, cloud
```

Any other value triggers: `Auth block "<name>" requires type: oauth, api_key, basic, bearer, or cloud`.

#### oauth

**Required fields:** `type`, `grant_type`, `client_id`, `client_secret`, `token_url`, and `secrets` referencing a block that declares the `client_id` / `client_secret` vars.

```swirls
auth github {
  label: "GitHub API"
  type: oauth
  secrets: github_secrets
  grant_type: client_credentials
  client_id: GITHUB_CLIENT_ID
  client_secret: GITHUB_CLIENT_SECRET
  token_url: "https://github.com/login/oauth/access_token"
}
```

#### api_key

**Required fields:** `type`, `key`, and exactly one of `header:` or `query_param:`.

```swirls
auth stripe {
  type: api_key
  secrets: stripe_secrets
  key: STRIPE_API_KEY
  header: "Authorization"
}
```

#### basic

**Required fields:** `type`, `username`, `password`.

```swirls
auth internal_api {
  type: basic
  secrets: internal_secrets
  username: INTERNAL_USER
  password: INTERNAL_PASS
}
```

#### bearer

**Required fields:** `type`, `token`.

```swirls
auth my_bearer {
  type: bearer
  secrets: bearer_secrets
  token: API_BEARER_TOKEN
}
```

#### cloud

**Required fields:** `type`, `provider`, `connection_id`. **Does not use** `secrets:` — the validator warns if it sees one.

```swirls
auth aws_connection {
  type: cloud
  provider: "aws"
  connection_id: "prod-account-us-east-1"
}
```

#### Referencing an auth block

`auth:` is only valid on `http` nodes. The validator errors otherwise: `"auth" is only valid on http nodes`.

```swirls
node call_api {
  type: http
  url: @ts { return "https://api.github.com/user" }
  auth: github
}
```

The value is a bare identifier naming the auth block. Referencing an undefined auth block errors: `HTTP node references undefined auth block "<name>"`.

#### Validation rules

- Auth block names match `^[a-zA-Z0-9_]+$`.
- Duplicate block names error.
- `type:` is required and must be one of the five values above.
- Identifier fields (`client_id`, `client_secret`, `key`, `username`, `password`, `token`) must each name a var declared in the referenced secret block. Otherwise the validator errors: `Auth "<name>" references undefined var "<VAR>" not declared in secret block "<secrets>"`.
- `cloud` type should not reference `secrets`.

Runtime token exchange and header injection are platform concerns; the DSL validates references and required fields.

---

### Postgres Block Declaration

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

#### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable label. |
| `secrets` | no | References a top-level `secret` block. Validates bare connection identifiers against that block's `vars`. |
| `connection` | yes | Postgres connection string. Bare identifier (secret ref) or quoted literal (local dev; produces a warning). |
| `table <name> { }` | yes (at least one) | Declares a table with a JSON Schema for one row. Used for validation and LSP autocomplete. |

#### Connection modes

1. **Secret reference**: `secrets: my_secrets` + `connection: DATABASE_URL` (bare identifier validated against the secret block's vars).
2. **Project-level secret**: `connection: DATABASE_URL` without `secrets:` (bare identifier treated as project secret).
3. **Literal string**: `connection: "postgresql://localhost:5432/db"` (quoted string, produces a validator warning for production use).

#### Table declarations

- Table names are unqualified (e.g., `leads`). Runtime uses the `public` schema.
- The JSON Schema describes one row. The validator and LSP use it for column autocomplete and type checking in SQL.
- Table names in node SQL must match a declared table in the referenced postgres block.

---


# 9. Streams

### Persistence Is Top-Level Stream, Not a Block

The old `persistence { }` block inside a graph has been **removed** from the language. Do not use it. The parser emits a hard error: `persistence { } blocks have been removed — use a top-level stream block instead`.

Replace persistence with a top-level `stream <name> { }` declaration that references the graph by name.

**Incorrect (uses the removed persistence block):**

```swirls
graph submissions {
  label: "Record submission"

  persistence {
    enabled: true
    condition: @ts { return true }
  }

  root {
    type: code
    label: "Entry"
    outputSchema: @json { { "type": "object" } }
    code: @ts { return context.nodes.root.input }
  }
}
```

**Correct (top-level stream block):**

```swirls
graph submissions {
  label: "Record submission"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score":   { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score":   { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    code: @ts {
      const { score, message } = context.nodes.root.input
      return { score: Number(score) || 0, message: String(message ?? "").trim() }
    }
  }
}

stream submission_log {
  label: "Submission log"
  graph: submissions

  schema: @json {
    {
      "type": "object",
      "required": ["score", "message"],
      "properties": {
        "score":   { "type": "number" },
        "message": { "type": "string" }
      }
    }
  }

  condition: @ts {
    return true
  }

  prepare: @ts {
    const out = context.output.root!
    return { score: out.score, message: out.message }
  }
}
```

#### Key differences from the old persistence block

| Old persistence | New top-level stream |
|-----------------|----------------------|
| Inside `graph { }` | Top-level block `stream <name> { }` |
| Implicit shape | **Explicit `schema:` (recommended)** |
| No mapping layer | **Required `prepare: @ts { ... }`** returns the shape |
| `condition:` optional | `condition:` optional (must be non-empty if given) |
| Stream name defaulted to graph name | Stream has its own `<name>`; multiple streams can reference one graph |
| Context accessed via `context.nodes` | `prepare` / `condition` access `context.output.<leafNode>` plus `context.nodes` |

#### Why it changed

The old model coupled "what to store" to the graph definition. The new model separates concerns: graphs produce outputs, and one or more top-level stream blocks each decide whether and how to persist those outputs. This lets you add, remove, or re-shape persistence without editing the graph, and lets multiple streams tap the same graph output with different schemas and conditions.

See `resource-stream` for the full spec of top-level `stream { }` blocks and `node-stream` for reading persisted records.

---

### Stream Filters Replaced SQL Queries

Older docs and examples mentioned `@sql { SELECT ... FROM {{table}} }` on stream nodes. That is gone. Stream nodes now use a `filter: @ts { ... }` that returns a plain `StreamFilter` object. The runtime — not you — composes the SQL.

**Incorrect (old SQL form):**

```swirls
node recent {
  type: stream
  stream: "submissions"
  query: @sql {
    SELECT * FROM {{table}} WHERE created_at > NOW() - INTERVAL '7 days'
  }
}
```

The validator errors: `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)`.

**Correct (filter object):**

```swirls
node recent {
  type: stream
  label: "Recent high scorers"
  stream: scored_leads
  filter: @ts {
    return {
      score: { gte: 80 }
    }
  }
}
```

#### Operator reference

| Operator | Meaning |
|----------|---------|
| `eq` | Equal to the given value |
| `ne` | Not equal |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `like` | SQL `LIKE` pattern match (use `%` wildcards) |
| `in` | Value is in the given array |

Multiple top-level keys AND together; multiple operators under one key also AND:

```ts
return {
  score: { gte: 50, lte: 100 },
  category: { in: ["A", "B"] },
  name: { like: "%@example.com" }
}
```

#### Sorting, limits, pagination

Not configurable yet. Default: newest first (by `created_at DESC`), all matching rows. Do not try to add `sort:` or `limit:` fields — they are not parsed.

#### If you truly need raw SQL

For arbitrary SQL against a user-managed database, use a `postgres` node with `select:` against a declared top-level `postgres` block. Stream storage is not user-addressable by raw SQL; it is filtered only.

See `node-stream` for required fields and `resource-stream` for the write side.

---

### Stream Filter Field Paths

Stream filters reference two kinds of fields uniformly: table-level columns and fields inside the persisted output JSON. The runtime decides which is which — you just use the key name.

#### Table-level columns

These are the two first-class columns exposed on every stream row.

| Name | Type | Meaning |
|------|------|---------|
| `created_at` | timestamp | When the row was persisted. |
| `graph_execution_id` | string | Execution that produced the row. |

Use them directly in the filter object:

```swirls
filter: @ts {
  return {
    created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
  }
}
```

#### Output JSON fields

Every other key in the filter is looked up inside the persisted `output` JSON (the shape your `prepare:` returned in the stream block). Nested paths are not currently supported — filter on top-level keys of the prepared record.

If your stream block's `prepare` returns `{ email, name, score }`, filter on `email`, `name`, `score`:

```swirls
filter: @ts {
  return {
    score: { gte: 80 },
    email: { like: "%@example.com" }
  }
}
```

#### Conventions

- The shape of each persisted record is fully controlled by the stream block's `prepare` return value and described by the block's `schema`. Think of the filter as filtering the prepared record, not a graph's raw node outputs.
- If you need to filter on multiple node outputs, combine them inside `prepare` so the persisted record exposes the fields you want.
- `like` uses SQL `LIKE` semantics — `%` is the wildcard. No regex.

#### Legacy column names

If you see older examples using `"root.field"` or other dotted column names in SQL strings, those apply to the removed SQL-query form of stream nodes. They do not apply to filters. Filter keys are flat top-level names only.

See `node-stream` for the full filter API.

---


# 10. Reviews

### Review Block Configuration

Review blocks pause graph execution at a node and wait for human input. The reviewer sees the node's output and fills in a form defined by the review schema, then picks an action with an outcome of `approve` or `reject`.

Any node type can have a review block. Execution pauses after the node runs and before downstream nodes execute.

#### Shorthand form

```swirls
node gate {
  type: code
  label: "Gate"
  code: @ts { return context.nodes.root.output }
  review: true
}
```

`review: true` is sugar for `review: { enabled: true }`.

#### Full form

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts { return { title: context.nodes.root.output.title } }
  review: {
    enabled: true
    title: "Review draft"
    description: "Approve, request changes, or reject"
    content: "Please review the generated draft and choose an action."
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
    actions: [
      { id: "approve", label: "Approve", outcome: "approve" },
      { id: "reject",  label: "Reject",  outcome: "reject" }
    ]
    approvedOutput: "approved"
    rejectedOutput: "rejected"
  }
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `enabled` | implicit `true` when review is present | Boolean | Defaults to `true` if omitted. |
| `title` | no | String | Displayed above the review form. |
| `description` | no | String | Shown under the title. |
| `content` | no | String | Rich text body for the reviewer. |
| `schema` | no | `@json` block | JSON Schema for the form the reviewer fills out. Can be `null`. |
| `actions` | no | Array of action objects | Buttons shown to the reviewer. |
| `approvedOutput` | no | String | Optional static output passed downstream when the action outcome is `approve`. |
| `rejectedOutput` | no | String | Optional static output passed downstream when the action outcome is `reject`. |

#### Action object shape

| Key | Required | Type | Pattern |
|-----|----------|------|---------|
| `id` | yes | String | `^[a-zA-Z0-9_]+$` |
| `label` | yes | String | Non-empty display label. |
| `outcome` | yes | String | Exactly `"approve"` or `"reject"`. |

Invalid action objects cause the validator to emit: `review: <path> — <message>`.

#### Accessing review data downstream

Review results are available in downstream nodes via `context.reviews.<node_name>`. See `review-access-downstream` and `context-reviews`.

---

### Accessing Review Data Downstream

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


# 11. Parser Pitfalls & Validator Diagnostics

### Unicode in Comments Breaks Line Counting

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

### Hyphenated Header Keys Parsed as Subtraction

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

Even quoted keys with hyphens cause the same issue. This applies to plain object literals — the parser sees the hyphen as a subtraction operator.

**Correct (use a @ts block that returns the headers object):**

```swirls
node call_api {
  type: http
  label: "Call API"
  method: "POST"
  url: @ts { return "https://api.example.com" }
  headers: @ts {
    return {
      "Content-Type": "application/json",
      "x-api-key": context.secrets.API_KEY,
      "Authorization": "Bearer " + context.secrets.AUTH_TOKEN
    }
  }
  body: @ts {
    return JSON.stringify({ query: context.nodes.root.output.query })
  }
}
```

By using a `@ts` block, header keys are JavaScript string literals — the parser never sees the hyphens as operators. This is the only safe way to set custom headers with hyphenated keys.

**Also correct (omit headers if defaults suffice):**

HTTP nodes default to JSON content type. If you don't need custom headers, simply omit the `headers` field entirely.

---

### Double-Quote Characters Inside @ts Blocks

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

### Nested Template Literals Break @ts Parsing

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

### Dollar Sign Before Interpolation Breaks Parsing

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

### Parser Silently Drops Graphs

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

### Parse Errors Cascade Past the Actual Problem

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

### Pre-Flight Validation Checklist

Before running `swirls doctor`, verify every item on this checklist. Each item corresponds to a known parser bug or validation failure.

**Parser safety (silent drops):**

- [ ] Comments use ASCII only (no box-drawing, arrows, em dashes, or other Unicode)
- [ ] No `headers` field using plain object literals with hyphenated keys (use a `@ts` block instead)
- [ ] No literal `"` characters inside `@ts` blocks (use `String.fromCharCode(34)`)
- [ ] No nested template literals inside `@ts` blocks (use concatenation)
- [ ] No `$${...}` patterns in template literals (use concatenation)
- [ ] No nested `@ts` or `@json` blocks inside other code blocks (use a single block that returns the full object)

**Structure validation:**

- [ ] Every `graph` has exactly one `root { }` block
- [ ] Every `graph` has a `label` field
- [ ] `flow { }` edges only reference defined node names
- [ ] No cycles in edges
- [ ] No self-referencing edges

**Node validation:**

- [ ] Every `resend` node has `from`, `to`, and `subject` fields
- [ ] Every `ai` node has `kind`, `model`, and `prompt` fields
- [ ] Every `ai` node with `kind: object` has a `schema`
- [ ] Every `code` node has a `code` field
- [ ] Every `switch` node has `cases` and `router` fields
- [ ] Every `http` node has a `url` field
- [ ] Every `graph` node has `graph` and `input` fields
- [ ] Every `bucket` node has an `operation` field
- [ ] Every `postgres` node has a `postgres` field and exactly one of `select` or `insert`
- [ ] Every `postgres` node with `insert` has a `params` field
- [ ] Every `postgres` node references a `postgres` block defined in the same file

**Trigger validation:**

- [ ] All graphs referenced by `type: graph` nodes are in the same file
- [ ] Trigger bindings reference resources and graphs defined in the same file
- [ ] Secret keys use only `[a-zA-Z0-9_]` characters

**File references:**

- [ ] All `@ts "path.ts.swirls"` references point to files that exist on disk (doctor validates this)

**Schema validation:**

- [ ] `@json` blocks contain valid JSON (double-quoted keys, no trailing commas)
- [ ] Braces are balanced in all `@ts { }`, `@json { }`, and `@sql { }` blocks

**After running doctor:**

- [ ] Doctor summary counts match the number of forms/graphs/triggers you defined
- [ ] No unexpected warnings about unused schemas or types

---

### Validator Diagnostics Cheatsheet

Every error and warning the validator can emit, grouped by category. Use this as a pre-flight checklist to avoid `swirls doctor` rejecting your file.

#### Naming (applies to all resources and nodes)

- `<Kind> name: Name must contain only letters, numbers, and underscores` — The name contains a hyphen, dot, space, or other char. Fix to `^[a-zA-Z0-9_]+$`.
- `Duplicate <kind> name "<n>"` — Two declarations share a name. Rename one.

#### Graphs

- `Graph must have exactly one root node (no incoming edges), but none were found. Check for cycles.` — The DAG has no entry point. Add `root { }` or break the cycle.
- `Graph must have exactly one root node, but found N: a, b, ...` — More than one node has no incoming edges. Connect them or remove the extras.
- `Graph must declare root { } as the entry node; the node with no incoming edges must be the root block (found "<n>" instead).` — The entry node exists but was declared `node foo { }` instead of `root { }`. Rename to `root`.
- `Graph contains a cycle - DAG workflows cannot have cycles` — Some edge points backwards. Remove it or route through a new node.
- `Duplicate node name "<n>" in graph` — Two nodes in the same graph share a name.
- `Edge references non-existent source node "<n>"` / `Edge references non-existent target node "<n>"` — Typo, or the node was dropped due to a parse error. Check spelling; check that the node block wasn't rejected.
- `Edge cannot connect a node to itself` — Self-loop. Remove.

#### Nodes (general)

- `Invalid node type "<t>". Must be one of: ai, bucket, code, document, firecrawl, graph, http, parallel, postgres, resend, stream, switch, wait` — Unknown type name. Use one of the 13.
- `Node type "<t>" requires "<field>"` — Missing required field. See the node-type rule for the required set.

#### Secrets map

- `Invalid secret block key "<k>" in secrets map (use only letters, digits, and underscore)` — Hyphen or bad char in a block name in the node's `secrets:` map.
- `Node references undefined secret block "<b>" in secrets map` — The block is not declared at the top level.
- `Invalid secret var "<v>" for block "<b>"` — Hyphen or bad char in a listed var.
- `Secret block "<b>" has no var "<v>" (declared vars: ...)` — You listed a var the secret block does not declare. Add it to `vars:` or remove it from the map.

#### Secret blocks

- `Invalid var "<v>" in secret block (use only letters, digits, and underscore)` — Hyphen or bad char in the secret block's `vars:`.
- `Duplicate var "<v>" in secret block "<n>"` — A var appears twice in the same block's `vars:`.

#### Auth blocks

- `Auth block "<n>" requires type: oauth, api_key, basic, bearer, or cloud` — Missing or invalid `type:`.
- `Auth "<n>" references undefined secret block "<s>"` — `secrets:` names a block that does not exist.
- `Auth "<n>" references undefined var "<V>" not declared in secret block "<s>"` — A field like `client_id: FOO` but `FOO` is not in that secret block's `vars:`.

#### HTTP / auth usage

- `HTTP node references undefined auth block "<b>"` — Node's `auth:` value is not a declared auth block.
- `"auth" is only valid on http nodes` — You put `auth:` on a non-http node (code, ai, etc.). Remove it.

#### Stream nodes

- `streamId is no longer supported on stream nodes; use stream (stream block name)` — Rename `streamId:` to `stream:` with a bare identifier.
- `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)` — Replace with `filter: @ts { return { ... } }`.
- `Stream node references stream block "<n>" which is not defined` — `stream:` names a block that does not exist in the file.
- `Stream node filter must be a non-empty @ts block` — `filter: @ts { }` is empty. Return at least `{}`.
- `Stream node "filter" must be an @ts block or @ts "file.ts.swirls" reference` — You used a plain value for `filter:`.

#### Stream top-level block

- `Stream "<n>": "graph" must reference a declared graph in this file` — Fix the graph name.
- `Stream "<n>": "prepare" is required` — Add a non-empty `prepare: @ts { ... }`.
- `Stream "<n>": "prepare" must be an @ts block or @ts "file.ts.swirls" reference` — Use `@ts`.
- `Stream "<n>": "prepare" @ts block must not be empty` — Add a return.
- `Stream "<n>": "condition" @ts block must not be empty` — Remove `condition:` or give it a body.
- Warning: `Stream "<n>" has no schema; consider adding one`.

#### Parallel nodes

- `Parallel "operation" must be "search", "extract", or "findall", got "<v>"` — Invalid op.
- `Parallel search requires "searchQueries"` / `Parallel extract requires "urls"` / `Parallel findall requires "entityType" / "generator" / "matchConditions" / "matchLimit"` — Missing op-specific field.

#### Vendor-managed schemas

- `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.` — You set `schema:` on `firecrawl`, `parallel`, or `resend`. Remove it.

#### AI nodes

- `Invalid ai kind "<k>". Must be one of: text, object, image, video, embed` — Fix the `kind:` value.
- Warning: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` — Either drop the schema or change kind.

#### Graph (subgraph) nodes

- `Graph node requires "graph"` — Add `graph: <name>`.
- `Graph node references graph "<n>" which is not defined` — Fix the name or declare the child graph.

#### Postgres (top-level block)

- `Postgres block "<n>": connection is required` — Add `connection:`.
- Warning: `Postgres block "<n>": plaintext connection string — use a secret` — Move the URL into a secret.
- `Postgres block "<n>": connection references var "<V>" not declared in secret block "<s>"` — Var must appear in the referenced block's `vars`.
- `Postgres block "<n>" requires at least one "table"` — Add a `table <name> { schema: @json { ... } }`.
- `Postgres block "<n>": duplicate table "<t>"` — Rename one.
- `Postgres block "<n>": table "<t>" requires "schema"` — Each table needs a JSON Schema.

#### Postgres nodes

- `Postgres node requires "postgres"` — Add `postgres: <block_name>`.
- `Postgres node references postgres block "<b>" which is not defined`.
- `Postgres node requires exactly one of "select" or "insert"` — Remove the other, or add the missing one.
- `Postgres insert node requires "params"` — Inserts always need params.
- `select must begin with SELECT or WITH` / `insert must begin with INSERT`.
- `select references table "<t>" not declared in postgres block "<b>"` — Add the table declaration.
- `insert references table "<t>" not declared in postgres block "<b>"`.
- `INSERT values must be parenthesized: VALUES ({{key}}, ...)`.
- `Param "<p>" has no matching {{<p>}} placeholder in SQL` / `Placeholder {{<p>}} has no matching key in params` — Align placeholder names with params keys.

#### Triggers

- `Trigger references <type> "<n>" which is not defined`.
- `Trigger references graph "<g>" which is not defined`.

#### Review

- `review: <path> — <message>` — The review block didn't match the schema (e.g. bad action outcome, missing required field). Fix per the message.

---
