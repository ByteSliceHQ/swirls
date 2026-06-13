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
form, webhook, schedule, workflow, graph, trigger, secret, auth, postgres, stream, view, schema,
disk, agent, channel, connection, profile, tools,
role, match, policy, allow, deny,
node, root, type, label, description, enabled, cron, timezone, version, review,
condition, name, flow, select, insert, params, table,
subgraph, map, while, items, update, maxItems, maxIterations, concurrency
```

Note: `workflow` is the canonical keyword for a workflow declaration and the `type: workflow` (subworkflow) node. `graph` is a still-accepted **legacy alias** for both: the parser maps `graph` → `workflow` (block keyword, `type:`, and the `graph:` reference field). Prefer `workflow`; expect to see `graph` in older files.

Note: `persistence` is NOT a keyword. The old `persistence { }` block has been removed. Use a top-level `stream { }` block instead.

### Complete top-level declaration list

These are the only valid top-level blocks. Nothing else can appear at the top level of a `.swirls` file.

```
version: <number>
schema <name> { }
form <name> { }
webhook <name> { }
schedule <name> { }
workflow <name> { }
stream <name> { }
view <name> { }
trigger <name> { }
secret <name> { }
auth <name> { }
postgres <name> { }
disk <name> { }
agent <name> { }
channel <name> { }
connection <name> { }
role <name> { }
policy { }
```

There are **17** top-level block kinds (plus the optional `version:` line). `workflow <name> { }` was formerly written `graph <name> { }`; `graph` still parses as a legacy alias. `agent <name> { }` is an LLM agent definition with tools, profiles, and a subagent `team`, bound by `type: agent` nodes; `channel <name> { }` binds an agent to a chat platform (Slack, Linear, Discord, or web); `connection <name> { }` is a project-scoped, Swirls-brokered outbound OAuth slot referenced by `http` nodes and channels; `disk <name> { }` is an Archil-backed remote disk that `type: disk` nodes mount. `view <name> { }` composes one or more `stream` blocks into a spreadsheet, mapping each source row through `columns` and optionally adding `computed` columns that run a graph per row (see `resource-view`); it is not a node type and is not referenced from inside a workflow. The access-control pair — `role <name> { }` (claim matching) and `policy { }` (nameless; `allow|deny <role> -> agent <name>|*` grants, which flip the project to deny-by-default) — is covered in `resource-access-control`. There is no `access { }` block; it was removed.

### Resource name pattern

All resource names (forms, webhooks, schedules, workflows, streams, views, triggers, secrets, auth, postgres, schemas, agents, channels, connections, roles, nodes, secret vars, switch cases, review action ids) must match:

```
^[a-zA-Z0-9_]+$
```

Names may start with a digit. Hyphens, dots, spaces, and other characters are not allowed. `bad-name`, `1.0`, and `with space` are invalid. `my_name`, `name1`, and `_name` are valid.

### Complete node type list

These are the only valid values for `type:` inside a node or root block. There are **16** node types. The canonical names come from `nodeTypeMap` in `@swirls/schemas` (`packages/schemas/src/schemas.ts`).

```
agent, ai, bucket, code, disk, email, http, map,
parallel, postgres, scrape, stream, switch, wait, while, workflow
```

The subworkflow node is `type: workflow` (legacy alias `type: graph`, which the validator normalizes to `workflow`). When `swirls doctor` rejects an unknown type it lists the valid set sorted: `Invalid node type "<t>". Must be one of: agent, ai, bucket, code, disk, email, http, map, parallel, postgres, scrape, stream, switch, wait, while, workflow`.

Notes on aliases that do NOT exist:
- `email` is the type name, not `resend`, `mail`, or `mailer`. (The Resend vendor backs it; the DSL type is `email`.)
- `scrape` is the type name, not `firecrawl`, `crawl`, or `fetch`. (Firecrawl is the vendor; the DSL type is `scrape`.)
- `disk` is the type name, not `archil`, `volume`, `fs`, or `filesystem`. (Archil backs it; the DSL type is `disk`.)
- `agent` is the type name, not `llm-agent`, `assistant`, or `react`. (`ai` is a one-shot LLM call; `agent` is an agentic harness with tools.)
- `http` is the type name, not `api`, `request`, or `fetch`.
- `wait` is the type name, not `delay` or `sleep`.
- `ai` is the type name, not `llm`, `chat`, or `prompt`.
- `workflow` is the type name for calling a subworkflow, not `subworkflow`, `subgraph`, `call`, or `child`. (`graph` is a legacy alias for `workflow`; `subgraph` is the inline-block keyword inside `map`/`while` nodes, not a node type.)
- `postgres` is the type name, not `db`, `database`, or `sql`.
- `bucket` is the type name, not `storage`, `file`, or `s3`.
- `parallel` is the type name, not `fanout` or `workers`. Use `map` for per-item iteration.
- `map` is the type name, not `for`, `each`, or `foreach`.
- `while` is the type name, not `until`, `loop`, or `repeat`.
- There is no `document` node type. Document workflows compose `bucket` (storage), `disk` (mounted exec), and `ai` / `code` nodes.

### Complete config value types

These are the only value forms that can appear after a `:` in a field assignment.

- String literal: `"value"`
- Number: `42`, `3.14`, `-1` (negative literals are supported)
- Boolean: `true`, `false`
- Bare identifier: `my_name` (parsed as a string; used to reference top-level blocks like `workflow: helper_workflow`, `stream: my_stream`, `schema: my_schema`)
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
form:<formName> -> <workflowName>
webhook:<webhookName> -> <workflowName>
schedule:<scheduleName> -> <workflowName>
```

