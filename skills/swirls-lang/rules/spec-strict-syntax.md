---
title: Strict Syntax Specification
impact: CRITICAL
tags: spec, syntax, keywords, fields, types, strict, hallucination, validation
---

## Strict Syntax Specification

The Swirls DSL is a declarative configuration language. It is not TypeScript, YAML, or a general-purpose programming language. Only the constructs listed below are valid. If something is not listed here, it does not exist in the language. Do not invent syntax by analogy with other languages.

### Complete keyword list

These are the only keywords recognized by the lexer (`packages/language/src/lexer.ts`). Any other word is parsed as an identifier or a quoted string.

```
form, webhook, schedule, graph, trigger, secret, auth, postgres, stream,
node, root, type, label, description, enabled, schema, cron, timezone,
version, review, condition, name, flow, select, insert, params, table
```

Note: `persistence` is NOT a keyword. The old `persistence { }` block has been removed. Use a top-level `stream { }` block instead.

### Complete top-level declaration list

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

### Resource name pattern

All resource names (forms, webhooks, schedules, graphs, streams, triggers, secrets, auth, postgres, nodes, secret vars, switch cases, review action ids) must match:

```
^[a-zA-Z0-9_]+$
```

Names may start with a digit. Hyphens, dots, spaces, and other characters are not allowed. `bad-name`, `1.0`, and `with space` are invalid. `my_name`, `name1`, and `_name` are valid.

### Complete node type list

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

### Complete config value types

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

### Complete fenced block languages

Only three: `@ts`, `@json`, `@sql`. No others exist. No `@yaml`, `@html`, `@css`, `@graphql`, `@py`, `@sh`.

### Complete edge syntax

Inside a `flow { }` block only:

- Simple edge: `source -> target`
- Labeled edge: `source -["label"]-> target`

No other edge syntax exists. No conditional edges, no weighted edges, no `=>`, no `-->`, no `.`.

### Trigger binding syntax

Inside a `trigger <name> { }` block, exactly one binding line:

```
form:<formName> -> <graphName>
webhook:<webhookName> -> <graphName>
schedule:<scheduleName> -> <graphName>
```

Only three resource types are valid in triggers: `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, `trigger:`, `http:`, or any other prefix.

### Complete auth types

Inside an `auth <name> { }` block, `type:` must be one of:

```
oauth, api_key, basic, bearer, cloud
```

No other types exist. `jwt`, `mtls`, `session`, `cookie`, `saml`, `digest`, `ntlm` are not valid.

### Constructs that DO NOT exist

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

### Valid fields per node type

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

### Shared optional fields on every node

- `label` — display string. Defaults to the node name (or `"root"` for root).
- `description` — longer descriptive string.
- `secrets` — object literal: `{ blockName: [VAR1, VAR2], otherBlock: [VAR3] }`. The block name must be a declared top-level `secret` block and each var must appear in that block's `vars` list. Accessed at runtime as `context.secrets.blockName.VAR1`.
- `review` — either `review: true` or `review: { enabled, title, description, content, schema, actions, approvedOutput, rejectedOutput }`. See `review-config`.
- `failurePolicy` (optional) — `{ strategy: "fail" | "retry" | "skip" | "fallback", maxRetries, backoffMs, fallbackValue }`.