Only three resource types are valid in triggers: `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, `trigger:`, `http:`, or any other prefix.

### Complete auth types

Inside an `auth <name> { }` block, `type:` must be one of:

```
oauth, api_key, basic, bearer
```

No other types exist. `jwt`, `mtls`, `session`, `cookie`, `saml`, `digest`, `ntlm` are not valid. The `cloud` type has been removed; for a Swirls-brokered OAuth grant use a top-level `connection` block (see below).

### Form visibility and auth fields

`form <name> { }` accepts a `visibility:` field whose value is a **bare identifier** — one of two values:

```
visibility: public
visibility: internal
```

Default is `internal` when omitted. `public` exposes the form via the Triggers service at `/triggers/forms/:projectId/:formName`. `internal` returns 404 from Triggers (the dashboard can still read/edit the form). A quoted value (`visibility: "public"`) or a missing colon (`visibility public`) is a parser error. See `resource-form`.

`form <name> { }` also accepts `auth: <authBlockName>` — a bare identifier referencing a top-level `auth` block with `type: basic`. The Triggers service then requires HTTP Basic credentials (from the auth block's secret vars) on form GET/POST. Visibility is enforced first, so `auth:` is dead config on internal forms. See `resource-form`.

### Webhook authentication fields

`webhook <name> { }` accepts two paired fields for shared-secret verification:

```
secret: <secretBlockName>.<VAR>
header: "Header-Name"
```

`secret:` uses dot notation between the secret block name and the variable name (no quotes). `header:` is a quoted string naming the inbound HTTP header. Both must be set together (or neither). Setting only one is a validator error. Setting neither emits a warning that the webhook accepts unverified requests. Reserved headers (e.g. `Cookie`, `Host`, `Content-Type`, `User-Agent`, `X-Forwarded-*`) are rejected. See `resource-webhook`.

### Channel block fields

`channel <name> { }` binds an `agent` block to a chat platform. Fields:

```
platform: slack | linear | discord | web      // required
integration: slack | linear | discord | web    // optional; defaults to platform; must equal platform
connection: <connectionName>                   // optional; bare name of a top-level connection block
agent: <agentName>                             // required; bare identifier of a top-level agent block
mode: mention | dm | all                       // optional; defaults to mention
enabled: true | false                          // optional; defaults to enabled
label: "..."   description: "..."              // optional
```

`platform`, `integration`, and `mode` are conventionally bare values (the parser also accepts quoted strings). `integration` is optional and defaults to `platform`; when set it must equal `platform` or it is a validator error. `connection` optionally names a top-level `connection` block supplying the OAuth credential; its `provider` must match `platform`. Two enabled channels cannot share the same `platform : mode : agent` tuple. `agent` must name a declared `agent` block. Channel blocks reject unknown keys with `Unknown channel property "<key>"`. See `resource-channel`.

### Connection block fields

`connection <name> { }` declares a project-scoped, Swirls-brokered outbound OAuth slot. Fields:

```
provider: slack | linear | discord | linkedin | microsoft   // required; bare value
label: "..."   description: "..."                            // optional
```

`provider` is the only required field and must be one of the five values. A connection is referenced by bare name from an `http` node (`connection: <name>`) or a channel (`connection: <name>`); a node sets either `auth` or `connection`, never both. See `resource-connection`.

### Access-control blocks

`role <name> { match { <claim>: <value> } }` derives a role from verified principal attributes (scalar value = equality, array value = membership). `policy { allow|deny <role> -> agent <name>|* { workflows: […], tools: […] } }` grants roles access to agents; declaring any grant flips the project to deny-by-default. There is no `access { }` block. See `resource-access-control`.

### Agent subagent team

`agent <name> { }` accepts `team: [ agentName, ... ]` — a bare-identifier array of other agent blocks this agent may delegate to. Each team member becomes a callable tool. An agent cannot list itself, and a team member name cannot collide with a workflow name in the same agent's `tools`. See `resource-agent`.

### Agent wallet (Zero tool spend)

`agent <name> { }` accepts an optional `wallet: { }` block for a virtual per-agent Zero tool-spend budget:

```
budget: <positive number>          // USD cap for the cadence window
cadence: daily | weekly | monthly // bare identifier
maxPerCall: <positive number>      // optional; per-call USD ceiling, must be <= budget
```

When present, the runtime registers `zero_search`, `zero_get`, `zero_fetch`, and `zero_wallet_status` (platform wallet required). There is no profile-level wallet override. See `resource-agent`.

### Inline `subgraph { }` block (map / while only)

`map` and `while` nodes accept an inline `subgraph { ... }` block instead of a `workflow: <name>` reference. The keyword takes **no colon**:

```swirls
node each_item {
  type: map
  items: @ts { return [{ x: 1 }] }
  maxItems: 10

  subgraph {
    root {
      type: code
      inputSchema: @json { ... }
      code: @ts { return context.iteration.item.x + 1 }
    }
    flow { root -> next_node }
  }
}
```

`subgraph { }` body has the same shape as `graph { }` body (`root { }`, `node { }`, `flow { }`) but cannot have its own `label:` or `description:`. The subgraph root MUST declare `inputSchema` for typed iteration. A node uses **exactly one** of `subgraph { }` or `workflow: <name>` — never both, never neither.

### Constructs that DO NOT exist

The following constructs do not exist in the Swirls DSL. Do not use them.

**No control flow at DSL level:** `if`, `else`, `do`, `switch` (as a keyword), `case`, `default`, `break`, `continue`, `return`. (`while` and `map` are node types, not control flow keywords; `match` is the claim-matching block inside `role` declarations, not a control-flow construct.)

**No `for` keyword.** Iteration is done via the `map` node (per-item) or `while` node (counter / condition).

**No variables:** `const`, `let`, `var`, `declare`, `=` assignment, top-level constants.

**No functions:** `function`, `async`, `await`, `=>` arrow functions (outside @ts blocks).

**No imports/exports:** `import`, `export`, `from`, `require`, `module`, `package`.

**No types at DSL level:** `interface`, `type` (as a declaration), `extends`, `implements`, `class`, `enum`, `namespace`.

**No error handling at DSL level:** `try`, `catch`, `throw`, `finally`. (These work inside `@ts` blocks.)

**No operators at DSL level:** `+`, `-`, `*`, `/`, `%`, `&&`, `||`, `!`, `==`, `!=`, `<`, `>`, `?`, `:` (ternary), `...` (spread).

**No string interpolation at DSL level.** Template literals and `${}` only work inside `@ts` blocks. SQL uses `{{name}}` placeholders only.

**No inline TypeScript outside of `@ts` blocks.** You cannot write `code: return {}`. It must be `code: @ts { return {} }`.

**No `persistence { }` blocks.** They have been removed. The parser emits: `persistence { } blocks have been removed — use a top-level stream block instead`. Use `stream <name> { workflow: g, version: v1, versions: { v1 { schema, condition?, prepare } } }` at the top level. `schema`, `condition`, and `prepare` live inside a `versions:` entry, never at the top level of the block.

**No `outputSchema` on non-root nodes.** Use `schema` instead. The parser rejects `outputSchema` on non-root nodes with: `Use "schema" instead of "outputSchema" in node blocks`.

**No `inputSchema` on non-root nodes (except a `subgraph { }` root).** Only the outer-graph root and a map/while subgraph root accept `inputSchema`. The parser emits: `inputSchema is only allowed in root { } blocks` and drops the entire node.

**No conditional routing at the edge level.** Conditional routing requires a `switch` node with `cases` and `router`, plus labeled edges in the flow block.

**No chaining of edges on one line.** `root -> a -> b` is invalid. Each edge is one line: `root -> a` then `a -> b`.

**No `resend` node type.** The correct type name is `email`. (Resend is the underlying vendor; the DSL type name is `email`.)

**No `firecrawl` node type.** The correct type name is `scrape`. (Firecrawl is the underlying vendor; the DSL type name is `scrape`.)

**No `document` node type.** There is no built-in document node. For document workflows use `bucket` (object storage), `disk` (mounted bash exec on Archil), `ai` (LLM extraction), and `code` (transforms) together.

**No `archil`, `volume`, or `fs` node type.** The correct type name is `disk`. Archil is the vendor backing the remote disk.

**No `llm-agent`, `assistant`, or `react` node type.** The correct type name is `agent`. `agent` binds to a top-level `agent <name> { }` block.

**No `api`, `request`, or `fetch` node type.** The correct type name is `http`.

**No `delay` or `sleep` node type.** The correct type name is `wait`.

**No `llm`, `prompt`, or `chat` node type.** The correct type name is `ai`.

**No `subworkflow`, `subgraph`, `child`, or `call` node type.** The correct type name is `workflow` (legacy alias `graph`). (`subgraph` is the inline-block keyword inside `map`/`while` nodes, not a node type.)

**No `db`, `database`, or `sql` node type for external databases.** The correct type name is `postgres`.

**No `storage`, `file`, or `s3` node type.** The correct type name is `bucket`.

**No `template` or `render` node type.** Generate text in `code` or `ai` nodes.

**No `loop`, `retry`, `for`, or generic `iter` node type.** Use `map` (per-item iteration) or `while` (counter / condition). The workflow itself is a DAG and cannot have cycles.

**No `webhook` or `form` or `schedule` as node types.** These are top-level resource declarations only. Nodes receive data through triggers via `context.nodes.root.input`.

**No `trigger` node type.** Triggers are top-level declarations that bind resources to workflows.

### Valid fields per node type

Only these fields have semantics for each node type. All types additionally accept `type`, `label`, `description`, `secrets`, `review`, `failurePolicy`. Root nodes additionally accept `inputSchema` and `outputSchema`. Non-root nodes accept `schema` (not `outputSchema`).

**ai** — required: `kind`. Valid kinds: `text`, `object`, `image`, `video`, `embed`. Other fields: `model`, `prompt` (@ts), `provider` (`openrouter` default, `anthropic`, `openai`, `google`), `temperature`, `maxTokens`, `options` (object; for image: `n`, `size`, `aspectRatio`), `schema` (required for `kind: object`; warning if set on `kind: text`).

**code** — required: `code` (@ts block or `@ts "file.ts.swirls"`). Other fields: `schema`.

**switch** — required: `cases` (non-empty array of alphanumeric+underscore strings), `router` (@ts returning one of the case strings).

**http** — required: `url` (@ts or string). Other fields: `method` (`GET`/`POST`/`PUT`/`DELETE`/`PATCH`), `headers` (@ts returning object), `body` (@ts), `auth` (bare identifier referencing an auth block) or `connection` (bare identifier referencing a `connection` block) — set one, not both. Both `auth` and `connection` are only valid on http nodes.

**scrape** — required: `url`. Other fields: `onlyMainContent`, `formats` (array), `maxAge`, `parsers` (array). No user `schema:` — vendor-managed output shape. Backed by Firecrawl (`FIRECRAWL_API_KEY`).

**email** — required: `from`, `to`, `subject` (all @ts or string). Other fields: `text`, `html`, `replyTo`. No user `schema:` — vendor-managed output. Backed by Resend (`RESEND_API_KEY`).

**parallel** — required: `operation` (`search`, `extract`, or `findall`), `objective`.
- `operation: search` also requires `searchQueries` (@ts returning string[]). Optional: `mode` (`one-shot` | `agentic` | `fast`), `excerptsMaxCharsPerResult`, `excerptsMaxCharsTotal`.
- `operation: extract` also requires `urls` (@ts returning string[]). Optional: `excerpts`, `fullContent`.
- `operation: findall` also requires `entityType`, `generator` (`base`/`core`/`pro`/`preview`), `matchConditions` (@ts), `matchLimit` (number; API requires 5–1000). Optional: `excludeList`, `pollInterval`, `pollIntervalUnit` (`seconds`/`minutes`), `pollTimeout`, `pollTimeoutUnit`.
No user `schema:` — vendor-managed output shape.

**stream** (node, read side) — required: `stream` (bare identifier naming a top-level `stream <name> { }` block), `version` (the `versions:` key to read, e.g. `v1`), `filter` (@ts returning a `StreamFilter` object of shape `{ field: { op: value } }` where op is `eq`/`ne`/`gt`/`gte`/`lt`/`lte`/`like`/`in`). `streamId`, `query`, `querySql` are removed; using them produces validator errors.

**workflow** (legacy alias `graph`) — required: `workflow` (bare identifier naming a workflow in the same file; `graph:` is the legacy alias and is normalized to `workflow`), `input` (@ts returning the input object to pass to the subworkflow).

**map** — required: `items` (@ts returning array), `maxItems` (positive number), plus exactly one of `subgraph { ... }` (inline block, no colon) or `workflow: <name>` (reference to a top-level workflow). Optional: `concurrency` (positive integer). The subgraph/referenced-workflow root must declare `inputSchema` (typed iteration). Iteration context: `context.iteration.item` is the current element. See `node-map` and `workflow-subgraph`.

**while** — required: `input` (@ts returning the initial loop state), `condition` (@ts returning boolean; loop continues while true), `update` (@ts returning the next iteration's input), `maxIterations` (positive integer), plus exactly one of `subgraph { ... }` or `workflow: <name>`. The subgraph/referenced-workflow root must declare `inputSchema`. Iteration context: `context.iteration.input` (initial), `context.iteration.index` (counter), `context.iteration.previous` (last iteration's leaf outputs). See `node-while`.

**wait** — no required fields. Optional: `amount` (number), `unit` (`seconds`/`minutes`/`hours`/`days`), `secondsFromConfig`.

**bucket** — required: `operation` (`download` or `upload`). Optional: `path`.

**disk** — required: `disk` (bare identifier naming a top-level `disk <name> { }` block), `command` (@ts returning a shell command string, or a string literal). Backed by Archil (`ARCHIL_API_KEY`). Optional: `schema` (typing the command output). See `node-disk` and `resource-disk`.

**agent** — required: `agent` (bare identifier naming a top-level `agent <name> { }` block), `prompt` (@ts). Optional: `profile` (bare identifier naming a profile inside the agent block), `tools` (array of bare identifiers narrowing within the effective tool set), `system` (@ts; per-call system-prompt override), `schema` (structured-output constraint; use `schema`, never `outputSchema`). See `node-agent` and `resource-agent`.

**postgres** (node) — required: `postgres` (bare identifier naming a top-level `postgres <name> { }` block) and exactly one of `select:` (@sql SELECT or WITH) or `insert:` (@sql INSERT, optionally with ON CONFLICT). Other fields: `params` (@ts returning an object whose keys match `{{key}}` placeholders in the SQL; required when SQL has placeholders, always required for `insert:`), `condition` (@ts returning boolean; only valid on `insert:` nodes), `schema` (recommended for `select:` to type the row output).

### Shared optional fields on every node

- `label` — display string. Defaults to the node name (or `"root"` for root).
- `description` — longer descriptive string.
- `secrets` — object literal: `{ blockName: [VAR1, VAR2], otherBlock: [VAR3] }`. The block name must be a declared top-level `secret` block and each var must appear in that block's `vars` list. Accessed at runtime as `context.secrets.blockName.VAR1`.
- `review` — either `review: true` or `review: { enabled, title, description, content, schema, actions, approvedOutput, rejectedOutput }`. See `review-config`.
- `failurePolicy` (optional) — `{ strategy: "fail" | "retry" | "skip" | "fallback", maxRetries, backoffMs, fallbackValue }`.
- `format` — presentation format for the node's output, a bare identifier: `markdown`, `html`, `text`, `image`, `video`, `audio`, `mixed`, or `json`. The validator checks the declared output schema is compatible (top-level string, a `{ markdown | html | text | url }` string property, or a `contentMediaType` hint; `json`/`mixed` always pass).

### Schema reference syntax (bare identifier)

`inputSchema:`, `outputSchema:`, `schema:` (on form/webhook/node), and `review: { schema: ... }` accept either:

- An inline `@json { ... }` block.
- An object literal: `{ "type": "object", ... }`.
- A bare identifier naming a top-level `schema <name> { }` block: `inputSchema: contact_payload`.

The bare-identifier form requires a matching `schema <name> { }` declaration somewhere in the workspace. See `resource-schema`.

Placement is strict: `inputSchema` and `outputSchema` belong on **root blocks only**; non-root nodes use `schema`. A `schema:` key on a **root** block is not recognized — the parser cannot consume its `@json` value and emits an `Unexpected token` error, dropping the rest of the root config. Use `outputSchema` on root.
