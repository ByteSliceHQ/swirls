# Swirls Language - Complete Reference

> Comprehensive guide for authoring `.swirls` workflow files. Compiled from the individual rule files under `rules/`.
>
> **Source of truth lives in `rules/`.** This file is regenerated from those rules by `apps/web/skills/regen-agents.ts`. When in doubt, defer to `rules/spec-strict-syntax.md` and `rules/spec-common-mistakes.md`.
>
> Current scope: **17 node types** (`agent, ai, bucket, code, disk, email, http, integration, map, parallel, postgres, scrape, stream, switch, wait, while, workflow`; `graph` is a legacy alias for `workflow`), **18 top-level declarations** (`schema, form, webhook, schedule, workflow, stream, view, trigger, secret, auth, connection, action, postgres, disk, agent, channel, role, policy`), inline `subgraph { }` for map/while, form `visibility: public | internal` and HTTP Basic `auth:`, webhook shared-secret `secret:` + `header:`, top-level `schema <name> { }` blocks referenced by bare identifier, top-level `view <name> { }` blocks composing streams into a spreadsheet with per-row `computed` graph columns, `context.iteration.*` (item/index/input/previous) for map/while subgraphs, agent subagent `team`, `channel` blocks binding an agent to Slack / Linear / Discord / web, `connection` blocks declaring Swirls-brokered outbound OAuth slots, and access-control `role` / `policy` blocks.


# 1. Language Specification (READ FIRST)

### Strict Syntax Specification

The Swirls DSL is a declarative configuration language. It is not TypeScript, YAML, or a general-purpose programming language. Only the constructs listed below are valid. If something is not listed here, it does not exist in the language. Do not invent syntax by analogy with other languages.

#### Complete keyword list

These are the only keywords recognized by the lexer (`packages/language/src/lexer.ts`). Any other word is parsed as an identifier or a quoted string.

```
form, webhook, schedule, workflow, graph, trigger, secret, auth, postgres, stream, view, schema,
disk, agent, channel, connection, action, profile, tools,
role, match, policy, allow, deny,
node, root, type, label, description, enabled, cron, timezone, version, review,
condition, name, flow, select, insert, params, table,
subgraph, map, while, items, update, maxItems, maxIterations, concurrency
```

Note: `workflow` is the canonical keyword for a workflow declaration and the `type: workflow` (subworkflow) node. `graph` is a still-accepted **legacy alias** for both: the parser maps `graph` → `workflow` (block keyword, `type:`, and the `graph:` reference field). Prefer `workflow`; expect to see `graph` in older files.

Note: `persistence` is NOT a keyword. The old `persistence { }` block has been removed. Use a top-level `stream { }` block instead.

#### Complete top-level declaration list

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
action <name> { }
role <name> { }
policy { }
```

There are **18** top-level block kinds (plus the optional `version:` line). `workflow <name> { }` was formerly written `graph <name> { }`; `graph` still parses as a legacy alias. `agent <name> { }` is an LLM agent definition with tools, profiles, and a subagent `team`, bound by `type: agent` nodes; `channel <name> { }` binds an agent to a chat platform (Slack, Linear, Discord, or web); `connection <name> { }` is a project-scoped, Swirls-brokered outbound OAuth slot referenced by `http` nodes and channels; `action <name> { }` declares a typed integration operation referenced by `type: integration` nodes via `action:` (see `resource-action`); `disk <name> { }` is an Archil-backed remote disk that `type: disk` nodes mount. `view <name> { }` composes one or more `stream` blocks into a spreadsheet, mapping each source row through `columns` and optionally adding `computed` columns that run a graph per row (see `resource-view`); it is not a node type and is not referenced from inside a workflow. The access-control pair — `role <name> { }` (claim matching) and `policy { }` (nameless; `allow|deny <role> -> agent <name>|*` grants, which flip the project to deny-by-default) — is covered in `resource-access-control`. There is no `access { }` block; it was removed.

#### Resource name pattern

All resource names (forms, webhooks, schedules, workflows, streams, views, triggers, secrets, auth, postgres, schemas, agents, channels, connections, actions, roles, nodes, secret vars, switch cases, review action ids) must match:

```
^[a-zA-Z0-9_]+$
```

Names may start with a digit. Hyphens, dots, spaces, and other characters are not allowed. `bad-name`, `1.0`, and `with space` are invalid. `my_name`, `name1`, and `_name` are valid.

#### Complete node type list

These are the only valid values for `type:` inside a node or root block. There are **17** node types. The canonical names come from `nodeTypeMap` in `@swirls/schemas` (`packages/schemas/src/schemas.ts`).

```
agent, ai, bucket, code, disk, email, http, integration, map,
parallel, postgres, scrape, stream, switch, wait, while, workflow
```

The subworkflow node is `type: workflow` (legacy alias `type: graph`, which the validator normalizes to `workflow`). When `swirls doctor` rejects an unknown type it lists the valid set sorted: `Invalid node type "<t>". Must be one of: agent, ai, bucket, code, disk, email, http, integration, map, parallel, postgres, scrape, stream, switch, wait, while, workflow`.

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

#### Complete config value types

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
form:<formName> -> <workflowName>
webhook:<webhookName> -> <workflowName>
schedule:<scheduleName> -> <workflowName>
```

Only three resource types are valid in triggers: `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, `trigger:`, `http:`, or any other prefix.

#### Complete auth types

Inside an `auth <name> { }` block, `type:` must be one of:

```
oauth, api_key, basic, bearer
```

No other types exist. `jwt`, `mtls`, `session`, `cookie`, `saml`, `digest`, `ntlm` are not valid. The `cloud` type has been removed; for a Swirls-brokered OAuth grant use a top-level `connection` block (see below).

#### Form visibility and auth fields

`form <name> { }` accepts a `visibility:` field whose value is a **bare identifier** — one of two values:

```
visibility: public
visibility: internal
```

Default is `internal` when omitted. `public` exposes the form via the Triggers service at `/triggers/forms/:projectId/:formName`. `internal` returns 404 from Triggers (the dashboard can still read/edit the form). A quoted value (`visibility: "public"`) or a missing colon (`visibility public`) is a parser error. See `resource-form`.

`form <name> { }` also accepts `auth: <authBlockName>` — a bare identifier referencing a top-level `auth` block with `type: basic`. The Triggers service then requires HTTP Basic credentials (from the auth block's secret vars) on form GET/POST. Visibility is enforced first, so `auth:` is dead config on internal forms. See `resource-form`.

#### Webhook authentication fields

`webhook <name> { }` accepts two paired fields for shared-secret verification:

```
secret: <secretBlockName>.<VAR>
header: "Header-Name"
```

`secret:` uses dot notation between the secret block name and the variable name (no quotes). `header:` is a quoted string naming the inbound HTTP header. Both must be set together (or neither). Setting only one is a validator error. Setting neither emits a warning that the webhook accepts unverified requests. Reserved headers (e.g. `Cookie`, `Host`, `Content-Type`, `User-Agent`, `X-Forwarded-*`) are rejected. See `resource-webhook`.

#### Channel block fields

`channel <name> { }` binds an `agent` block to a chat platform. Fields:

```
platform: slack | linear | discord | web      // required
connection: <connectionName>                   // optional; bare name of a top-level connection block
agent: <agentName>                             // required; bare identifier of a top-level agent block
mode: mention | dm | all                       // optional; defaults to mention
enabled: true | false                          // optional; defaults to enabled
label: "..."   description: "..."              // optional
```

`platform` and `mode` are conventionally bare values (the parser also accepts quoted strings). `connection` optionally names a top-level `connection` block supplying the OAuth credential; its `provider` must match `platform`. Two enabled channels cannot share the same `platform : mode : agent` tuple. `agent` must name a declared `agent` block. Channel blocks reject unknown keys with `Unknown channel property "<key>"` (including removed `integration:`). See `resource-channel`.

#### Connection block fields

`connection <name> { }` declares a project-scoped, Swirls-brokered outbound OAuth slot. Fields:

```
provider: slack | linear | discord | linkedin | microsoft   // required; bare value
label: "..."   description: "..."                            // optional
```

`provider` is the only required field and must be one of the five values. A connection is referenced by bare name from an `http` node (`connection: <name>`) or a channel (`connection: <name>`); a node sets either `auth` or `connection`, never both. See `resource-connection`.

#### Access-control blocks

`role <name> { match { <claim>: <value> } }` derives a role from verified principal attributes (scalar value = equality, array value = membership). `policy { allow|deny <role> -> agent <name>|* { workflows: […], tools: […] } }` grants roles access to agents; declaring any grant flips the project to deny-by-default. There is no `access { }` block. See `resource-access-control`.

#### Agent subagent team

`agent <name> { }` accepts `team: [ agentName, ... ]` — a bare-identifier array of other agent blocks this agent may delegate to. Each team member becomes a callable tool. An agent cannot list itself, and a team member name cannot collide with a workflow name in the same agent's `tools`. See `resource-agent`.

#### Agent wallet (Zero tool spend)

`agent <name> { }` accepts an optional `wallet: { }` block for a virtual per-agent Zero tool-spend budget:

```
budget: <positive number>          // USD cap for the cadence window
cadence: daily | weekly | monthly // bare identifier
maxPerCall: <positive number>      // optional; per-call USD ceiling, must be <= budget
```

When present, the runtime registers `zero_search`, `zero_get`, `zero_fetch`, and `zero_wallet_status` (platform wallet required). There is no profile-level wallet override. See `resource-agent`.

#### Inline `subgraph { }` block (map / while only)

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

#### Constructs that DO NOT exist

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

#### Valid fields per node type

Only these fields have semantics for each node type. All types additionally accept `type`, `label`, `description`, `secrets`, `review`, `failurePolicy`. Root nodes additionally accept `inputSchema` and `outputSchema`. Non-root nodes accept `schema` (not `outputSchema`).

**ai** — required: `kind`. Valid kinds: `text`, `object`, `image`, `video`, `embed`. Other fields: `model`, `prompt` (@ts), `provider` (`openrouter` default, `anthropic`, `openai`, `google`), `temperature`, `maxTokens`, `options` (object; for image: `n`, `size`, `aspectRatio`), `schema` (required for `kind: object`; warning if set on `kind: text`).

**code** — required: `code` (@ts block or `@ts "file.ts.swirls"`). Other fields: `schema`.

**switch** — required: `cases` (non-empty array of alphanumeric+underscore strings), `router` (@ts returning one of the case strings).

**http** — required: `url` (@ts or string). Other fields: `method`, `headers` (@ts), `body` (@ts), `auth` or `connection` — set one, not both. Both only valid on http nodes.

**integration** — required: `connection` (bare identifier naming a `connection` block), and exactly one of `action:` (bare identifier naming a top-level `action` block; preferred — transport and schemas come from the block at deploy) or `path` (provider API path; untyped). Other fields: `method` (`GET`/`POST`/…, default `GET`; forbidden when `action:` is set), `params` (@ts returning object). Fabric OAuth + provider proxy; requires `FABRIC_URL` at runtime. Never `auth:`.

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

**disk** — required: `disk` (bare identifier naming a top-level `disk <name> { }` block), `command` (@ts block, `@ts "file.ts.swirls"`, or string literal shell command). Backed by Archil (`ARCHIL_API_KEY`). No user `schema:` — vendor-managed output shape (`stdout`, `stderr`, `exitCode`, `timing`). Plain strings run directly as shell; `@ts` runs in the sandbox with `context`. See `node-disk` and `resource-disk`.

**agent** — required: `agent` (bare identifier naming a top-level `agent <name> { }` block), `prompt` (@ts). Optional: `profile` (bare identifier naming a profile inside the agent block), `tools` (array of bare identifiers narrowing within the effective tool set), `system` (@ts; per-call system-prompt override), `schema` (structured-output constraint; use `schema`, never `outputSchema`). See `node-agent` and `resource-agent`.

**postgres** (node) — required: `postgres` (bare identifier naming a top-level `postgres <name> { }` block) and exactly one of `select:` (@sql SELECT or WITH) or `insert:` (@sql INSERT, optionally with ON CONFLICT). Other fields: `params` (@ts returning an object whose keys match `{{key}}` placeholders in the SQL; required when SQL has placeholders, always required for `insert:`), `condition` (@ts returning boolean; only valid on `insert:` nodes), `schema` (recommended for `select:` to type the row output).

#### Shared optional fields on every node

- `label` — display string. Defaults to the node name (or `"root"` for root).
- `description` — longer descriptive string.
- `secrets` — object literal: `{ blockName: [VAR1, VAR2], otherBlock: [VAR3] }`. The block name must be a declared top-level `secret` block and each var must appear in that block's `vars` list. Accessed at runtime as `context.secrets.blockName.VAR1`.
- `review` — either `review: true` or `review: { enabled, title, description, content, schema, actions, approvedOutput, rejectedOutput }`. See `review-config`.
- `failurePolicy` (optional) — `{ strategy: "fail" | "retry" | "skip" | "fallback", maxRetries, backoffMs, fallbackValue }`.
- `format` — presentation format for the node's output, a bare identifier: `markdown`, `html`, `text`, `image`, `video`, `audio`, `mixed`, or `json`. The validator checks the declared output schema is compatible (top-level string, a `{ markdown | html | text | url }` string property, or a `contentMediaType` hint; `json`/`mixed` always pass).

#### Schema reference syntax (bare identifier)

`inputSchema:`, `outputSchema:`, `schema:` (on form/webhook/node), and `review: { schema: ... }` accept either:

- An inline `@json { ... }` block.
- An object literal: `{ "type": "object", ... }`.
- A bare identifier naming a top-level `schema <name> { }` block: `inputSchema: contact_payload`.

The bare-identifier form requires a matching `schema <name> { }` declaration somewhere in the workspace. See `resource-schema`.

Placement is strict: `inputSchema` and `outputSchema` belong on **root blocks only**; non-root nodes use `schema`. A `schema:` key on a **root** block is not recognized — the parser cannot consume its `@json` value and emits an `Unexpected token` error, dropping the rest of the root config. Use `outputSchema` on root.

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

#### 2. Using `type: resend` instead of `type: email`

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

#### 3. Using `type: firecrawl` instead of `type: scrape`

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

#### 8. Using variables or assignments at DSL level

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

Code nodes are sandboxed. No `fetch`, `import`, `require`, `fs`, or `process.env`. Use `http` nodes for API calls, `ai` nodes for LLM calls, `email` nodes for email, `scrape` for web scraping, `parallel` for multi-query research, `agent` for agentic loops with tools, `disk` for filesystem exec.

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

There are exactly 17 node types: `agent`, `ai`, `bucket`, `code`, `disk`, `email`, `http`, `integration`, `map`, `parallel`, `postgres`, `scrape`, `stream`, `switch`, `wait`, `while`, `workflow`. (`graph` is a legacy alias for `workflow`.) Simple data transformation belongs in `code` nodes; per-item iteration belongs in `map` nodes; counter/condition loops belong in `while` nodes; Parallel.ai web research belongs in `parallel` nodes — not workflow concurrency.

#### 11b. Using `type: parallel` for workflow concurrency

**Incorrect (treating parallel as fan-out):**

```swirls
node run_steps {
  type: parallel
  label: "Run all steps"
}
```

`parallel` is the Parallel.ai vendor node (`operation: search`, `extract`, or `findall`). It does not fan out workflow steps or run DAG branches concurrently.

**Correct (per-item iteration with optional concurrency):**

```swirls
node per_item {
  type: map
  label: "Process each"
  items: @ts { return context.nodes.root.output.items }
  maxItems: 100
  concurrency: 4
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

#### 12. Missing label on workflow or node

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

#### 13. Edges outside of flow block

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
  version: v1
  filter: @ts {
    return {
      score: { gte: 50 }
    }
  }
}
```

Stream nodes reference a stream block by bare identifier (not a string), pin a `version:` (a `versions:` key on that stream), and filter with an `@ts` block returning a `StreamFilter` object.

#### 19. Declaring `agent:` trigger

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

#### 20. Trigger binding with separate fields

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

#### 22. Referencing a workflow or stream as a string on a node

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

Resource names match `^[a-zA-Z0-9_]+$`. No hyphens, dots, spaces, or other special characters. This applies to every name: forms, webhooks, schedules, workflows, streams, triggers, secrets, auths, postgres blocks, schemas, nodes, secret vars, switch cases, and review action ids.

#### 24. Quoting the `visibility` value (or dropping its colon) on a form

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

#### 25. Webhook with no auth (silently accepts any request)

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

#### 26. Using `subgraph:` with a colon

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

#### 27. Map / while node with both `subgraph { }` and `workflow:`

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

#### 28. Map / while subgraph root without `inputSchema`

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

#### 29. Forgetting `maxItems` / `maxIterations`

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

#### 30. Setting `schema:` on a vendor-managed node type

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

#### 31. Using `kind: text` with a `schema:` on an AI node

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

#### 32. Ignoring a top-level `schema` block by inlining the same JSON repeatedly

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

#### 33. Using `schema:` on a root block

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

#### 34. Agent `team` that references itself or forms a cycle

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

---

### Intent to Primitive Map

Before writing syntax, map the user's request to primitives. The eighteen top-level blocks organize into five categories; pick blocks by category, then look up exact syntax in the other rules.

| Category | Blocks | One-line job |
|---|---|---|
| Agents | `agent`, `channel` | Actors that reason; channels bind them to chat surfaces |
| Workflows | `workflow`, `trigger`, `form`, `webhook`, `schedule`, `schema` | Deterministic procedures and what starts them |
| Memory | `stream`, `view`, `disk`, `postgres` | Structured output, spreadsheet views over it, files, the user's existing database |
| Connections | `secret`, `auth`, `connection`, `action` | Outbound credentials (least-managed to most-managed) and typed integration operations |
| Access | `role`, `policy` | Inbound permission: who may invoke agents/workflows |

#### Common intents

| User says | Use |
|---|---|
| "run X every Monday" / "daily report" | `schedule` + `trigger` + `workflow` |
| "when someone submits the form" | `form` + `trigger` + `workflow` |
| "when service Y calls us" / "on event" | `webhook` + `trigger` + `workflow` |
| "for each item" / "until done" / run the same step over many items concurrently | `map` / `while` node (inline `subgraph { }` or `workflow:` ref; `map` accepts `concurrency:`) |
| "research the web with AI" / "multi-query search" / "find entities online" | `parallel` node (Parallel.ai API — not for workflow parallelism) |
| "needs human approval first" | `review: { enabled: true }` on the node |
| "summarize / classify / extract with AI" | `ai` node (single call, typed output) |
| "an assistant that can decide / multi-step reasoning" | `agent` block + `agent` node |
| "answer in Slack / Linear / Discord / our site" | `channel` block bound to the agent (+ `connection` for the platform) |
| "restrict the agent's tools for this step" | `profile` inside the agent block, selected via `profile:` on the node |
| "save the results / reuse output later" | top-level `stream` block + `type: stream` reader node |
| "see the data as a spreadsheet / table" | top-level `view` block over the stream(s) |
| "a column that runs AI / a graph for each row" | `computed { }` column in a `view` block |
| "shared files / give the agent a workspace" | `disk` block + `type: disk` nodes |
| "query/update our database" | `postgres` block + `type: postgres` nodes |
| "call an API with our key" | `secret` + `auth` + `http` node |
| "post to Slack/Linear/Discord/LinkedIn/Microsoft without keys" | `connection` block + `http` node `connection:` |
| "send an email" | `email` node |
| "scrape a page" | `scrape` node |
| "only team X can use agent Y" / "map our org chart" | `role` blocks + `policy` grants (grants flip the project to deny-by-default) |
| "call paid external capabilities / API marketplace" | optional `wallet: { }` on an `agent` block (enables Zero tools) |
| "password-protect the form" | `basic` auth block + form `auth:` |
| "verify webhook callers" | webhook `secret:` + `header:` |

#### Disambiguations the map encodes

- Fuzzy task → `agent`; exact repeatable procedure → `workflow`. Agents call workflows as tools, so "an assistant that follows our process" is both.
- One LLM call with a typed answer → `ai` node; multi-step reasoning with tools → `agent`.
- Outbound credentials (`secret`/`auth`/`connection`) are not inbound permission (`role`/`policy`). "Connect to Slack" is a connection; "only support can use the Slack bot" is access.
- Structured reusable output → `stream`; a spreadsheet over that output (with per-row computed columns) → `view`; files → `disk`; the user's own data → `postgres`.
- `role` (top-level, who may invoke) is not `profile` (inside `agent`, what it may do).
- `parallel` node is Parallel.ai web research (`search`, `extract`, `findall`), not workflow concurrency. Use `map`/`while` for iteration; independent branches in a DAG are just multiple edges from one node in `flow { }`.


# 2. File Structure

### Top-Level Declarations

A `.swirls` file contains eighteen kinds of top-level declarations (plus the optional `version:` line), in any order. There are no imports, exports, or module syntax.

**Incorrect (using unsupported syntax):**

```swirls
import { helper } from "./utils.swirls"

export workflow my_workflow {
  // ...
}
```

The parser errors: `Unexpected token: expected form, webhook, schedule, graph, workflow, stream, view, trigger, secret, auth, connection, action, postgres, disk, agent, channel, schema, role, or policy`.

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

trigger on_contact {
  form:contact -> process
  enabled: true
}

agent concierge {
  label: "Concierge"
  secrets: vendor_keys
  provider: openrouter
  model: "openai/gpt-4o-mini"
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

role admins {
  match {
    org_role: admin
  }
}

policy {
  allow admins -> agent concierge
}
```

#### The eighteen valid top-level blocks

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
- `postgres <name> { }` — External PostgreSQL connection and table schemas. See `resource-postgres`.
- `disk <name> { }` — Archil-backed remote disk mount; `type: disk` nodes bind to it and run bash. See `resource-disk`.
- `agent <name> { }` — LLM agent definition (provider, model, tools, profiles, subagent `team`); `type: agent` nodes bind to it. See `resource-agent`.
- `channel <name> { }` — Binds an agent to a chat platform (Slack, Linear, Discord, web) so it answers messages there. See `resource-channel`.
- `connection <name> { }` — Project-scoped, Swirls-brokered outbound OAuth slot (`provider:` slack/linear/discord/linkedin/microsoft); referenced by `http` nodes and channels via `connection:`. See `resource-connection`.
- `action <name> { }` — Typed integration operation (provider/method/path) referenced by `type: integration` nodes via `action:`. See `resource-action`.
- `role <name> { }` — Derives a named role from verified principal attributes via `match { }`. See `resource-access-control`.
- `policy { }` — Nameless; `allow|deny <role> -> agent <name>|*` grants. Declaring a grant flips the project to deny-by-default. See `resource-access-control`.

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

### Comment Syntax

Swirls supports single-line (`//`) and multi-line (`/* */`) comments. Doc comments (`/* */`) placed immediately before a top-level declaration (or a `node`/`root` block) attach to it and are shown on hover in the LSP.

```swirls
/* Normalizes name, email, and message (trim + lowercase email). */
root {
  type: code
  label: "Entry"
  code: @ts { return {} }
}
```

#### Unicode

Comment content may contain any characters — Unicode in `//` or `/* */` comments parses fine:

```swirls
// ──────────────────────────────
// Workflow: get_token → fetch OAuth
// ──────────────────────────────
workflow get_token {
  label: "Get Token"
  root { type: code label: "Entry" code: @ts { return {} } }
}
```

The hazard is Unicode (or any unrecognized character) **outside** comments, strings, and fenced blocks — at DSL token positions the lexer stops on it and silently drops the rest of the file. See `parser-illegal-characters`.

#### Doc comments are preserved

`/* ... */` block comments immediately before a top-level declaration attach to it as a doc comment and are preserved by the serializer. `//` line comments are skipped by the lexer and not preserved.


# 3. Workflow & Node Basics

### Workflow Anatomy

A workflow is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, exactly one root node, zero or more additional nodes, and an optional `flow { }` block.

**Incorrect (missing root):**

```swirls
workflow my_workflow {
  label: "My Workflow"
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

Every workflow must declare exactly one `root { }` block.

**Correct (complete workflow structure):**

```swirls
workflow my_workflow {
  label: "My Workflow"
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

#### Valid top-level keys inside `workflow { }`

| Key | Required | Notes |
|-----|----------|-------|
| `label:` | implicit required | Display string. Defaults to the workflow name if omitted. |
| `description:` | no | Free-form. |
| `root { }` | yes | Exactly one; the entry node. Uses `root { }` syntax, not `node root { }`. |
| `node <name> { }` | no | Zero or more additional nodes. |
| `flow { }` | no (required if there are edges) | Contains edge declarations. |

#### Constructs that are NOT valid inside `workflow { }`

- `persistence { }` — removed. The parser errors with a migration message. Use a top-level `stream { }` block instead. See `stream-persistence-block` and `resource-stream`.
- Edge lines at workflow scope (`root -> foo` outside `flow { }`) — parser error: `Edge declarations must be inside a flow { } block`.
- `stream:` at workflow scope (outside a node) — parser error: `"stream:" is only valid inside a node { } block`.
- Bare `type:`, `schema:`, `prompt:` at workflow scope — these only belong inside `root { }` or `node { }` bodies.

#### Persistence

To persist a workflow's output, add a **top-level** `stream <name> { }` block that names the workflow. Do not put persistence inside the workflow. See `resource-stream`.

```swirls
workflow my_workflow { ... }

stream my_workflow_log {
  workflow: my_workflow
  version: v1
  versions: {
    v1 {
      schema: @json { ... }
      prepare: @ts { return { ... } }
    }
  }
}
```

---

### Root Node Requirements

Every workflow must have exactly one `root { }` block. The root is the entry point. It receives the trigger payload via `context.nodes.root.input`. It is the only node that should use `inputSchema`.

**Incorrect (using node instead of root for entry):**

```swirls
workflow my_workflow {
  label: "My Workflow"

  node entry {
    type: code
    label: "Entry"
    code: @ts { return {} }
  }
}
```

This fails validation: "Workflow must declare root { } as the entry node."

**Incorrect (multiple root blocks):**

```swirls
workflow my_workflow {
  label: "My Workflow"

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
workflow my_workflow {
  label: "My Workflow"

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
- Exactly one per workflow
- Must have no incoming edges in the flow block
- Only node where `inputSchema` is meaningful (defines trigger payload shape)
- Can be any node type (code, ai, switch, etc.)

**Watch for accidental extra roots.** "Exactly one root" is enforced as "exactly one node with no incoming edge." Any source node you leave parentless — most often a `type: stream` read, but also a `type: parallel` or `type: http` fetch — counts as a second root and fails validation with `Workflow must have exactly one root node, but found N`. When a workflow pulls from several sources (a merge, dedupe, or join), make the single `root { }` an entry node that fans out to each source, then fan the sources back into a downstream node. See `node-stream` for the multi-stream example.

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

Workflows must be directed acyclic graphs (DAGs). The validator enforces no cycles, exactly one root, and valid edge references.

**Incorrect (cycle in edges):**

```swirls
flow {
  root -> step_a
  step_a -> step_b
  step_b -> step_a
}
```

Error: "Workflow contains a cycle - DAG workflows cannot have cycles"

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
workflow pipeline {
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

### Inline `subgraph { }` Block

`map` and `while` nodes can either reference a top-level workflow by name (`workflow: <name>`) or define the iteration body inline as a `subgraph { ... }` block. The inline form is keyword-only — **no colon, no quotes, no value**.

#### Syntax

```swirls
node <name> {
  type: map        // or while
  // ... other map/while fields ...

  subgraph {
    root { ... }
    node child1 { ... }
    node child2 { ... }
    flow {
      root -> child1
      child1 -> child2
    }
  }
}
```

#### Body shape

`subgraph { }` accepts the same inner body as `workflow { }`:

- Exactly one `root { }` block (entry node).
- Zero or more `node <name> { }` blocks.
- Optional `flow { }` block with edges.

But it does **NOT** accept its own `label:` or `description:` at the top level. Both are parser errors:

```
label is not valid inside subgraph { }
description is not valid inside subgraph { }
```

The subgraph runs in the parent workflow's namespace; it does not have a separate name or display label.

#### Required: `inputSchema` on the root

The subgraph root **must** declare `inputSchema`. This is required so the iteration item (for `map`) or per-iteration input (for `while`) is typed. The validator emits:

```
map/while subgraph root must declare inputSchema for typed iteration
```

`inputSchema` accepts inline `@json { }`, an inline object literal, or a bare top-level schema name.

#### Example (map): multi-node subgraph

```swirls
node per_ticket {
  type: map
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100
  concurrency: 2

  subgraph {
    root {
      type: code
      label: "Normalize"
      inputSchema: support_ticket_item
      code: @ts {
        const item = context.iteration.item
        return { id: item.id, body: item.body.trim() }
      }
    }

    node triage {
      type: code
      schema: @json { ... }
      code: @ts { return { priority: 1 } }
    }

    node handoff {
      type: code
      schema: @json { ... }
      code: @ts {
        return {
          ticketId: context.nodes.root.output.id,
          priority: context.nodes.triage.output.priority,
        }
      }
    }

    flow {
      root -> triage
      triage -> handoff
    }
  }
}
```

#### Example (while): two-node subgraph

```swirls
node refine_digest {
  type: while
  input: @ts { return { draft: context.nodes.merge.output.draft } }
  condition: @ts { return context.iteration.index < 3 }
  update: @ts {
    return { draft: context.iteration.previous?.polish?.text ?? context.iteration.input.draft }
  }
  maxIterations: 5

  subgraph {
    root {
      type: code
      inputSchema: digest_draft
      code: @ts { return { blob: context.iteration.input.draft } }
    }

    node polish {
      type: code
      schema: @json { ... }
      code: @ts { return { text: context.nodes.root.output.blob.trim() } }
    }

    flow { root -> polish }
  }
}
```

#### Inline subgraph vs. referenced workflow

Pick one based on reuse:

- **Inline `subgraph { }`** — The iteration body is single-purpose and lives next to the loop. Easier to read top-to-bottom.
- **`workflow: <name>`** — The same body is used elsewhere too, or the body is large enough to want its own file/section. The referenced workflow's root must still declare `inputSchema`.

The validator rejects both-set and neither-set:

```
map node requires exactly one of subgraph { } or workflow: <name>
while node requires exactly one of subgraph { } or workflow: <name>
```

#### DAG rules apply

The subgraph is a DAG: exactly one root (the `root { }` block), no cycles, every edge target must be a declared node. The validator runs `dagValidation` on it just like any top-level workflow.

#### Edges live in `flow { }`

Edges inside a subgraph go in a `flow { }` block, same as a top-level workflow:

```swirls
subgraph {
  root { ... }
  node next { ... }
  flow { root -> next }   // OK
}
```

`root -> next` outside `flow { }` is a parser error: `Edge declarations must be inside a flow { } block`.

#### Iteration context

The subgraph (or referenced workflow) sees `context.iteration.*` instead of just `context.nodes.root.input`. See `context-iteration`.


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

If you need network access, use an `http` node. If you need AI, use an `ai` node. If you need to send email, use an `email` node. If you need to scrape a page, use a `scrape` node. If you need filesystem exec, use a `disk` node. Break your workflow into multiple nodes with the right types.

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

**Required fields:** `kind` (validator-enforced), plus `model` and `prompt` (required at runtime for a working call).

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

This call fails **at runtime**: `kind: object` needs a `schema` to define the structured output. The validator does NOT catch this for a standalone node — `swirls doctor` passes — so it only surfaces when the node runs. (The schema is validator-enforced in one case: when the AI node is the leaf of an agent-tool workflow, which errors with `Agent tool workflow "<w>" requires output schema on leaf node "<n>"`.) Always set a `schema` on `kind: object`.

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

**Validator warning** when `kind: text` and `schema:` are both set: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` Either drop the schema or change `kind` to `object`.

When an AI node is the **leaf of a workflow used as an agent tool**, you do **not** need to add a schema to satisfy the tool's output-schema contract. Any `kind` other than `object` (`text`, `embed`, `image`, `video`) has an inferred output shape and is exempt from that requirement, so a bare `kind: text` leaf is valid. Adding `schema: @json { { "type": "string" } }` to force it would only trip the warning above. See `resource-agent`.

AI node fields:
| Field | Required | Type |
|-------|----------|------|
| `kind` | yes | text, object, image, video, embed. Invalid values error: `Invalid ai kind "<k>". Must be one of: text, object, image, video, embed` |
| `model` | runtime | String (provider/model format) |
| `prompt` | runtime | `@ts` block |
| `provider` | no | Bare identifier: `openrouter` (default), `anthropic`, `openai`, `google`. Invalid values error: `Invalid ai provider "<p>". Must be one of: openrouter, anthropic, openai, google` |
| `schema` | required for object | `@json` block |
| `temperature` | no | Number (0-1) |
| `maxTokens` | no | Number |
| `options` | no | Object (kind-specific, e.g. n, size) |

AI nodes resolve their vendor key from `provider:` (`OPENROUTER_API_KEY` by default; `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` otherwise). You do not need to declare it in `secrets:`.

---

### Agent Nodes

Agent nodes run an LLM agentic harness defined by a top-level `agent` block. The agent block declares provider, model, secret keys, default system prompt, runtime knobs, optional sandbox sizing, and the workflows exposed as LLM-callable tools. The agent node binds to that block, supplies a `prompt`, and optionally selects a `profile`, narrows `tools`, overrides `system`, or constrains structured output with `schema`.

Use `agent` when you need tools, a persistent workspace (read/write/edit/bash/grep/find/ls), multi-step reasoning, or chat. For a one-shot LLM call with no tools and no multi-step work, use `ai` instead.

**Required fields:** `agent` (bare identifier naming a top-level `agent <name> { }` block), `prompt` (`@ts` block or file ref).

#### Incorrect (missing required fields)

```swirls
node ask {
  type: agent
  prompt: @ts { return "Hi" }
}
```

The validator errors: `Node type "agent" requires "agent"`. The node must reference a declared `agent` block by name.

#### Incorrect (`outputSchema` on a node is a hard parse error)

```swirls
node ask {
  type: agent
  agent: triage
  prompt: @ts { return "Hi" }
  outputSchema: @json { { "type": "object" } }
}
```

Parse error: `Use "schema" instead of "outputSchema" in node blocks`. Structured output on a node uses `schema:`, never `outputSchema:`. (`outputSchema` is root-only and belongs on workflow roots, not nodes.)

#### Correct (minimal agent node)

```swirls
secret ai_creds {
  vars: [OPENAI_API_KEY]
}

agent triage {
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
  maxSteps: 5
  tools: [search_kb, escalate]
}

workflow handle {
  label: "Handle inbound"
  root {
    type: agent
    label: "Triage"
    agent: triage
    prompt: @ts {
      return "Triage this ticket: " + context.nodes.root.input.body
    }
  }
}
```

#### Correct (profile, narrowed tools, structured output)

```swirls
node ask {
  type: agent
  label: "Ask with profile"
  agent: triage
  profile: support
  tools: [search_kb]
  system: @ts {
    return "You are a senior support engineer. Be concise."
  }
  prompt: @ts {
    return context.nodes.root.input.question
  }
  schema: @json {
    {
      "type": "object",
      "required": ["answer"],
      "properties": { "answer": { "type": "string" } }
    }
  }
}
```

`profile:` must name a `profile <name> { }` declared inside the bound `agent` block. `system:` overrides the agent's default system prompt for this call only. `schema:` constrains the final structured output; without it the turn returns the plain completion string.

#### System-prompt precedence

System prompt pieces apply low to high: agent `system` (lowest) -> profile `system` (if a profile is chosen) -> node `system` (highest, wins last for final instructions).

#### Tools (workflows-as-tools only)

Tools are workflows exposed to the LLM. There is no MCP, HTTP, or builtin tool syntax. Each tool workflow must have a non-empty workflow-level `description`, a root-node `inputSchema`, and an output schema on every leaf node. An AI leaf with `kind` other than `object` is exempt — its output shape is inferred from the kind. See `resource-agent` for the tool-workflow contract.

Node `tools:` may only narrow within the effective set: the profile's tools when a profile is chosen and declares `tools:`, otherwise the agent block's `tools:`. It cannot add tools beyond that set.

If the agent block declares a subagent `team:`, each team member is also exposed to the model as a callable tool (delegated to as its own agent). See `resource-agent` for the team contract.

#### Execution shape

A turn runs a tool-call loop capped by the agent's `maxSteps` (default **20**, not 10). Built-in workspace tools (read, write, edit, bash, grep, find, ls) run inside a persistent, per-agent sandbox. Sandbox provisioning is lazy: chat-only turns that never call a tool never start one. Workspace files persist across turns for the same agent. Each subgraph named in the effective `tools:` is exposed to the model using its workflow `description` (tool help text) and root `inputSchema` (call arguments). Tool results are the subgraph's leaf outputs.

#### Persistent chat

Multi-turn chat is not authored in the DSL. Start a persistent transcript with `swirls chat start <agent_name>`; the platform stores history (Postgres) and threads each turn's messages back into the agent. The agent's workspace files persist across turns of the same chat.

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `agent` | yes | Bare identifier | Names a top-level `agent <name> { }` block. |
| `prompt` | yes | `@ts` block or file ref | User prompt for this turn. |
| `profile` | no | Bare identifier | Names a `profile` declared inside the bound agent block. |
| `tools` | no | Array of bare identifiers | Narrows within the effective tool set (profile tools if a profile is chosen and declares tools, else agent tools). |
| `system` | no | `@ts` block | Overrides the agent block's default `system:` for this call (highest precedence). |
| `schema` | no | `@json` block, named ref, or inline object | Constrains structured final output. Never `outputSchema`. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply.

See `resource-agent` for the agent block declaration.

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

Declare the vars your node needs in a top-level `secret` block, then reference that block in the node's `secrets:` map. HTTP nodes also support an `auth:` field that references a top-level `auth` block for OAuth, API key, basic, or bearer authentication. For a Swirls-brokered OAuth grant (Slack, Linear, ...), use `connection:` referencing a top-level `connection` block instead. Set **either** `auth` **or** `connection` on a node, never both. See `resource-secrets`, `resource-auth`, and `resource-connection` rules.

**Note:** Do not use HTTP nodes to call AI/LLM APIs directly. Use `ai` nodes instead — they handle model routing, authentication, and response parsing automatically.

**Warning:** Do not use `headers` as a plain object literal with hyphenated keys like `Content-Type`. Unquoted, the stray `-` stops the lexer and silently drops the rest of the file; quoted, the key is rejected and the headers object parses empty. Always use a `@ts` block for headers so keys are JavaScript strings. See the parser-hyphenated-headers and ts-no-nested-code-blocks rules.

HTTP node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `method` | no | "GET", "POST", "PUT", "DELETE", "PATCH" (default: "GET") |
| `headers` | no | `@ts` block returning an object (use string keys for hyphenated names) |
| `body` | no | `@ts` block |
| `auth` | no | bare identifier naming a top-level `auth` block (mutually exclusive with `connection`) |
| `connection` | no | bare identifier naming a top-level `connection` block (mutually exclusive with `auth`) |
| `schema` | no | `@json` block (use `outputSchema` only on root nodes) |

#### Output shape

`context.nodes.<n>.output` is the **parsed response body directly** — the JSON value if the body parses as JSON, otherwise the raw text string. There is **no `{ status, headers, body }` envelope**: do not read `output.status` or `output.body`. The HTTP status, statusText, content-type, and duration are on a separate `context.nodes.<n>.meta`, not on `output`.

```swirls
node read_api {
  type: ai
  label: "Use the response"
  kind: object
  schema: @json { { "type": "object", "properties": { "ok": { "type": "boolean" } } } }
  prompt: @ts {
    // The fetched JSON body is the node output itself, not output.body.
    const body = context.nodes.call_api.output
    return "Summarize: " + JSON.stringify(body).slice(0, 4000)
  }
}
```

#### Runtime limits (not validated, they bite at execution)

- **30-second timeout** per request — a long poll past 30s fails with `HTTP request timeout (30s)`. For slow upstreams, poll in shorter calls rather than one long request.
- **Internal/private addresses are blocked** (SSRF guard), re-checked on every redirect. You cannot call a private/internal host from an http node.
- At most **5 redirects** are followed, and the `Authorization` header is stripped on cross-origin redirects.

---

### Email Nodes

Email nodes send transactional email. The DSL type name is `email`. Resend is the underlying vendor (`RESEND_API_KEY`). Every email node requires `from`, `to`, and `subject`.

**Required fields:** `from`, `to`, `subject`.

**Vendor-managed output:** Do not set `schema:` on an email node. The validator errors: `"email" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

#### Incorrect (wrong type name)

```swirls
node notify {
  type: resend
  label: "Notify"
  from: @ts { return "noreply@example.com" }
  to: @ts { return "team@example.com" }
  subject: @ts { return "Alert" }
}
```

`resend` is not a valid node type. Resend is the underlying vendor; the DSL type name is `email`. The validator errors: `Invalid node type "resend". Must be one of: agent, ai, bucket, code, disk, email, http, integration, map, parallel, postgres, scrape, stream, switch, wait, while, workflow`.

#### Correct (complete email node)

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

#### Correct (HTML body)

```swirls
node welcome {
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

### Scrape Nodes

Scrape nodes fetch and extract content from web pages. The DSL type name is `scrape`. Firecrawl is the underlying vendor (`FIRECRAWL_API_KEY`).

**Required fields:** `url`.

**Vendor-managed output:** Do not set `schema:` on a scrape node. The validator errors: `"scrape" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

#### Incorrect (wrong type name)

```swirls
node fetch {
  type: firecrawl
  url: @ts { return "https://example.com" }
}
```

`firecrawl` is not a valid node type. Firecrawl is the underlying vendor; the DSL type name is `scrape`. Use `scrape`.

#### Correct (basic scrape)

```swirls
node scrape_page {
  type: scrape
  label: "Scrape webpage"
  url: @ts { return context.nodes.root.input.url }
}
```

#### Correct (options)

```swirls
node scrape_article {
  type: scrape
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

Parallel nodes call the [Parallel.ai](https://parallel.ai) API for AI-powered web research. The `operation` field selects one of three modes with different required fields. The response shape is **vendor-managed** — do not set `schema:` on a parallel node; the validator errors if you do.

Despite the name, `type: parallel` is **not** for running workflow steps concurrently. Use `map` (with optional `concurrency:`) or `while` for per-item or repeat-until work. Independent branches in a DAG need no special node — declare multiple edges from the same source in `flow { }`.

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

- The `parallel` node type is for Parallel.ai web research only — not workflow parallelism. There is no `fanout` or `workers` node type; use `map` for per-item iteration.
- `schema` is vendor-managed — setting it emits: `"parallel" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`
- `generator` for `findall` selects the compute tier; `core` is the usual default, `pro`/`preview` for larger / newer models.
- `matchLimit` must be in the API's supported range (5–1000).
- `PARALLEL_API_KEY` is resolved by the runtime; do not declare it in `secrets:`.

---

### Stream Nodes

A `type: stream` node **reads** from a top-level `stream { }` block. It is the read side of Swirls' workflow-to-workflow communication. The node's output is an array of previously persisted records matching the filter, read from one **pinned version** of the stream.

**Required fields:** `stream` (bare identifier naming a top-level stream block in the same project), `version` (the `versions:` key to read, e.g. `v1`), and `filter` (@ts returning a `StreamFilter` object).

**Not valid (removed from schema):** `streamId`, `query`, `querySql`. Using any of them produces a validator error.

#### Syntax

```swirls
<node_name> {
  type: stream
  stream: <stream_block_name>
  version: <version_id>
  filter: @ts {
    return {
      <field>: { <op>: <value> },
      ...
    }
  }
}
```

`<version_id>` matches `^v[1-9][0-9]*$` (`v1`, `v2`, …) and MUST name a `versions:` entry declared on the referenced stream block.

#### Example

```swirls
node recent_high_scorers {
  type: stream
  label: "Recent high-scoring leads"
  stream: scored_leads
  version: v1
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

- **System columns:** `id`, `created_at`, `deployment_id`, `workflow_execution_id` — mapped to direct column comparisons on the version table.
- **Payload fields:** anything else — the fields your `prepare` returned for this version, mapped to the matching column.

You do not need to distinguish; the runtime infers it.

#### Node output

The node's output is `SchemaShape[]` — an array of records matching the **pinned version's** `schema`. Zero matches is not an error. Downstream nodes see it as `context.nodes.<stream_node>.output`.

When `versions[<version>].schema` resolves, the LSP types `context.nodes.<stream_node>.output` as the matching TypeScript array. If the version has no schema or the reference is missing, the LSP types it as `unknown[]`.

#### Reading multiple streams in one workflow

A `type: stream` node has **no incoming edge**, so it is a root candidate. A workflow that reads several streams (a merge, dedupe, or join) therefore needs one real `root { }` that fans out to each stream node. Leave the stream nodes parentless and every one of them counts as a root — validation fails with `Workflow must have exactly one root node, but found N`.

Drive the reads from a single entry node, then fan them back into a merge:

```swirls
workflow merge_sources {
  label: "Merge investor sources"

  root {
    type: code
    label: "Start"
    code: @ts { return { runAt: new Date().toISOString() } }
  }

  node from_search {
    type: stream
    stream: investors_search
    version: v1
    filter: @ts { return {} }
  }

  node from_findall {
    type: stream
    stream: investors_findall
    version: v1
    filter: @ts { return {} }
  }

  node merge {
    type: code
    label: "Dedupe across sources"
    code: @ts {
      // Each stream node returns ALL matching rows (newest first), not one record.
      const sources = [
        context.nodes.from_search.output,
        context.nodes.from_findall.output,
      ]
      const out = []
      for (const rows of sources) {
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          // If your writer persists one batch row per run (a row holding an
          // array), flatten that array here; otherwise use the row directly.
          out.push(row)
        }
      }
      return { count: out.length, merged: out }
    }
  }

  flow {
    root -> from_search
    root -> from_findall
    from_search -> merge
    from_findall -> merge
  }
}
```

(`investors_search` and `investors_findall` are top-level `stream { }` blocks declared elsewhere in the workspace — declare them, or this workflow errors with `Stream node references stream block "..." which is not defined`.)

Two things bite agents here:

- **Every stream read is a root candidate.** Fan out from one `root { }`; never leave a stream node parentless.
- **A stream node returns an array of rows, not one record.** Reads come back newest-first (`created_at DESC`). If each run persisted a batch (one row holding an array), iterate rows and flatten. To read just the most recent set, take the first non-empty row.

#### Pagination and sorting

Not implemented yet. All queries return all matching rows ordered by `created_at DESC` (newest first). Pagination / sort will be added as optional fields later.

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `stream` | yes | bare identifier | Must match a top-level `stream <name> { }` block. |
| `version` | yes | `v1`, `v2`, … | Must name a `versions:` entry on the referenced stream block. |
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

**Incorrect (missing `version`):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  filter: @ts { return {} }
}
```

`version` is required on every `type: stream` node — there is no implicit default. Pin it: `version: v1`.

**Incorrect (referencing an undefined stream block):**

```swirls
node recent {
  type: stream
  stream: undefined_stream
  version: v1
  filter: @ts { return {} }
}
```

Error: `Stream node references stream block "undefined_stream" which is not defined`.

**Incorrect (pinning a version the stream does not declare):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  version: v9
  filter: @ts { return {} }
}
```

Error: `Stream node pins version "v9" but stream "scored_leads" does not declare that version under versions { }`. An invalid id (e.g. `version: latest`) errors with `Stream node "version" must be a valid stream version id (e.g. v1), got "latest"`.

**Incorrect (empty filter):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  version: v1
  filter: @ts { }
}
```

Error: `Stream node filter must be a non-empty @ts block`. If you want all rows, return `{}` from the filter: `filter: @ts { return {} }`.

See `resource-stream` for the write side (top-level `stream { }` block declaration).

---

### Workflow Nodes (Subworkflows)

`type: workflow` nodes call another workflow as a subworkflow. The child workflow runs independently with the provided input, and its leaf node outputs become available to downstream nodes. (`type: graph` is a legacy alias for `type: workflow`, and the `graph:` reference field is a legacy alias for `workflow:`. Both are normalized to the `workflow` forms.)

**Required fields:** `workflow`, `input`

**Incorrect (missing input):**

```swirls
node run_helper {
  type: workflow
  label: "Run helper"
  workflow: helper_workflow
}
```

Error: `Node type "workflow" requires "input"`

**Cross-file references resolve across the workspace:**

```swirls
// helper.swirls defines helper_workflow
// main.swirls references it
node run_helper {
  type: workflow
  label: "Run helper"
  workflow: helper_workflow
  input: @ts { return context.nodes.root.input }
}
```

`swirls doctor` and deploy build a workspace index of every `.swirls` file under the working directory, so a workflow declared in another file resolves. `Workflow node references workflow "<n>" which is not defined` fires only when the name matches no workflow anywhere in the workspace (single-file tools without a workspace index may also report it until the full workspace is considered).

**Correct (child workflow in the same file):**

```swirls
workflow helper_workflow {
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

workflow main_workflow {
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
    type: workflow
    label: "Run helper"
    workflow: helper_workflow
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

Subworkflow output is accessed as `context.nodes.<workflowNodeName>.output.<leafNodeName>`. The leaf node names come from the child workflow — the node(s) with no outgoing edges, **not** the literal string `output`, and usually **not** `root`.

The example child above is a single node, so its only leaf is `root` and the parent reads `context.nodes.run_helper.output.root`. A real child ends elsewhere: a child whose last node is `node pack { ... }` is read as `context.nodes.run_helper.output.pack`. If a child has several leaves (parallel branches that never rejoin), each leaf is its own key under `.output`. Look at the child's `flow { }` to find the leaf name before reading it.

Workflow node fields:
| Field | Required | Type |
|-------|----------|------|
| `workflow` | yes | Workflow name (resolved across the workspace). Legacy alias: `graph`. |
| `input` | yes | `@ts` block |

#### Related: map / while inline subgraphs

`type: workflow` runs the child workflow **once**. For per-item iteration over a list, use `type: map` (each item runs the child once). For repeated execution until a condition is false, use `type: while`. Both accept either `workflow: <name>` (the same kind of reference shown above) or an inline `subgraph { ... }` block (no colon) — see `node-map`, `node-while`, and `workflow-subgraph`.

---

### Map Nodes

A `map` node iterates over an array and runs a child workflow (inline `subgraph { }` or referenced `workflow: <name>`) once per element. Output is an array of the child workflow's leaf-node outputs in the same order as `items`.

#### Required fields

- `items` — `@ts` block returning an array. Each element becomes the iteration item.
- `maxItems` — positive number. Hard cap; the validator rejects unbounded loops.
- Exactly one of:
  - `subgraph { ... }` — inline child workflow (no colon). The inline form's root must declare `inputSchema`.
  - `workflow: <name>` — bare identifier referencing a top-level workflow in the workspace. That workflow's root must declare `inputSchema`.

#### Optional fields

- `concurrency` — positive integer. How many iterations run in parallel. Defaults to a runtime-chosen value when omitted.
- `label`, `description`, `secrets`, `failurePolicy` — same as any other node.

#### Inline subgraph (typical)

```swirls
node per_ticket {
  type: map
  label: "Process each ticket"
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100
  concurrency: 2

  subgraph {
    root {
      type: code
      label: "Normalize"
      inputSchema: @json {
        {
          "type": "object",
          "required": ["id", "body"],
          "properties": {
            "id":   { "type": "string" },
            "body": { "type": "string" }
          },
          "additionalProperties": false
        }
      }
      code: @ts {
        const item = context.iteration.item
        return { id: item.id, body: item.body.trim() }
      }
    }

    node triage {
      type: code
      label: "Triage"
      schema: @json {
        {
          "type": "object",
          "required": ["priority"],
          "properties": { "priority": { "type": "number" } }
        }
      }
      code: @ts {
        const urgent = /urgent|outage/i.test(context.nodes.root.output.body)
        return { priority: urgent ? 3 : 1 }
      }
    }

    flow { root -> triage }
  }
}
```

#### Referenced workflow

```swirls
workflow normalize_ticket {
  label: "Normalize ticket"
  root {
    type: code
    inputSchema: @json {
      { "type": "object", "required": ["id", "body"], "properties": { "id": { "type": "string" }, "body": { "type": "string" } } }
    }
    code: @ts {
      const item = context.iteration.item
      return { id: item.id, body: item.body.trim() }
    }
  }
}

node per_ticket {
  type: map
  label: "Process each"
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100
  workflow: normalize_ticket
}
```

#### `context.iteration.item`

Inside the subgraph (or referenced workflow), each iteration sees its element on `context.iteration.item`. The shape is whatever the subgraph root's `inputSchema` declares. See `context-iteration`.

#### Output shape

The map node's output is an array of objects keyed by leaf-node name in the child workflow:

```ts
context.nodes.per_ticket.output[i].<leafName>
```

If the child has a single leaf called `triage`:

```swirls
node merge {
  type: code
  code: @ts {
    const rows = context.nodes.per_ticket.output
    return { count: rows.filter(r => r.triage?.priority >= 3).length }
  }
}
```

#### Validator errors

- `Node type "map" requires "items"` — Add `items: @ts { return [...] }`.
- `Node type "map" requires "maxItems"` — Add `maxItems: <number>`.
- `map node requires maxItems as a positive number` — `maxItems` was missing or not positive.
- `map node concurrency must be a positive integer when set` — `concurrency` was zero, negative, or non-integer.
- `map node requires exactly one of subgraph { } or workflow: <name>` — You set both, or neither.
- `Node references workflow "<n>" which is not defined` — `workflow: <n>` does not match any workflow in the workspace.
- `map/while subgraph root must declare inputSchema for typed iteration` — The inline root (or the referenced workflow's root) is missing `inputSchema`.

#### Common mistakes

- **`subgraph: { ... }`** — `subgraph` is a bare block, not a key:value pair. No colon.
- **Both `subgraph { }` and `workflow: <name>`** — Pick one. The validator rejects both-set and neither-set.
- **No `maxItems`** — Unbounded loops are rejected. Pick a real cap.
- **Subgraph root has no `inputSchema`** — Required for typed iteration.
- **Treating output as a flat list of leaf values** — Output is `[{ leafName: leafOutput }, ...]`, not `[leafOutput, ...]`. Index by leaf name.

---

### While Nodes

A `while` node runs a child workflow (inline `subgraph { }` or referenced `workflow: <name>`) repeatedly until `condition` returns false or `maxIterations` is reached. Each iteration receives the previous iteration's output via `update`.

#### Required fields

- `input` — `@ts` block returning the initial loop state object passed into iteration 0.
- `condition` — `@ts` block returning a boolean. Loop continues **while** this is true.
- `update` — `@ts` block returning the next iteration's input. Has access to the previous iteration's output.
- `maxIterations` — positive integer. Hard cap to prevent runaway loops.
- Exactly one of:
  - `subgraph { ... }` — inline child workflow (no colon). The inline form's root must declare `inputSchema`.
  - `workflow: <name>` — bare identifier referencing a top-level workflow in the workspace. That workflow's root must declare `inputSchema`.

#### Inline subgraph

```swirls
node refine_digest {
  type: while
  label: "Iteratively tighten digest"

  input: @ts {
    return { draft: context.nodes.merge_digest.output.draft }
  }

  condition: @ts {
    return context.iteration.index < 2
  }

  update: @ts {
    const nextDraft =
      context.iteration.previous?.polish?.text ??
      context.iteration.input.draft
    return { draft: nextDraft }
  }

  maxIterations: 5

  subgraph {
    root {
      type: code
      label: "Expand"
      inputSchema: @json {
        { "type": "object", "required": ["draft"], "properties": { "draft": { "type": "string" } } }
      }
      code: @ts {
        return { blob: `pass ${context.iteration.index}: ${context.iteration.input.draft}` }
      }
    }

    node polish {
      type: code
      label: "Polish text"
      schema: @json {
        { "type": "object", "required": ["text"], "properties": { "text": { "type": "string" } } }
      }
      code: @ts {
        return { text: context.nodes.root.output.blob.trim() }
      }
    }

    flow { root -> polish }
  }
}
```

#### Iteration context

Inside the subgraph:

- `context.iteration.input` — the input object for **this** iteration (returned by `update` from the previous iteration, or by the outer `input` field on iteration 0).
- `context.iteration.index` — zero-based iteration counter.
- `context.iteration.previous` — the **previous** iteration's leaf outputs (`{ leafName: leafOutput }` shape). `undefined` on iteration 0.

`update` runs **between** iterations and uses the same context to compute the next input. See `context-iteration`.

#### Output shape

The while node's output is an object with `lastOutput`, keyed by the child workflow's leaf-node names:

```ts
context.nodes.refine_digest.output.lastOutput.<leafName>
```

For the example above:

```swirls
node done {
  type: code
  code: @ts {
    return {
      summary: context.nodes.refine_digest.output.lastOutput.polish?.text ?? ""
    }
  }
}
```

#### Loop semantics

`while` is a **do-while (post-check) loop**: the subgraph always runs at least once, then `condition` decides whether to run another iteration. There is no pre-loop condition check.

1. **Iteration 0**: `input` runs; result becomes `context.iteration.input`. The subgraph runs (unconditionally — `condition` has not been consulted yet).
2. After each iteration the engine evaluates **`condition` first** — it sees this iteration's input and its leaf outputs (`context.iteration.previous`). If `condition` is false, the loop stops here and `update` does **not** run. Only if `condition` is true does `update` run to compute the next iteration's `context.iteration.input`.
3. **maxIterations**: even if `condition` keeps returning true, the loop stops at this count (and `condition`/`update` are skipped on that final iteration). The last iteration's leaf outputs become `output.lastOutput`.
4. Because it is post-check, the subgraph runs at least once whenever `maxIterations >= 1` (which the validator requires). To "skip" work, branch inside the subgraph; you cannot make a `while` run zero times.

#### Validator errors

- `Node type "while" requires "input" / "condition" / "update" / "maxIterations"` — Required field missing.
- `while node requires maxIterations as a positive integer` — Must be ≥ 1 and integer.
- `while node requires exactly one of subgraph { } or workflow: <name>` — Pick one.
- `Node references workflow "<n>" which is not defined` — `workflow: <n>` is unknown in the workspace.
- `map/while subgraph root must declare inputSchema for typed iteration` — Add `inputSchema` to the inline root or the referenced workflow's root.

#### Common mistakes

- **Missing `update`** — Without `update`, the next iteration would receive the same input. The validator requires it.
- **Returning the wrong shape from `update`** — `update` must return an object matching the subgraph root's `inputSchema`. Otherwise iteration N+1 fails to type-check.
- **Forgetting `maxIterations`** — Required. Defends against logic errors that would loop forever.
- **Using `context.iteration.previous` on iteration 0** — `previous` is `undefined` on the first iteration. Use `?.` or guard with `context.iteration.index > 0`.
- **Treating `output.lastOutput` as a list** — While runs sequentially; output is the **single** last iteration's leaves, not an array.

---

### Wait Nodes

Wait nodes pause workflow execution for a specified duration.

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
| `secondsFromConfig` | no | `@ts` block returning the wait duration in seconds (dynamic alternative to `amount`/`unit`) |

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

### Disk Nodes

Disk nodes execute bash commands on a platform-managed Archil disk. Every disk node binds to a top-level `disk <name> { }` block by bare identifier and runs one shell command.

**Required fields:** `disk`, `command`.

#### Incorrect (missing required fields)

```swirls
node run_ls {
  type: disk
}
```

The validator errors: `Node type "disk" requires "disk"` and `Node type "disk" requires "command"`.

##### Correct (literal command)

Plain quoted strings run directly as shell — no sandbox. Use this for static commands.

```swirls
disk proj {
  label: "Project disk"
}

workflow audit {
  label: "Audit disk contents"
  root {
    type: disk
    label: "List root"
    disk: proj
    command: "ls -la"
  }
}
```

##### Correct (dynamic command via @ts)

Use `@ts` when the command depends on upstream outputs or `context`.

```swirls
node fetch_report {
  type: disk
  label: "Cat report"
  disk: proj
  command: @ts {
    const id = context.nodes.root.output.reportId
    return "cat reports/" + id + ".md"
  }
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `disk` | yes | Bare identifier | Names a top-level `disk <name> { }` block. |
| `command` | yes | String or `@ts` block | Shell command. Plain strings run as-is; `@ts` runs in the sandbox and must return a command string. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply. Do not set `schema:` — disk nodes have a vendor-managed output envelope (`stdout`, `stderr`, `exitCode`, `timing`).

#### Platform credentials

`ARCHIL_API_KEY` is resolved by the platform at runtime — do not declare it in DSL `secrets:` on disk blocks. See `resource-disk`.

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

- `postgres:` must reference a top-level `postgres` block declared in the workspace (same file or another `.swirls` file).
- `select:` SQL must be a SELECT statement. `insert:` SQL must be INSERT (upsert with ON CONFLICT is allowed).
- `{{key}}` placeholders are replaced with positional `$N` parameters at runtime. Values come from the `params:` return object. No SQL injection is possible.
- Placeholder names do not need to match column names. Each `{{key}}` becomes a positional `$N`, but its value is looked up **by name** from the `params:` return object (`params.key`). So every placeholder name must match a key you return from `params:`, not a column name or position.
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

Any node can declare a `failurePolicy:` to control what the durable DAG engine does when that node's execution throws. Without a policy, the default is `fail` (the whole workflow execution errors).

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
| `fail` | Node failure errors the whole workflow execution (default). |
| `retry` | Re-run the node up to `maxRetries` times, with `backoffMs` between attempts. If still failing, the workflow errors. |
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

### Integration Nodes

Integration nodes call third-party APIs through a project **connection** slot using the Fabric token broker and provider proxy. Bind the slot in Cloud **Connections** (Fabric OAuth). `http` nodes with `connection:` use the same binding store and macaroon path.

**Required fields:** `connection`, and either `action:` (preferred) or `path`

**Incorrect (using fetch in a code node):**

```swirls
node post_slack {
  type: code
  code: @ts {
    const res = await fetch("https://slack.com/api/chat.postMessage", { method: "POST" })
    return await res.json()
  }
}
```

**Incorrect (`auth:` on integration — connection only):**

```swirls
node post_slack {
  type: integration
  auth: my_auth
  path: "/chat.postMessage"
}
```

**Correct (typed action block — preferred):**

```swirls
connection team_slack {
  label: "Team Slack"
  provider: slack
}

action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  input: @json { { "type": "object", "required": ["channel", "text"], "properties": { "channel": { "type": "string" }, "text": { "type": "string" } } } }
  output: @json { { "type": "object", "required": ["ok"], "properties": { "ok": { "type": "boolean" } } } }
}

workflow notify {
  label: "Notify"
  root {
    type: code
    label: "Entry"
    code: @ts { return context.nodes.root.input }
  }
  node post_slack {
    type: integration
    label: "Post to Slack"
    connection: team_slack
    action: slack_post_message
    params: @ts {
      return {
        channel: context.nodes.root.output.channel,
        text: context.nodes.root.output.text,
      }
    }
  }
  flow {
    root -> post_slack
  }
}
```

Install prebuilt actions with `swirls add slack` (writes to `swirls/integrations/` and records `swirls.lock.json`). See `resource-action`.

**Correct (raw path — untyped legacy):**

```swirls
node post_slack {
  type: integration
  label: "Post to Slack"
  connection: team_slack
  method: POST
  path: /chat.postMessage
  params: @ts {
    return {
      channel: context.nodes.root.output.channel,
      text: context.nodes.root.output.text,
    }
  }
}
```

Bind the connection in Cloud **Connections** before running the workflow. The runtime verifies the execution macaroon, loads the Fabric project binding, issues a short-lived access token, and proxies the request via `@swirls/integrations/proxy`.

##### Fields

| Field | Required | Type |
|-------|----------|------|
| `connection` | yes | Bare identifier naming a top-level `connection` block |
| `action` | preferred | Bare identifier naming a top-level `action` block; do not set `method`/`path` on the node |
| `path` | legacy | Provider API path when `action:` is omitted (untyped `params`/output) |
| `method` | no | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` (default: `GET`; only when using raw `path:`) |
| `params` | no | `@ts` block returning a JSON object (request body for POST/PUT/PATCH; query params for GET) |
| `schema` | no | `@json` block to type the proxy response (raw `path:` only; action blocks supply output schema) |

##### vs `http` + `connection:`

| | `type: integration` | `type: http` + `connection:` |
|--|---------------------|------------------------------|
| Backend | Fabric token + provider proxy | Fabric token broker |
| URL | Derived from provider + `path` (or action block) | You set full `url` |
| Auth | `connection:` only | `connection:` or `auth:` |
| Runtime | Requires `FABRIC_URL` on executor | Requires `FABRIC_URL` |

Both node styles share the same Fabric binding store. Prefer `integration` + `action:` for typed provider operations; use `http` + `connection:` when you need full URL control.


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

The `@ts` prefix is used for executable fields throughout the DSL: `code`, `prompt`, `system`, `router`, `from`, `to`, `subject`, `text`, `html`, `replyTo`, `url`, `body`, `headers`, `input`, `path`, `command`, `items`, `condition`, `update`, `filter`, `params`, `objective`, `searchQueries`, `urls`, `matchConditions`, and stream-version `condition` / `prepare`.

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

#### What actually happens (the silent trap)

The sandbox denies I/O by capability — it does not hard-block these APIs, so they fail **quietly** instead of throwing:

- `require(...)` and Node built-ins resolve to **sandbox stubs**, not the real modules. `require("fs")` returns a working-looking `fs` over a **throwaway virtual filesystem**: a write succeeds and then vanishes, and reads never see what you wrote. Nothing throws — the data just disappears.
- `process.env` is an **empty object** (`{}`), not undefined. `process.env.API_KEY` returns `undefined` with no error. Read secrets via `context.secrets.<block>.<VAR>`.
- Network is genuinely unavailable.

So if `fs.writeFileSync` or a `require`-d module appears to "work" but nothing persists, that is expected. Move the work to the right node type (`http`, `stream`, `bucket`, `disk`). Pure-compute globals (`Date`, `Math`, `JSON`, `URL`, `RegExp`, `structuredClone`, etc.) are fully available — do not avoid them.

---

### Safe TypeScript Patterns

The `@ts { }` scanner tracks braces, strings (single, double, template), and comments. Most ordinary TypeScript parses fine. The known hazards are regex literals containing quote characters and unbalanced braces. Use this as a quick reference.

**Always safe:**

```typescript
// Simple string concatenation
return "Hello, " + name + "!"

// Template literals, including nested ones
return `Hello, ${name}!`
return `Summary:\n${items.map(w => `  - ${w}`).join("\n")}`

// Literal $ before interpolation (currency)
return `Total: $${amount.toFixed(2)}`

// Double-quote characters inside strings
return '"' + value + '"'
if (s.includes('"')) { }

// Nullish coalescing, ternaries, spreads
const val = input.field ?? "default"
const label = score > 80 ? "high" : "low"
return { ...context.nodes.root.output, extra: "value" }

// JSON.stringify
return JSON.stringify({ key: value })

// Regex literals WITHOUT quote characters
/\d+/g.test(s)
s.replace(/\s+/g, " ")
```

**Avoid (silently truncates the rest of the file):**

```typescript
// Regex literal containing a quote character — the scanner mistakes it
// for a string boundary and desyncs. See ts-regex-literals.
s.replace(/"/g, '""')
/can't/.test(s)
// Fix: build from strings — new RegExp(String.fromCharCode(34)), or
// use split/join: s.split(String.fromCharCode(34)).join("")
```

**Avoid (parse errors / mangled config):**

```typescript
// Unbalanced braces anywhere in the block — the scanner counts { } depth
// to find the end of @ts { }. A regex or string trick that leaves braces
// unbalanced ends the block early.
```

Strings and comments inside `@ts` are scanned with full escape handling, so `\"`, `\\`, and backticks inside `${ … }` all work. When in doubt about a regex, build it with `new RegExp(...)` from string parts.

---

### Regex Literals With Quote Characters Break @ts Scanning

The `@ts { }` scanner understands TypeScript strings, template literals, and comments — but **not regex literals**. A quote character (`"`, `'`, or `` ` ``) inside a regex literal is mistaken for the start of a string. The scanner then consumes everything until the next matching quote, desyncs, and the rest of the file is **silently dropped** (no error; `swirls doctor` just reports fewer workflows).

**Incorrect (regex containing a double quote):**

```swirls
code: @ts {
  return { r: s.replace(/"/g, '') }
}
```

**Incorrect (regex containing a single quote):**

```swirls
code: @ts {
  return { ok: /can't/.test(s) }
}
```

**Correct (build the pattern from a string, or avoid quote chars in regex):**

```swirls
code: @ts {
  const Q = String.fromCharCode(34)        // the " character
  return { r: s.split(Q).join("") }        // instead of s.replace(/"/g, '')
}
```

```swirls
code: @ts {
  const re = new RegExp("can" + String.fromCharCode(39) + "t")  // ' is charCode 39
  return { ok: re.test(s) }
}
```

#### What is safe

- Regex literals **without** quote characters parse fine: `/\d+/g`, `/^https?:/`, `/a{2,3}/`.
- Quote characters inside **proper strings** are fine: `'"'`, `"it's"`, `` `say "hi"` `` all parse correctly — the scanner tracks string boundaries, including escapes.
- Nested template literals and `$${...}` parse correctly (the scanner brace-balances `${ … }` and recurses into inner backticks).

The only @ts quoting hazard is a quote character inside a regex literal (or any other position the scanner cannot recognize as a string).

When `swirls doctor` reports fewer workflows than you defined with no error output, search your `@ts` blocks for regex literals containing `"`, `'`, or backticks.

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
secret api_creds {
  vars: [API_KEY]
}

node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
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
      query: context.nodes.root.output.query,
      limit: 10
    })
  }
}
```

Rule: a code block (`@ts`, `@json`, `@sql`) is always a leaf — it contains executable code, never other code blocks. If you need to build a structured value, write one `@ts` block that constructs and returns the whole object.


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
| `inputSchema` | **root only** (and map/while subgraph root) | Shape of the incoming payload (trigger or iteration item). Drives `context.nodes.root.input` (or `context.iteration.item` / `context.iteration.input`) typing in the LSP. |
| `outputSchema` | **root only** | Shape of what the root node returns. |
| `schema` | **non-root nodes** (and form / webhook / postgres table / review / top-level `schema` block) | Shape of what that node returns. Equivalent to `outputSchema` for non-root nodes. |

#### Strict parser rules

- `inputSchema` on a non-root node → parser error: `inputSchema is only allowed in root { } blocks`. The entire node is dropped from the AST. (A map/while `subgraph { }` root counts as a root for this rule.)
- `outputSchema` on a non-root node → parser error: `Use "schema" instead of "outputSchema" in node blocks`. The entire node is dropped from the AST.
- `schema` on root is **not recognized** — the parser cannot consume the value, emits `Unexpected token`, and the rest of the root config is dropped. Always use `outputSchema` on root.

#### Three forms of schema value

Every schema field accepts three value forms:

1. **Inline `@json { ... }` block:**
   ```swirls
   inputSchema: @json {
     { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
   }
   ```
2. **Inline object literal** (no `@json` keyword):
   ```swirls
   inputSchema: {
     "type": "object",
     "required": ["email"],
     "properties": { "email": { "type": "string" } }
   }
   ```
3. **Bare identifier** referencing a top-level `schema <name> { }` block:
   ```swirls
   inputSchema: contact_payload
   ```

The bare-identifier form requires a matching `schema <name> { }` declaration in the workspace. See `resource-schema`.

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
schema contact_payload {
  label: "Contact payload"
  schema: @json {
    { "type": "object", "required": ["name", "email"], "properties": { "name": { "type": "string" }, "email": { "type": "string" } } }
  }
}

workflow handle {
  label: "Handle"

  root {
    type: code
    label: "Entry"
    inputSchema: contact_payload
    outputSchema: contact_payload
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

  flow { root -> greet }
}
```

#### Map / while subgraph root

Inside a `subgraph { }` block on a `map` or `while` node, the root **must** declare `inputSchema`. The validator emits: `map/while subgraph root must declare inputSchema for typed iteration`. This types `context.iteration.item` (map) or `context.iteration.input` (while). See `workflow-subgraph`.

#### Best practice

Define `outputSchema` (root) and `schema` (every non-root node that produces data) — or factor them into a top-level `schema <name> { }` block and reference by name. This enables LSP autocomplete for all downstream `@ts` blocks. Without schemas, `context.nodes.<name>.output` is typed as `unknown` and the LSP cannot help.

#### Vendor-managed types

Some node types have their output shape fixed by the vendor API. Do not set `schema:` on them — the validator errors: `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

Vendor-managed types:
- `scrape`
- `parallel`
- `email`
- `disk`

These types provide their own runtime type shape; the LSP uses it automatically.

#### AI text + schema warning

`type: ai` with `kind: text` produces a plain string output. Setting `schema:` on it is a warning: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` Either drop the schema or change `kind` to `object` for structured JSON output.

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

When using a `type: workflow` node, the output is keyed by the child workflow's leaf node names:

```swirls
node result {
  type: code
  label: "Result"
  code: @ts {
    // run_helper is a workflow node calling helper_workflow
    // helper_workflow's root is its leaf node
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

### context.iteration - Map / While Iteration Data

Inside a `map` or `while` node's child graph (inline `subgraph { }` or referenced `workflow: <name>`), `context.iteration` carries the per-iteration state. The fields available depend on the node type.

#### `map` nodes

| Field | Type | Notes |
|-------|------|-------|
| `context.iteration.item` | The current element from `items: @ts { return [...] }`. Typed by the subgraph root's `inputSchema`. | Available on every iteration. |
| `context.iteration.index` | Number | Zero-based iteration counter. |
| `context.iteration.total` | Number | Length of the `items` array. |
| `context.iteration.previous` | The prior iteration's leaf outputs (or `undefined` at index 0). | Populated because map runs sequentially. |

`map` runs its iterations **sequentially**, in `items` order — each iteration can see the one before via `context.iteration.previous`. The `concurrency` field is accepted by the parser but is **not yet honored by the engine** (iterations do not actually run in parallel); do not rely on it for speed or assume isolation from ordering.

```swirls
node per_ticket {
  type: map
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100

  subgraph {
    root {
      type: code
      inputSchema: ticket_item_schema
      code: @ts {
        const item = context.iteration.item
        return { id: item.id, body: item.body.trim() }
      }
    }
  }
}
```

#### `while` nodes

| Field | Type | Notes |
|-------|------|-------|
| `context.iteration.input` | object | The input for **this** iteration. Iteration 0 receives the value from the outer `input:` field; later iterations receive what `update:` returned. Typed by the subgraph root's `inputSchema`. |
| `context.iteration.index` | Number | Zero-based iteration counter. |
| `context.iteration.previous` | `{ leafName: leafOutput }` or `undefined` | The previous iteration's leaf-node outputs. `undefined` on iteration 0. |

```swirls
node refine_digest {
  type: while
  input: @ts { return { draft: context.nodes.merge.output.draft } }

  condition: @ts {
    return context.iteration.index < 3
  }

  update: @ts {
    const nextDraft =
      context.iteration.previous?.polish?.text ??
      context.iteration.input.draft
    return { draft: nextDraft }
  }

  maxIterations: 5

  subgraph {
    root {
      type: code
      inputSchema: digest_draft_schema
      code: @ts {
        return { blob: context.iteration.input.draft + " (pass " + context.iteration.index + ")" }
      }
    }

    node polish {
      type: code
      schema: @json { ... }
      code: @ts { return { text: context.nodes.root.output.blob.trim() } }
    }

    flow { root -> polish }
  }
}
```

#### Handling iteration 0 in `update`

`update` runs **between** iterations and uses `context.iteration.previous` to compute the next input. On the very first call from iteration 0 to iteration 1, `previous` is the iteration-0 output. Use optional chaining or guard explicitly:

```swirls
update: @ts {
  return {
    draft: context.iteration.previous?.polish?.text ?? context.iteration.input.draft
  }
}
```

#### Reading map output downstream

A map node's output is an array of leaf-keyed objects in the original `items` order:

```ts
context.nodes.<map_node>.output  // Array<{ <leafName>: <leafOutput> }>
```

```swirls
node merge {
  type: code
  code: @ts {
    const rows = context.nodes.per_ticket.output
    const total = rows.length
    const urgent = rows.filter(r => r.triage?.priority >= 3).length
    return { total, urgent }
  }
}
```

#### Reading while output downstream

A while node's output is the **last** iteration's leaf outputs under `lastOutput`:

```ts
context.nodes.<while_node>.output.lastOutput.<leafName>
```

```swirls
node done {
  type: code
  code: @ts {
    const final = context.nodes.refine_digest.output.lastOutput
    return { summary: final?.polish?.text ?? "" }
  }
}
```

#### Common mistakes

- **Treating map output as a flat list** — Each entry is `{ leafName: leafOutput }`, not the leaf output directly. Index by leaf name.
- **Treating while output as an array** — While runs sequentially; output is `output.lastOutput` (single object), not an array of iterations.
- **Reading `context.iteration.previous` on iteration 0** — It's `undefined`. Use `?.` or `if (context.iteration.index > 0) { ... }`.
- **Using `context.nodes.root.input` inside a subgraph** — That's the parent graph's root input. Use `context.iteration.item` (map) or `context.iteration.input` (while) inside the subgraph.
- **Mutating `context.iteration.input`** — Treat it as read-only. Return a new object from `update` to advance state.

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

Code nodes have no access to `process.env` — it is an empty object (`{}`) in the sandbox, so `process.env.API_KEY` returns `undefined` with no error rather than your secret. Use `context.secrets.<block>.<VAR>` instead.

**Correct (secret block + map + nested access):**

```swirls
secret creds {
  vars: [MY_SERVICE_TOKEN, ANOTHER_KEY]
}

workflow g {
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

**Inferred vendor keys (ai / agent / email / scrape / parallel / disk):**

These are resolved by the runtime for those node types (e.g. `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` for `ai` and `agent`, `RESEND_API_KEY` for `email`, `FIRECRAWL_API_KEY` for `scrape`, `PARALLEL_API_KEY` for `parallel`, `ARCHIL_API_KEY` for `disk`). They are not exposed on `context.secrets` for user `@ts` code; declare your own keys in a `secret` block if you need them in code.

Set secret values via `swirls secret set VAR_NAME=...` or the Portal (vault keys remain flat by var name).

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


# 8. Resources & Triggers

### Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields. The `visibility` field controls whether the form is reachable through the Triggers service, and an optional `auth` field gates public forms behind HTTP Basic credentials.

```swirls
form contact_form {
  label: "Contact Form"
  description: "Public contact form: name, email, and message."
  enabled: true
  visibility: public
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
| `label` | recommended | String | Display name in the Portal. Defaults to empty when omitted. |
| `description` | no | String | Longer description. |
| `enabled` | no | Boolean | Default: enabled. Set to `false` to keep the declaration but pause submissions. |
| `visibility` | no | bare identifier value | `public` or `internal` (unquoted). Default: `internal`. |
| `auth` | no | bare identifier | Names a top-level `auth` block with `type: basic`. Triggers enforces HTTP Basic on the public form. |
| `schema` | no | `@json` block, object literal, or bare schema name | JSON Schema for the form payload. The LSP types `context.nodes.root.input` from this schema when a trigger references the form. |

#### `visibility` field

`visibility:` is a key:value field whose value is a **bare identifier** — one of two values:

- **`visibility: public`** — The form is served by Triggers at `/triggers/forms/:projectId/:formName`. External users can fetch the schema and submit payloads.
- **`visibility: internal`** (default) — Triggers refuses to render or accept submissions and returns 404 with the same body as form-not-found (no existence leak). The web/cloud dashboard can still read and edit the form. The trigger binding still fires when the dashboard submits.

The default is `internal` (secure default). Specify `visibility: public` only on forms intended for external traffic.

**Incorrect (quoted string):**

```swirls
form contact {
  label: "Contact"
  visibility: "public"
}
```

The parser errors: `Expected \`public\` or \`internal\` after \`visibility:\``. Any value other than the two identifiers errors: `Invalid visibility "<x>"; expected \`public\` or \`internal\``.

**Incorrect (missing colon):**

```swirls
form contact {
  label: "Contact"
  visibility public
}
```

The parser errors: `Expected \`:\` after \`visibility\``.

**Correct:**

```swirls
form contact {
  label: "Contact"
  visibility: public
}
```

#### `auth` field (HTTP Basic gate)

`auth: <name>` references a top-level `auth` block by bare identifier. The referenced block must have `type: basic` and supply `username` / `password` vars from a secret block. The Triggers form GET and POST handlers then require an `Authorization: Basic` header whose decoded `user:pass` matches the decrypted secret values (401 with `WWW-Authenticate: Basic realm="<label>"` on miss).

```swirls
secret portal_creds {
  vars: [PORTAL_USER, PORTAL_PASS]
}

auth portal {
  type: basic
  secrets: portal_creds
  username: PORTAL_USER
  password: PORTAL_PASS
}

form gated {
  label: "Gated form"
  visibility: public
  auth: portal
}
```

Validator diagnostics:

- `Form "<n>" references undefined auth block "<a>"` — the name does not match a declared `auth` block.
- `Form "<n>" auth block "<a>" must have type \`basic\` (found \`<type>\`)` — only `type: basic` auth blocks can gate forms.

Visibility is enforced before auth, so `auth:` on an internal form is dead config (the form 404s before any auth check runs).

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

#### Schema reference (bare identifier)

You can declare a top-level `schema <name> { }` block once and reference it from the form by bare identifier. The same name can also be used as `inputSchema:` on the workflow root the trigger fires.

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
```

See `resource-schema`.

#### Binding a form to a workflow

Forms don't execute on their own. Declare a `trigger` to send submissions to a workflow:

```swirls
trigger on_contact {
  form:contact_form -> process_contact
  enabled: true
}
```

See `resource-trigger-binding`.

---

### Webhook Declarations

Webhooks create HTTP endpoints for receiving external payloads. They accept any HTTP POST and deliver the body to the connected workflow.

Use `secret:` + `header:` to require shared-secret verification on every inbound request. Both fields must be set together (or neither). The validator warns when both are missing because the endpoint will accept any POST without verification.

```swirls
secret stripe_creds {
  vars: [STRIPE_WEBHOOK_SECRET]
}

webhook stripe_events {
  label: "Stripe Events"
  description: "Stripe sends payment lifecycle events here."
  enabled: true

  schema: @json {
    {
      "type": "object",
      "properties": {
        "id":   { "type": "string" },
        "type": { "type": "string" },
        "data": { "type": "object" }
      },
      "additionalProperties": true
    }
  }

  secret: stripe_creds.STRIPE_WEBHOOK_SECRET
  header: "Stripe-Signature"
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | recommended | String | Display name in the Portal. |
| `description` | no | String | Longer description. |
| `enabled` | no | Boolean | Default: enabled. |
| `schema` | no | `@json` block, object literal, or bare schema name | Shape of the webhook body. Drives `context.nodes.root.input` typing. |
| `secret` | paired with `header` | `<secretBlockName>.<VAR>` | Bare dotted reference to a top-level `secret` block var. The runtime compares the incoming header value against this secret. |
| `header` | paired with `secret` | Quoted string | Inbound HTTP header that carries the shared-secret value. Custom names only — reserved headers are rejected. |

#### `secret:` syntax

`secret:` uses dot notation between the secret block name and the variable name. **No quotes.** No object literal.

```swirls
secret: stripe_creds.STRIPE_WEBHOOK_SECRET
```

The validator errors:

- `Webhook "<name>" references undefined secret block "<block>"` if the secret block does not exist.
- `Webhook "<name>" references var "<VAR>" not declared in secret block "<block>"` if `VAR` is not in that block's `vars:` list.

#### `header:` syntax

`header:` is a quoted string naming the inbound HTTP header that carries the secret value.

```swirls
header: "X-Webhook-Signature"
```

Reserved headers are rejected at validation time. The hard-deny list (case-insensitive) covers RFC 7230 hop-by-hop headers, security/protocol headers, ingress-managed headers, and headers clients set automatically:

```
connection, keep-alive, proxy-authenticate, proxy-authorization, te,
trailers, transfer-encoding, upgrade, cookie, set-cookie, host,
content-length, x-forwarded-for, x-forwarded-proto, x-forwarded-host,
x-forwarded-port, x-real-ip, x-request-id, user-agent, accept,
content-type, origin, referer, from
```

Use a custom name like `X-Stripe-Signature`, `X-Webhook-Signature`, `X-Hub-Signature-256`, etc.

#### Both required, or neither

| `secret:` | `header:` | Result |
|-----------|-----------|--------|
| set | set | Verified webhook (correct). |
| set | missing | Validator error: `Webhook "<n>" has "secret" but is missing "header".` |
| missing | set | Validator error: `Webhook "<n>" has "header" but is missing "secret".` |
| missing | missing | Validator warning: `Webhook "<n>" has no "secret" or "header" set and will accept any POST without verification.` |

The "neither" path is a warning, not an error, so explicitly unauthenticated webhooks remain possible — but the validator surfaces them so you can audit the choice.

#### Name pattern

Webhook names must match `^[a-zA-Z0-9_]+$` (letters, digits, underscores; can start with a digit). Hyphens, dots, and spaces are not allowed.

#### Schema reference (bare identifier)

```swirls
schema event_payload {
  label: "Event payload"
  schema: @json {
    { "type": "object", "properties": { "type": { "type": "string" } } }
  }
}

webhook inbound {
  label: "Inbound"
  schema: event_payload
}
```

See `resource-schema`.

#### Binding

A webhook on its own does not execute a workflow. Declare a trigger:

```swirls
trigger on_inbound {
  webhook:inbound -> handle_event
  enabled: true
}
```

---

### Schedule Declarations

Schedules trigger workflows on a cron schedule. The payload is an empty object `{}`.

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
| `label` | recommended | String (defaults to empty when omitted) |
| `cron` | yes | Cron expression string. Missing it is a parse error: `Schedule must have cron` |
| `timezone` | no | IANA timezone string |
| `enabled` | no | Boolean (default: true) |

Common cron expressions (standard 5-field form):
- `"0 9 * * *"` - Daily at 9 AM
- `"0 */6 * * *"` - Every 6 hours
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"*/15 * * * *"` - Every 15 minutes

Schedule names must match `^[a-zA-Z0-9_]+$` (letters, digits, underscores). Bind a schedule to a workflow via a trigger:

```swirls
trigger daily_trigger {
  schedule:daily -> morning_report
  enabled: true
}
```

---

### Stream Block Declaration

Top-level `stream <name> { }` blocks persist one workflow's output into a named, schema-typed record. They replace the removed `persistence { }` block. A `type: stream` node in another workflow can read from the same stream (at a pinned version) to achieve workflow-to-workflow communication.

**There is no `type:` field on a stream block** — the keyword `stream` identifies the block.

Each stream declares one or more **versions** under a `versions:` map. Every version carries its own `schema`, optional `condition`, and required `prepare`. The block's top-level `version:` pointer names which version the writer persists into. `schema`, `condition`, and `prepare` live **only inside a `versions:` entry** — never at the top level of the block.

#### Syntax

```swirls
stream <name> {
  label: "<optional label>"          // defaults to <name>
  description: "<optional string>"
  enabled: <boolean>                  // optional; default treated as true
  workflow: <workflow_name>           // required; workflow declared in the workspace (legacy alias: graph:)
  version: <version_id>               // required; active writer version, must exist in versions:

  versions: {
    <version_id> {                    // version_id matches ^v[1-9][0-9]*$ (v1, v2, …)
      schema: @json {                 // required per version
        { ... JSON Schema for one persisted record ... }
      }
      condition: @ts {                // optional; return true to persist
        return <boolean expression>
      }
      prepare: @ts {                  // required; return the object to persist
        return { ... }
      }
    }
    ...
  }
}
```

`condition` and `prepare` may also be `@ts "path.ts.swirls"` file references. `schema` may instead be a bare-identifier reference to a top-level `schema` block: `schema: my_record_schema`.

#### Required vs optional fields

Block-level:

| Field | Required | Notes |
|-------|----------|-------|
| `workflow` | yes | Bare identifier (or quoted string) naming a workflow in the same file or merged workspace. `graph:` is a legacy alias. |
| `version` | yes | Active writer `version_id` (`v1`, …). Must match a key in `versions:`. |
| `versions` | yes | Non-empty map of `version_id` → `{ schema, condition?, prepare }`. |
| `label` | no | Defaults to the stream's name. |
| `description` | no | Free-form description. |
| `enabled` | no | When false, runtime skips persistence but the stream stays in the AST and deployment. |

Per-version (inside `versions:`):

| Field | Required | Notes |
|-------|----------|-------|
| `schema` | yes | `@json { }` literal or `schema: <name>` reference. Defines one record's shape for that version. |
| `prepare` | yes | Non-empty `@ts { }` or `@ts "…"` reference. Must return the record object. |
| `condition` | no | `@ts` returning boolean; if false, skip persist. If present and empty, the validator errors. |

#### Context shape inside `condition` and `prepare`

These `@ts` blocks get a specialized `context`:

- `context.output.<leafNodeName>` — output of each DSL leaf node (node with no outgoing edges). Only leaves that actually executed appear. For a single-node workflow, `context.output.root` holds the root output.
- `context.nodes.<name>.input` / `.output` — per-node access for every executed node.
- `context.nodes.root.input` — the workflow's trigger input.
- `context.reviews`, `context.secrets`, `context.meta` — as in normal nodes (may be empty on CLI).

Because `context.output` is keyed by leaf, and because `switch` routing means only one branch's leaves run, every leaf key is typed as independently optional by the LSP. Narrowing one case does not narrow sibling cases. Use `'leafName' in context.output`, optional chaining (`?.`), non-null assertion (`!`), or explicit runtime checks on the fallback branch.

#### Complete example — write side

```swirls
workflow process_leads {
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
  workflow: process_leads
  version: v1

  versions: {
    v1 {
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
  }
}
```

#### Reading a stream — the read side

A `type: stream` node in another workflow reads the persisted data at a pinned version:

```swirls
workflow enrich_leads {
  label: "Enrich high-scoring leads"

  root {
    type: stream
    label: "Read scored leads"
    stream: scored_leads
    version: v1
    filter: @ts {
      return {
        score: { gte: 80 }
      }
    }
  }
}
```

See `node-stream` for the full filter operator list.

#### Provisioning and versioning

- Deploy provisions **one Postgres table per `(stream, version)`** — for example `project_<uuid>.stream_scored_leads_v1`.
- Workflow completion writes only to the deployment's active `version` (the block-level `version:` pointer).
- Re-deploying with a **changed `schema` for an existing version id** fails with a drift error. To evolve a record shape, add a **new** `versions:` entry (`v2`, …) and move the `version:` pointer; existing readers stay pinned to the old version until you migrate them.
- The local CLI worker does not write or read stream data — exercise streams in a deployed project.

#### Validation rules

- Stream names must match `^[a-zA-Z0-9_]+$`. Duplicate names error with `Duplicate stream name "X"`.
- `workflow` is required (`Stream block requires "workflow" (workflow name)`) and must reference a declared workflow (`Stream references workflow "X" which is not defined`).
- `version` is required (`Stream "X" requires "version" (active writer)`), must be a valid `version_id` (`… version pointer "X" is invalid — use v1, v2, …`), and must be declared under `versions:` (`… version "X" is not declared under versions { }`).
- `versions:` must be non-empty (`Stream "X" requires a non-empty versions { } block`). Duplicate keys error (`… declares duplicate version key "X"`).
- Each version requires a `schema` (`… version "vN" has no schema; add schema: @json { … } or schema: <name>`) and a non-empty `prepare` (`… version "vN" requires "prepare"`). A present-but-empty `condition` errors too.
- Placing `schema` / `condition` / `prepare` at the **top level** of the block is a parse error: `top-level "<key>" is invalid on stream blocks — use versions { v1 { schema, condition?, prepare } }`. Any key other than `schema`, `condition`, `prepare` inside a version entry errors: `Unexpected key "<key>" in stream versions block — only schema, condition, and prepare are allowed`.

#### Top-level vs node keyword — disambiguation

The lexer treats `stream` as a keyword. At the top level:

- `stream <name> { … }` — declare a stream block.
- `stream:` at top-level is invalid and errors with: `"stream:" is only valid inside a node { } block (did you forget to close a brace?)`.

Inside a workflow body, `stream:` at workflow scope (outside a node) errors the same way. Inside a `node { }` body, `stream:` is a normal config field (used by `type: stream` nodes as the stream reference).

---

### View Block Declaration

Top-level `view <name> { }` blocks compose one or more `stream` blocks into a spreadsheet-shaped table. A view maps each source stream row into a typed row (the `columns` mapping), and may add **computed columns** whose values come from running a workflow (graph) once per row. The cloud UI renders a view as a virtualized spreadsheet with per-cell loading states while computed columns run.

**There is no `type:` field on a view block** — the keyword `view` identifies the block. A view is read/derived data: it does not start workflows from triggers, and nothing reads *from* a view inside the DSL (it is surfaced in the cloud UI and via the API, not consumed by nodes).

A view is built from three things:

1. `streams:` — the source `stream` blocks it composes. Their rows become the view's rows.
2. `columns:` — a `@ts` mapping from a source stream row into the view's row shape (validated against `schema`).
3. `computed { }` — optional named columns, each running a `graph` per row to produce a cell value.

#### Syntax

```swirls
view <name> {
  label: "<optional label>"            // defaults to <name>
  description: "<optional string>"
  enabled: <boolean>                    // optional; default treated as true
  streams: [<stream_name>, ...]         // required; non-empty list of stream block names

  schema: @json {                       // required; shape of one mapped (non-computed) row
    { ... JSON Schema ... }
  }

  columns: @ts {                        // required; map a source stream row into the row shape
    return { ... }
  }

  computed {                            // optional; zero or more computed columns
    <column_name> {                     // column_name matches ^[a-zA-Z0-9_]+$
      graph: <workflow_name>            // required; workflow run once per row
      input: @ts {                      // required; map the row into the graph's trigger input
        return { ... }
      }
      output: @ts {                     // optional; map the graph output into the cell value
        return ...
      }
    }
    ...
  }
}
```

`columns`, and each computed `input` / `output`, may also be `@ts "path.ts.swirls"` file references. `schema` may instead be a bare-identifier reference to a top-level `schema` block: `schema: my_row_schema`.

**`computed` is a block, not a `key: value` field** — write `computed { ... }` with no colon, the same way `versions { }` is written inside a `stream` block. Inside it, each entry is `<column_name> { graph, input, output? }`.

#### Required vs optional fields

Block-level:

| Field | Required | Notes |
|-------|----------|-------|
| `streams` | yes | Non-empty list of `stream` block names declared in the same file or merged workspace. Each must exist; duplicates in the list error. |
| `schema` | yes | `@json { }` literal or `schema: <name>` reference. Shape of one mapped row (computed columns are appended on top of it). |
| `columns` | yes | Non-empty `@ts { }` or `@ts "…"`. Returns the mapped row object for one source stream row. |
| `label` | no | Defaults to the view's name. |
| `description` | no | Free-form description. |
| `enabled` | no | When false, the view stays in the AST and deployment but is not materialized. |
| `computed` | no | Block of named computed columns. Omit it for a plain mapped view. |

Per computed column (inside `computed { }`):

| Field | Required | Notes |
|-------|----------|-------|
| `graph` | yes | Bare identifier (or quoted string) naming a workflow in the same file or merged workspace. `workflow:` is an accepted alias. |
| `input` | yes | Non-empty `@ts { }` or `@ts "…"`. Maps the mapped row into the graph's trigger input; must return a plain object. |
| `output` | no | `@ts` mapping the graph's result into the cell value. Omit it to store the graph output directly. |

#### Context shape inside `columns`

`columns` runs once per source stream row. The originating row is exposed under `context.streams`:

- `context.streams.<streamName>.output` — the source stream row's persisted record.
- `context.streams.<streamName>.<versionId>.output` — the same record under the row's version key (e.g. `.v2.output`).

Only the stream that produced the current row is present; sibling streams of the view are absent for that row. Return the mapped row object — it is validated against the view `schema` exactly like a stream `prepare` is validated against its version schema.

#### Context shape inside computed `input` and `output`

- `input` gets `context.row` — the mapped row object produced by `columns` — plus the same `context.streams.<name>` as `columns`. Return the object passed to the graph as its trigger input.
- `output` gets `context.output` — the completed graph's **leaf** node outputs, keyed by leaf node name (same shape stream `prepare` sees) — plus `context.row`. Return the cell value. Without `output`, the cell value is the graph's output directly.

#### Complete example

```swirls
workflow count_topic_tokens {
  label: "Count topic tokens"
  root {
    type: code
    label: "Count"
    code: @ts {
      return { topic: context.nodes.root.input.topic, tokens: 42 }
    }
  }
}

workflow enrich_topic {
  label: "Enrich topic"
  root {
    type: code
    label: "Enrich"
    code: @ts {
      return { sentiment: "positive" }
    }
  }
}

stream store_topic_tokens {
  label: "Topic tokens"
  workflow: count_topic_tokens
  version: v1
  versions: {
    v1 {
      schema: @json {
        {
          "type": "object",
          "required": ["topic", "tokens"],
          "properties": {
            "topic": { "type": "string" },
            "tokens": { "type": "number" }
          }
        }
      }
      prepare: @ts {
        return { topic: context.output.root.topic, tokens: context.output.root.tokens }
      }
    }
  }
}

view topic_dashboard {
  label: "Topic dashboard"
  description: "One row per stored topic, enriched with sentiment"
  streams: [store_topic_tokens]

  schema: @json {
    {
      "type": "object",
      "required": ["topic", "tokens"],
      "properties": {
        "topic": { "type": "string" },
        "tokens": { "type": "number" }
      }
    }
  }

  columns: @ts {
    return {
      topic: context.streams.store_topic_tokens.output.topic,
      tokens: context.streams.store_topic_tokens.output.tokens
    }
  }

  computed {
    sentiment {
      graph: enrich_topic
      input: @ts {
        return { topic: context.row.topic }
      }
      output: @ts {
        return context.output.root.sentiment
      }
    }
  }
}
```

#### Runtime behavior

- A view is materialized **only in a deployed project** (hosted on Swirls Cloud); the local CLI worker does not build views.
- Each source stream row becomes one view row (the `columns` mapping). New stream rows materialize as the source workflow completes; deploying a view backfills existing stream rows.
- Each computed column runs `graph` **once per row** as a normal workflow execution. Those executions are billed against `execution_credits` exactly like trigger-started runs — an over-quota org gets a failed cell, not a free run. A view over a busy stream with computed columns can launch a large number of graph executions, so reach for computed columns deliberately.
- Cells move through `pending → running → completed | failed`; the spreadsheet shows a loading state until each settles.
- Recompute is available from the cloud UI; it re-materializes existing rows and re-runs computed columns (idempotent per row).

#### Validation rules

- View names must match `^[a-zA-Z0-9_]+$`. Duplicate names error with `Duplicate view name "X"`.
- `streams` is required and non-empty (`View "X" requires "streams" (non-empty list of stream names)`). Each entry must reference a declared stream (`View references stream "Y" which is not defined`); listing a stream twice errors (`View "X" lists stream "Y" more than once`).
- `schema` is required (`View "X" has no schema; add schema: @json { … } or schema: <name>`).
- `columns` is required and must be a non-empty `@ts` block or `@ts "…"` (`View "X" requires "columns" …`, `View "X": columns requires a non-empty @ts block …`).
- Each computed column requires `graph` naming a declared workflow (`… computed column "C" requires "graph"`, `… references workflow "G" which is not defined`) and a non-empty `input` (`… requires "input" …`). A present-but-empty `output` errors. Duplicate computed column names error (`… declares duplicate computed column "C"`).
- **Execution-loop guard:** a view whose computed column runs a graph that writes a stream the same view (or a view it feeds, transitively) composes is rejected — `View "X" creates an infinite execution loop: a computed column runs a graph that writes a stream this view (or a view it feeds) composes.` Each materialized row would otherwise enqueue another graph run forever. Point computed columns at graphs that do **not** write back into the view's source streams. Per-file validation (`swirls doctor`) checks loops among resources in that file; **deploy** merges the workspace AST and runs the same check so cross-file view → workflow → stream loops cannot ship.

#### Top-level keyword — disambiguation

The lexer treats `view` as a keyword. At the top level, `view <name> { }` declares a view block. There is no `view` node type and no `view:` config field — a view is not referenced from inside a workflow.

---

### Top-Level `schema` Blocks

A top-level `schema <name> { }` block declares a reusable JSON Schema that can be referenced by bare identifier from forms, webhooks, root `inputSchema`/`outputSchema`, and node `schema` (or `outputSchema` on root). Same shape, declared once.

#### Syntax

```swirls
schema <name> {
  label: "<optional label>"
  description: "<optional>"

  schema: @json {
    { ... JSON Schema ... }
  }
}
```

#### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | recommended | String | Display name. |
| `description` | no | String | Longer description. |
| `schema` | yes | `@json { }` block, or object literal, or bare name | The JSON Schema body. Bare-name form (`schema: other_name`) chains another schema block. |

#### Example: declare once, reference everywhere

```swirls
schema contact_payload {
  label: "Contact payload"
  description: "Shared JSON Schema for the contact form and process_form workflow"
  schema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":  { "type": "string" },
        "email": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
}

form contact {
  label: "Contact"
  schema: contact_payload
}

workflow handle_contact {
  label: "Handle contact"

  root {
    type: code
    label: "Entry"
    inputSchema: contact_payload
    outputSchema: contact_payload
    code: @ts {
      const { name, email } = context.nodes.root.input
      return { name: name.trim(), email: email.trim().toLowerCase() }
    }
  }

  node summarize {
    type: code
    label: "Summarize"
    schema: contact_payload
    code: @ts { return context.nodes.root.output }
  }

  flow { root -> summarize }
}

trigger on_contact {
  form:contact -> handle_contact
  enabled: true
}
```

#### Where bare schema names work

Any of these fields accept a bare schema identifier (no quotes, no `@json`):

- Form / webhook `schema:` — `schema: contact_payload`
- Root `inputSchema:` — `inputSchema: contact_payload`
- Root `outputSchema:` — `outputSchema: contact_payload`
- Non-root node `schema:` — `schema: contact_payload`
- Review block `schema:` — `review: { schema: contact_payload, ... }`
- Top-level `schema` block `schema:` (chaining) — `schema: contact_payload`

Inline `@json { }` and inline object literals still work. Use the bare name to avoid duplicating the same schema across multiple sites.

#### Name pattern

Schema names must match `^[a-zA-Z0-9_]+$`. Hyphens, dots, and spaces are not allowed.

#### Workspace resolution

Schema names resolve across all `.swirls` files in the workspace, the same way workflows and streams do. `swirls doctor` and deploy bundle the union of all schema declarations under the scanned working directory. The LSP single-file open may report a missing schema until the workspace is considered.

#### Validation rules

- The validator runs `validateSchemaFieldRefs` over the AST. Each bare-identifier reference (`inputSchema: <name>`, `outputSchema: <name>`, `schema: <name>` on form/webhook/node, `review: { schema: <name> }`) must resolve to a top-level `schema` block in the workspace.
- Duplicate `schema` block names in one file are errors.
- A `schema` block whose body is an empty object literal is allowed but unhelpful — fill in `type`/`properties`/etc.

---

### Trigger Bindings

Triggers connect a resource (form, webhook, or schedule) to a workflow. When the resource fires, the workflow executes with the resource's payload available as `context.nodes.root.input`.

**Only three resource types are valid in triggers:** `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, or `trigger:` type.

#### Syntax

```swirls
trigger <name> {
  form:<form_name> -> <workflow_name>
  enabled: <boolean>
}

trigger <name> {
  webhook:<webhook_name> -> <workflow_name>
  enabled: <boolean>
}

trigger <name> {
  schedule:<schedule_name> -> <workflow_name>
  enabled: <boolean>
}
```

The binding is a single syntactic line `<type>:<name> -> <workflow>`. There are no separate `resource:` / `workflow:` fields. `enabled:` is the only other field; everything else is ignored.

#### Incorrect (wrong syntax)

```swirls
trigger my_trigger {
  form: contact_form
  workflow: process_form
}
```

Missing the `-> workflowName` arrow. The trigger silently parses with empty `resourceName` and `workflowName`, and the validator then complains about undefined references.

#### Incorrect (agent type)

```swirls
trigger agent_trigger {
  agent:my_agent -> my_workflow
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

Multiple triggers can target the same workflow from different sources.

#### Validation rules

- Trigger names must match `^[a-zA-Z0-9_]+$`.
- The referenced `form` / `webhook` / `schedule` must be declared in the workspace (same file or another `.swirls` file), else: `Trigger references <type> "<name>" which is not defined`.
- The referenced workflow must be declared in the workspace, else: `Trigger references workflow "<name>" which is not defined`.

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

workflow g {
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

- CLI: `swirls secret set MY_TOKEN=...`
- Portal: the secrets vault UI.

Vault keys are flat by var name; the block is a logical grouping for reference and validation, not a namespace at the storage layer.

#### Inferred vendor keys

Some node types auto-resolve their API keys without appearing in `secrets:`:

- `ai` → `OPENROUTER_API_KEY` (default) or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` per `provider:`
- `agent` → same set as `ai`, resolved per the bound `agent` block's `provider:`
- `email` → `RESEND_API_KEY`
- `scrape` → `FIRECRAWL_API_KEY`
- `parallel` → `PARALLEL_API_KEY`
- `disk` → `ARCHIL_API_KEY` (platform-managed; resolved at runtime for `type: disk` nodes — not declared in DSL)

Do not list these in a `secret` block unless you also want them accessible from `@ts` code.

---

### Auth Block Declaration

Declares named authentication configuration. Each type is linked to a top-level `secret` block via `secrets: <block_name>`, with identifier fields (`client_id`, `token`, etc.) that name vars declared in that block's `vars` list. `auth:` can only be referenced from `http` nodes.

Use `auth` for credentials you bring yourself. For a Swirls-brokered OAuth grant (Slack, Linear, ...), declare a top-level `connection` block instead and reference it via `connection:` on the http node. See `resource-connection`.

#### Supported `type` values

```
oauth, api_key, basic, bearer
```

Any other value triggers: `Auth block "<name>" requires type: oauth, api_key, basic, or bearer`. (The `cloud` type has been removed; use a `connection` block.)

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
- `type:` is required and must be one of the four values above.
- Identifier fields (`client_id`, `client_secret`, `key`, `username`, `password`, `token`) must each name a var declared in the referenced secret block. Otherwise the validator errors: `Auth "<name>" field "<field>" must reference a var from secret block "<secrets>"`.
- Forms can also reference an auth block via `auth: <name>`, but only `type: basic` blocks are accepted there. See `resource-form`.

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

### Disk Block Declaration

Top-level `disk <name> { }` blocks declare a **platform-managed shared disk**. Swirls provisions the Archil backing store at deploy time — authors do not set provider disk ids or `ARCHIL_API_KEY` in DSL.

**There is no `type:` field on a disk block** — the keyword `disk` identifies the block.

#### Syntax

```swirls
disk <name> {
  label: "<optional label>"
  region: "<optional region>"
}
```

Empty blocks are valid: `disk shared_a { }`.

#### Fields

| Field | Required | Notes |
|-------|----------|-------|
| `label` | no | Display string. Defaults to the disk's name. |
| `region` | no | Quoted string (e.g. `"aws-us-east-1"`). Optional Archil region hint at provision time. |

#### Removed fields (breaking)

`id:` and `secrets:` are **no longer valid**. The parser errors:

```
Disk block no longer accepts "id:" — the platform provisions Archil disks at deploy time
Disk block no longer accepts "secrets:" — the platform provisions Archil disks at deploy time
```

#### Complete example

```swirls
disk proj {
  label: "Project shared disk"
  region: "aws-us-east-1"
}

workflow backup {
  label: "Backup logs"
  root {
    type: disk
    label: "Tar logs"
    disk: proj
    command: @ts {
      const date = new Date().toISOString().slice(0, 10)
      return "tar czf /tmp/backups/logs-" + date + ".tar.gz /data"
    }
  }
}
```

#### Agent shared disks

Mount a shared disk into an agent sandbox with `disks:` on the agent block:

```swirls
disk kb {}

agent helper {
  secrets: ai_creds
  model: "gpt-4o"
  disks: [ kb ]
}
```

Every deployed agent also receives a **dedicated** platform-managed disk (not declared as a `disk` block). In sandboxes it mounts at `/mnt/agent`; shared disks mount at `/mnt/disks/<diskName>`.

#### Validation rules

- Disk names must match `^[a-zA-Z0-9_]+$`. Duplicate names error: `Duplicate disk block name "<n>"`.
- The `disk` node's `disk:` field must match a declared disk block by bare identifier (file-local or workspace).
- Agent `disks:` entries must reference declared `disk` blocks; duplicates error.

See `node-disk` for the workflow exec side and `resource-agent` for agent mounting.

---

### Agent Block Declaration

Top-level `agent <name> { }` blocks declare an LLM agentic harness: which provider and model to use, which secret block holds the API key, a default system prompt, runtime knobs, optional sandbox sizing, the tools (workflows) the model may call, an optional subagent `team` it may delegate to, and zero or more named `profile <name> { }` sub-blocks. `type: agent` nodes bind to an agent block by bare identifier, and `channel` blocks expose an agent on a chat platform.

**There is no `type:` field on an agent block** — the keyword `agent` identifies the block. Names must match `^[a-zA-Z0-9_]+$`.

#### Syntax

```swirls
agent <name> {
  label: "<optional>"
  description: "<optional>"

  provider: openrouter | anthropic | openai | google   // optional, default openrouter
  model: "<string>"                                     // REQUIRED quoted string
  secrets: <secret_block>                               // REQUIRED bare identifier ref

  system: @ts {                       // optional default system prompt (@ts only)
    return "..."
  }

  temperature: <number>               // optional
  maxTokens: <number>                 // optional
  maxSteps: <number>                  // optional; default 20

  tools: [workflow_a, workflow_b]           // optional; workflows exposed as LLM-callable tools
  team: [agent_b, agent_c]                  // optional; other agents this one may delegate to

  sandbox: {                          // optional; workspace sizing + lifecycle
    cpus: 2
    memoryMiB: 1024
    diskGiB: 10
    autoStopMinutes: 15
    autoArchiveMinutes: 60
    autoDeleteMinutes: 1440
    ephemeral: false
  }

  wallet: {                           // optional; enables Zero tool spend (zero_search, zero_get, zero_fetch, zero_wallet_status)
    budget: 50                         // USD per cadence window, > 0
    cadence: daily                     // daily | weekly | monthly (bare identifier)
    maxPerCall: 2                      // optional; per-call ceiling in USD
  }

  profile <profile_name> {                  // zero or more profiles
    description: "<optional>"
    tools: [workflow_a]                  // optional; SUBSET of agent.tools
    system: @ts { return "..." }      // optional override
    sandbox: { cpus: 1 }              // optional override
  }
}
```

#### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `model` | yes | Non-empty quoted string. |
| `secrets` | yes | Bare identifier naming a top-level `secret` block. NOT a string. The block must declare the provider key var. |
| `provider` | no | Bare identifier: `openrouter` (default), `anthropic`, `openai`, or `google`. |
| `system` | no | `@ts` block returning the default system prompt. `@ts` only. |
| `temperature` | no | Number. |
| `maxTokens` | no | Number. |
| `maxSteps` | no | Number. Caps how many tool-call turns the agent may take. Default **20**. |
| `tools` | no | Array of bare identifiers naming tool workflows in the workspace. |
| `team` | no | Array of bare identifiers naming other `agent` blocks this agent may delegate to as subagents. See below. |
| `sandbox: { }` | no | Workspace sizing and lifecycle. See below. |
| `disks` | no | Array of bare identifiers naming top-level `disk` blocks to mount for the agent. See `resource-disk`. |
| `wallet: { }` | no | Virtual tool-spend budget for Zero capabilities. See below. |
| `profile <name> { }` | no | Zero or more named profiles. Each may override `system`, `sandbox`, and narrow `tools`. |
| `label` | no | Display string. |
| `description` | no | Free-form description. |

#### Provider key mapping

The bound `secret` block must declare the env var matching the provider:

| `provider` | Required secret var |
|------------|---------------------|
| `openrouter` (default) | `OPENROUTER_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` |

#### Sandbox block

The optional `sandbox: { }` block sizes and governs the per-agent persistent workspace (where built-in read/write/edit/bash/grep/find/ls tools run). All fields are optional numbers/booleans:

| Field | Bound | Notes |
|-------|-------|-------|
| `cpus` | `>= 1` | vCPU count. |
| `memoryMiB` | `>= 128` | Memory in MiB. |
| `diskGiB` | `>= 1` | Disk in GiB. |
| `autoStopMinutes` | `>= 0` | Idle stop; `0` disables. |
| `autoArchiveMinutes` | `>= -1` | Idle archive; `-1` disables. |
| `autoDeleteMinutes` | `>= -1` | Idle delete; `-1` disables. |
| `ephemeral` | boolean | Discard workspace after the turn. |

Out-of-bounds values error with `Agent "<name>": sandbox.<field> must be ...`.

#### Wallet block (Zero tool spend)

The optional `wallet: { }` block opts the agent into hosted **Zero** tools (`zero_search`, `zero_get`, `zero_fetch`, `zero_wallet_status`) at runtime. Swirls uses a shared platform wallet (`ZERO_PRIVATE_KEY`); the DSL wallet is a **virtual per-agent budget** enforced per UTC calendar window.

| Field | Required | Notes |
|-------|----------|-------|
| `budget` | yes | Positive number. USD cap for the cadence window. |
| `cadence` | yes | Bare identifier: `daily`, `weekly`, or `monthly`. |
| `maxPerCall` | no | Positive USD ceiling for a single paid `zero_fetch`. Must be `<= budget`. Defaults to a platform cap when omitted. |

When `wallet:` is present and the platform wallet is configured, the runtime registers `zero_search` (free catalog search), `zero_get` (inspect capability schema before calling), `zero_fetch` (paid capability calls with method/body and reserve-then-settle accounting), and `zero_wallet_status` (remaining budget for the current cadence window). Org-level prepaid budget is purchased via Autumn `tool_spend` (see billing); the agent wallet caps how fast each agent draws it down. The system prompt appendix guides the model to describe catalog search and automatic tool invocation when users ask about capabilities.

Validator diagnostics:

- `Agent "<n>": wallet requires budget as a positive number`
- `Agent "<n>": wallet.budget must be a positive number`
- `Agent "<n>": wallet requires cadence (daily, weekly, or monthly)`
- `Agent "<n>": wallet.cadence must be daily, weekly, or monthly`
- `Agent "<n>": wallet.maxPerCall must be a positive number`
- `Agent "<n>": wallet.maxPerCall must be less than or equal to wallet.budget`

There is no profile-level wallet override in v1.

```swirls
agent researcher {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  wallet: {
    budget: 50
    cadence: daily
    maxPerCall: 2
  }
}
```

#### Complete example

```swirls
secret ai_creds {
  vars: [OPENAI_API_KEY]
}

workflow search_kb {
  label: "Search KB"
  description: "Search the knowledge base for relevant articles."
  root {
    type: code
    label: "Search"
    inputSchema: @json {
      { "type": "object", "required": ["q"], "properties": { "q": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["hits"], "properties": { "hits": { "type": "array" } } }
    }
    code: @ts { return { hits: [] } }
  }
}

workflow escalate {
  label: "Escalate"
  description: "Escalate a ticket to a senior engineer and return the new ticket id."
  root {
    type: code
    label: "Escalate"
    inputSchema: @json {
      { "type": "object", "required": ["reason"], "properties": { "reason": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["ticketId"], "properties": { "ticketId": { "type": "string" } } }
    }
    code: @ts { return { ticketId: "T-1" } }
  }
}

agent triage {
  label: "Support triage agent"
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
  maxSteps: 8
  temperature: 0.2
  tools: [search_kb, escalate]

  sandbox: {
    cpus: 2
    memoryMiB: 1024
    diskGiB: 10
    autoStopMinutes: 15
  }

  system: @ts {
    return "You are a support triage agent. Use tools to resolve tickets."
  }

  profile support {
    description: "Frontline support agent"
    tools: [search_kb]
  }

  profile escalations {
    description: "Senior agent who can escalate"
    tools: [search_kb, escalate]
    system: @ts {
      return "You are a senior agent. Escalate only when necessary."
    }
  }
}

workflow handle_ticket {
  label: "Handle ticket"
  root {
    type: agent
    label: "Triage"
    agent: triage
    profile: support
    prompt: @ts {
      return "Ticket: " + context.nodes.root.input.body
    }
  }
}
```

#### Tool workflows (workflows-as-tools only)

Tools are workflows exposed to the model. There is no MCP, HTTP, or builtin tool syntax. Each entry in `tools: [ … ]` must name a workflow in the workspace that:

- Has a non-empty workflow-level `description:` (fed to the model as tool help text).
- Has a root node with JSON `inputSchema` that declares a **non-empty `properties` object** (defines the tool call arguments — a tool with zero input properties is rejected: `Agent tool workflow "<n>" root inputSchema must declare a non-empty properties object`).
- Has an output schema on **every leaf node** (`outputSchema` on the root if it is a leaf, or `schema` on non-root leaves). **Exception:** an AI leaf whose `kind` is anything other than `object` (`text`, `embed`, `image`, `video`) needs no schema — its output shape is fixed by the kind (`text` → string, `embed` → number array, `image`/`video` → media) and is inferred. Only `kind: object` AI leaves still need a `schema` (already required by the AI-node validator). Do not add `schema: @json { { "type": "string" } }` to a `kind: text` leaf to satisfy this — it triggers the AI-node warning instead.

Built-in workspace tools (read, write, edit, bash, grep, find, ls) are always available inside the sandbox and are not declared in `tools:`.

#### Subagent teams

`team: [ … ]` lists other `agent` blocks this agent may delegate to. Each team member becomes a callable tool: the model invokes it with a task description, the member runs as its own agent (own model, tools, and sandbox), and returns its result to the caller. Use teams to compose specialists behind one orchestrator instead of giving a single agent every tool and instruction.

```swirls
agent researcher {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  tools: [search_kb]
  system: @ts { return "Research the question and return concise findings with sources." }
}

agent writer {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  system: @ts { return "Turn findings into clear, well-structured prose." }
}

agent orchestrator {
  secrets: vendor_keys
  model: "google/gemini-3.1-flash-lite"
  maxSteps: 16
  team: [researcher, writer]
  system: @ts {
    return [
      "You coordinate specialists.",
      "Call a team tool with a clear task describing what to do.",
      "Relay the specialist's answer plainly.",
    ].join("\n")
  }
}
```

Team members are referenced by bare identifier (not a quoted string). A `team` member becomes a tool alongside the agent's `tools` workflows, so their names share one namespace.

#### Validation rules

- Agent names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `model` must be a non-empty quoted string. `secrets` is required and is a bare identifier, not a string.
- `provider`, if present, must be one of the four allowed values; it defaults to `openrouter`.
- Every entry in `tools:` must name a tool workflow defined in the workspace.
- Every entry in `team:` must name a defined `agent` block in the workspace. An agent cannot list itself, a team member name cannot collide with a `tools:` workflow name in the same agent, and teams cannot form a cycle (`a -> b -> a` is rejected, as is any longer loop).
- Every `profile <name> { }` must have a unique name within the agent block. Each profile's `tools:` must be a SUBSET of the agent's top-level `tools:`.
- `sandbox.<field>` values must satisfy the bounds above.
- `type: agent` nodes' `agent:` field must match a declared agent block. If the node also sets `profile:`, it must name a declared profile in that block.

See `node-agent` for the binding side.

---

### Channel Block Declaration

Top-level `channel <name> { }` blocks bind an `agent` block to a chat platform. Once a channel is enabled, the agent answers messages on that platform: each inbound message starts an agent turn and the agent's reply is posted back to the conversation. The same agent block can simultaneously back a `type: agent` node, a `swirls chat` session, and one or more channels.

**There is no `type:` field on a channel block** — the keyword `channel` identifies the block. A channel is not a node and cannot appear inside a workflow's `flow { }`.

#### Syntax

```swirls
channel <name> {
  platform: slack | linear | discord | web    // required
  connection: <connection_name>                 // optional; bare name of a top-level connection block
  agent: <agent_name>                           // required; bare identifier
  mode: mention | dm | all                      // optional; defaults to mention
  enabled: true | false                         // optional; defaults to enabled
  label: "<optional label>"
  description: "<optional description>"
}
```

`platform` and `mode` take **bare values** by convention (the parser also accepts quoted strings). `agent` is a bare identifier naming a top-level `agent` block (a quoted string also parses). Unlike most blocks, channels reject unknown keys: `Unknown channel property "<key>"`.

#### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `platform` | yes | Bare value. One of `slack`, `linear`, `discord`, `web`. Where messages are delivered and how inbound events are routed. |
| `connection` | no | Bare name of a top-level `connection` block supplying the OAuth credential. Its `provider` must match `platform`. Lets one project bind multiple connections of the same provider. See `resource-connection`. |
| `agent` | yes | Bare identifier naming an `agent` block (same file or another file in the workspace). |
| `mode` | no | Bare value `mention` (default), `dm`, or `all`. Controls which inbound events reach the agent. |
| `enabled` | no | Boolean. `false` makes the binding inactive. Defaults to enabled. |
| `label` | no | Display string shown in the Portal. |
| `description` | no | Description shown in the Portal. |

#### Platforms and modes

| `platform` | Where the agent runs |
|------------|----------------------|
| `slack` | Slack channels and DMs. |
| `linear` | Linear issues and comments. |
| `discord` | Discord servers and DMs. |
| `web` | Standalone authenticated chatbox at `/chat/web/:projectId/:channelName` and embed/API surface. |

| `mode` | The agent responds to |
|--------|-----------------------|
| `mention` (default) | Only messages that @-mention the agent. |
| `dm` | Only direct messages. |
| `all` | Both mentions and direct messages. |

For `platform: web`, `mode` is optional and ignored by the chat service — web channels are keyed by **channel name**, not `platform:mode:agent`. You can declare multiple web channels for the same agent (for example separate chatbox links). For OAuth-backed platforms (`slack`, `linear`, `discord`), set `connection:` to name a `connection` block whose `provider` matches `platform`.

Cloud in-app chat lists **all deployed agents** and posts to `/chat/agent/:projectId/:agentName` — no web channel required. Use a `platform: web` channel when you want a dedicated standalone chatbox link or SDK embed keyed by channel name.

**Correct (one agent, two surfaces):**

```swirls
secret vendor_keys {
  vars: [ OPENROUTER_API_KEY ]
}

agent concierge {
  label: "Concierge"
  secrets: vendor_keys
  provider: openrouter
  model: "openai/gpt-4o-mini"
  maxSteps: 8
  system: @ts {
    return "You are a helpful concierge. Prefer tools over guessing."
  }
}

channel slack_concierge {
  label: "Concierge (Slack)"
  platform: slack
  agent: concierge
  mode: mention
  enabled: true
}

channel web_concierge {
  label: "Concierge (Web)"
  platform: web
  agent: concierge
  enabled: true
}
```

#### Routing uniqueness

For **Slack, Linear, and Discord**, the runtime routes inbound events by the tuple `platform : mode : agent`. Two enabled channels cannot share the same tuple.

For **`platform: web`**, enabled channels are keyed by **channel block name**. Two enabled web channels cannot share the same name. Multiple web channels may bind the same agent.

```swirls
// Valid: same platform + mode, different agents.
channel slack_concierge { platform: slack  agent: concierge  mode: mention }
channel slack_researcher { platform: slack  agent: researcher  mode: mention }
```

```swirls
// Invalid: two enabled bindings for slack:mention:concierge.
channel a { platform: slack  agent: concierge  mode: mention }
channel b { platform: slack  agent: concierge  mode: mention }
```

#### Common mistakes

**`agent` as a quoted string.** Convention is a bare identifier naming an `agent` block (a quoted string parses to the same value, but write it bare).

```swirls
// Convention
channel good { platform: web  agent: concierge }
```

#### Validation diagnostics

- `Channel "<n>" references unknown agent "<a>"` — `agent:` must name a declared `agent` block.
- `Channel "<n>" references unknown connection "<c>"` — `connection:` must name a declared `connection` block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — the connection's `provider` differs from the channel's `platform`.
- `Duplicate channel name: multiple enabled web channels named "<n>"` — rename one web channel or disable it.
- `Duplicate channel routing: multiple enabled bindings for <platform>:<mode>:<agent> (including "<n>")` — for non-web platforms; change `mode`, point one at a different agent, or disable one.
- Parser: `channel platform must be slack, linear, discord, or web` / `channel mode must be mention, dm, or all` — invalid enum value.
- Parser: `channel must declare platform` / `channel must declare agent` — required field missing.
- Parser: `Unknown channel property "<key>"` — channels reject keys outside the documented set (including removed `integration:`).

See `resource-agent` for the `agent` block (including subagent `team`).

---

### Connection Block Declaration

Top-level `connection <name> { }` blocks declare a named, project-scoped, outbound OAuth integration slot (Slack, Linear, ...). The DSL declares the slot by name and provider; a human authorizes the grant in the project's Connections UI. Nodes and channels reference a connection by name, and Swirls brokers a short-lived token at execution time. **No credentials live in the file.**

A connection is the replacement for the removed `cloud` auth type. Use `connection` for a Swirls-brokered grant; use `auth` for credentials you bring yourself (see `resource-auth`).

**There is no `type:` field on a connection block** — the keyword `connection` identifies the block.

#### Syntax

```swirls
connection <name> {
  provider: slack | linear | discord | linkedin | microsoft   // required; bare value
  label: "<optional label>"
  description: "<optional description>"
}
```

`provider` takes a **bare value** by convention (the parser also accepts a quoted string). It is the only required field.

#### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `provider` | yes | Bare value. One of `slack`, `linear`, `discord`, `linkedin`, `microsoft`. |
| `label` | no | Display string shown in the Connections UI. |
| `description` | no | Description shown in the Connections UI. |

#### Providers

```
slack, linear, discord, linkedin, microsoft
```

Providers are drawn from the Swirls integration catalog (currently `slack`, `linear`, `discord`, `linkedin`, `microsoft`), not a fixed DSL enum. A provider whose name is a valid key (letters, digits, underscore, hyphen) but is not yet in the catalog is **not a hard error** — it is a warning. Because `swirls doctor` does not surface warnings, such a connection **passes `swirls doctor` and then fails at deploy**. Use the Connections page to request an unsupported provider.

#### Referencing a connection

A connection is referenced by bare name from three places:

**Integration nodes** (Fabric + provider proxy) via `connection: <name>`. Prefer `action: <actionBlock>` (typed transport from a top-level `action` block); otherwise set `path:` and optional `method` / `params`. Never set `auth:` on integration nodes. See `node-integration` and `resource-action`.

```swirls
node post_slack {
  type: integration
  connection: slack_workspace
  action: slack_post_message
  params: @ts {
    return { channel: "C123", text: "done" }
  }
}
```

**HTTP nodes** via `connection: <name>`. The token is injected into the request at execution time. A node sets **either** `auth` **or** `connection`, never both. Same Fabric binding store as integration nodes.

```swirls
connection slack_workspace {
  label: "Acme Slack"
  provider: slack
}

node post_message {
  type: http
  method: "POST"
  url: "https://slack.com/api/chat.postMessage"
  connection: slack_workspace
  body: @ts {
    return JSON.stringify({ channel: "C123", text: "done" })
  }
}
```

**Channels** via `connection: <name>`. The connection's `provider` must match the channel's `platform`. See `resource-channel`.

```swirls
channel slack_concierge {
  platform: slack
  agent: concierge
  connection: slack_workspace
  mode: mention
}
```

#### Validation diagnostics

- `Connection block name: <msg>` — name must match `^[a-zA-Z0-9_]+$`.
- `Duplicate connection block name "<n>"` — two connection blocks share a name.
- `Connection "<n>" requires a provider` — `provider:` is missing.
- `Connection "<n>" provider "<p>" must be a valid integration provider key (letters, digits, underscore, hyphen) or one of: slack, linear, discord, linkedin, microsoft` — the provider value has an invalid shape (error severity).
- `Connection "<n>" uses provider "<p>" which is not in the Swirls integration catalog. Deploy will fail until this provider is supported — use the Connections page to request it.` — valid key shape but unsupported provider. This is a **warning**, so `swirls doctor` stays green and deploy is where it fails.
- Parser: `connection provider must be a name` / `Unknown connection property "<key>"` / `Expected connection name`.
- `HTTP node references undefined connection "<n>"` — a node's `connection:` value is not a declared connection block.
- `"connection" is only valid on http and integration nodes` — `connection:` appears on an unsupported node type.
- `Node "<n>": set "auth" or "connection", not both. Use "auth" for your own credentials, "connection" for a Swirls-brokered grant.` — a node set both fields.
- `Channel "<n>" references unknown connection "<c>"` — a channel's `connection:` value is not a declared connection block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — the connection provider differs from the channel platform.

Token exchange and header injection are platform concerns; the DSL validates references and the provider value.

---

### Role and Policy Blocks

Two top-level blocks define identity-scoped access control for agents: `role <name> { }` (derive a named role from verified principal attributes) and `policy { }` (grant or deny roles access to agents and their workflows/tools). There is no separate enforcement switch: **declaring a `policy` with at least one grant flips the project to deny-by-default**. A project with roles but no policy grants stays open within the organization.

There is no `access { }` block. It was removed; writing one is a parse error.

#### `role <name> { }` — claim matching

Derives a named role from verified principal attributes. Conditions inside `match { }` AND together.

```swirls
role admins {
  description: "Org admins"
  match {
    org_role: admin
  }
}

role engineers {
  match {
    department: ["engineering", "platform"]   // list value = membership ("in")
    employment: fulltime                       // scalar value = equality ("eq")
  }
}
```

- `match { <claim>: <value> }` — a scalar value (bare identifier, string, number, or boolean) is an equality test; an array value is a membership test.
- Role names must match `^[a-zA-Z0-9_]+$`. Duplicate role names error: `Duplicate role name "<n>"`.
- An empty `match { }` warns: `Role "<n>" has an empty match { } and will match no principal`.
- `description:` is optional.

#### `policy { }` — grants

A nameless block containing one or more grant lines of the form `allow|deny <role> -> agent <name>|*`, each with an optional body narrowing the grant.

```swirls
policy {
  allow admins -> agent *

  allow engineers -> agent concierge {
    workflows: [search_kb, escalate]
    tools: [search_kb]
  }

  deny contractors -> agent billing_bot
}
```

- `<role>` is a bare identifier naming a `role` block.
- The target is `agent <name>` (a declared `agent` block) or `agent *` (every agent).
- An omitted body grants all of the agent's workflows and tools. `workflows: [ … ]` and `tools: [ … ]` are bare-identifier arrays that narrow the grant.
- A grant flips the project to deny-by-default: principals matching no granting role are denied. `deny` wins over `allow` for the same agent; a principal matching multiple roles gets the union of their grants. An empty `policy { }` (no grants) enforces nothing.
- Parse errors: `Expected role name after `allow``, `Expected `->` after role name`, `Expected `agent` after `->``, `Expected an agent name or `*``, `Expected `allow` or `deny` in policy block`.

#### Notes

- `role`, `match`, `policy`, `allow`, and `deny` are lexer keywords. `access` is not a keyword.
- `policy` blocks take no name; `role` blocks are named.
- The arrow in a grant is the same `->` token used by flow edges and trigger bindings.
- Top-level `role` (who may invoke an agent) is distinct from the agent-nested `profile` (what the agent may do when it runs).

---

### Action Block Declaration

Top-level `action <name> { }` blocks declare a typed integration operation: provider, HTTP transport, and optional input/output JSON schemas. Integration nodes reference an action by bare identifier and inherit transport + typing from the block at deploy time.

Use `swirls add <provider> [items...]` to pull prebuilt action blocks from the registry into `swirls/integrations/<provider>/`. Installed actions are tracked in `swirls.lock.json` (source, version, sha256).

#### Syntax

```swirls
action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  description: "Post a message to a channel"
  scopes: ["chat:write"]
  input: @json { { "type": "object", "required": ["channel", "text"], "properties": { ... } } }
  output: @json { { "type": "object", "required": ["ok"], "properties": { ... } } }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `provider` | yes | Must match a Fabric provider (`slack`, `linear`, …) and the bound connection's `provider`. |
| `method` | yes | `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. |
| `path` | yes | Provider API path (leading `/` optional). |
| `encoding` | no | `json` (default), `form`, or `query`. |
| `input` / `output` | no | Inline `@json`, object literal, or bare `schema` name. |
| `scopes` | no | OAuth scopes required by the action. |
| `label`, `description` | no | Display metadata. |

#### Integration node reference

```swirls
connection team_slack { provider: slack }

node post_slack {
  type: integration
  connection: team_slack
  action: slack_post_message
  params: @ts { return { channel: "C1", text: "hi" } }
}
```

When `action:` is set, do **not** set `method` or `path` on the node — deploy inlines transport from the action block. Prefer `action:` over raw `path:` for typed `params` and output.

#### Registry

- In-repo seed: `registry/index.json` + provider action files.
- CLI: `swirls add slack` (all items) or `swirls add slack post_message`.
- Override registry URL: `--registry` or `SWIRLS_REGISTRY_URL`.

See `node-integration` and `resource-connection`.


# 9. Streams

### Persistence Is Top-Level Stream, Not a Block

The old `persistence { }` block inside a workflow has been **removed** from the language. Do not use it. The parser emits a hard error: `persistence { } blocks have been removed — use a top-level stream block instead`.

Replace persistence with a top-level `stream <name> { }` declaration that references the workflow by name.

**Incorrect (uses the removed persistence block):**

```swirls
workflow submissions {
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
workflow submissions {
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
  workflow: submissions
  version: v1

  versions: {
    v1 {
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
  }
}
```

#### Key differences from the old persistence block

| Old persistence | New top-level stream |
|-----------------|----------------------|
| Inside `workflow { }` | Top-level block `stream <name> { }` |
| Single implicit shape | **One or more `versions:`**, each with an explicit, required `schema` |
| No version pointer | **Required `version:`** names the active writer version |
| No mapping layer | **Required `prepare: @ts { ... }` per version** returns the shape |
| `condition:` optional | `condition:` optional per version (must be non-empty if given) |
| Stream name defaulted to workflow name | Stream has its own `<name>`; multiple streams can reference one workflow |
| Context accessed via `context.nodes` | `prepare` / `condition` access `context.output.<leafNode>` plus `context.nodes` |

#### Why it changed

The old model coupled "what to store" to the workflow definition. The new model separates concerns: workflows produce outputs, and one or more top-level stream blocks each decide whether and how to persist those outputs. This lets you add, remove, or re-shape persistence without editing the workflow, and lets multiple streams tap the same workflow output with different schemas and conditions.

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
  version: v1
  filter: @ts {
    return {
      score: { gte: 80 }
    }
  }
}
```

A `type: stream` node also requires a `version:` pin (the `versions:` key on the stream block). See `node-stream`.

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

Stream filters reference two kinds of fields uniformly: system columns and the payload fields of the persisted record. The runtime decides which is which — you just use the key name. (Filter fragments below live inside a `type: stream` node, which also needs `stream:` and `version:` — see `node-stream`.)

#### System columns

These are the first-class columns exposed on every stream row.

| Name | Type | Meaning |
|------|------|---------|
| `id` | identifier | Row id. |
| `created_at` | timestamp | When the row was persisted. |
| `deployment_id` | string | Deployment that wrote the row. |
| `workflow_execution_id` | string | Execution that produced the row. |

Use them directly in the filter object:

```swirls
filter: @ts {
  return {
    created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
  }
}
```

System columns are filterable but are **stripped from the returned rows** — a queried row contains only your payload fields.

#### Payload fields

Every other key in the filter is a field of the persisted record — the shape your version's `prepare:` returned (and described by that version's `schema`). Filter on the same top-level key names your `prepare` produced; the runtime maps them to the matching column (camelCase keys are matched case-insensitively against their snake_case column).

If your version's `prepare` returns `{ email, name, score }`, filter on `email`, `name`, `score`:

```swirls
filter: @ts {
  return {
    score: { gte: 80 },
    email: { like: "%@example.com" }
  }
}
```

#### Conventions

- The shape of each persisted record is fully controlled by the version's `prepare` return value and described by that version's `schema`. Think of the filter as filtering the prepared record, not a workflow's raw node outputs.
- Reads are pinned to one `version`, so filter fields must exist in **that version's** schema/prepared shape. Different versions can expose different fields.
- If you need to filter on multiple node outputs, combine them inside `prepare` so the persisted record exposes the fields you want.
- `like` uses SQL `LIKE` semantics — `%` is the wildcard. No regex.

#### Legacy column names

If you see older examples using `"root.field"` or other dotted column names in SQL strings, those apply to the removed SQL-query form of stream nodes. They do not apply to filters. Filter keys are flat top-level names only.

See `node-stream` for the full filter API and `resource-stream` for declaring versions.


# 10. Reviews

### Review Block Configuration

Review blocks pause workflow execution at a node and wait for human input. The reviewer sees the node's output and fills in a form defined by the review schema, then picks an action with an outcome of `approve` or `reject`.

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


# 11. Parser Pitfalls & Validator Diagnostics

### Stray Characters at DSL Level Stop Tokenization

The lexer recognizes a fixed character set at DSL level (identifiers, numbers, strings, braces, brackets, `:`, `,`, `.`, `*`, `->`, `-["…"]->`, negative numbers, `@ts`/`@json`/`@sql`, comments). Any other character **outside** a comment, string, or fenced block makes the lexer stop. Everything after it is **silently dropped** — no error, `swirls doctor` just reports fewer workflows.

**Incorrect (stray Unicode between declarations):**

```swirls
workflow a { label: "A" root { type: code code: @ts { return {} } } }
→
workflow b { label: "B" root { type: code code: @ts { return {} } } }
```

Workflow `b` is silently dropped.

**Incorrect (unquoted hyphenated key — the `-` desyncs the lexer):**

```swirls
headers: { Content-Type: "application/json" }
```

See `parser-hyphenated-headers`.

#### Where Unicode IS safe

- **Comments** (`//` and `/* */`) — any characters, including box-drawing, arrows, and em dashes, parse fine.
- **String literals** — `label: "café → done"` is fine.
- **Inside `@ts { }` / `@json { }` / `@sql { }` bodies** — the fenced scanner only tracks braces, strings, and comments; other characters pass through.

The hazard is only a character the lexer does not recognize in a **DSL-level token position** (between declarations, between fields, in place of a value).

**How to detect:** compare `swirls doctor` counts against what you defined. If items are missing, the cutoff point is at or just after the last item that survived — look there for a stray character.

---

### Hyphenated Keys in DSL Object Literals

DSL-level object literals (like a plain `headers: { ... }` value) cannot carry hyphenated keys. The two failure modes differ:

- **Unquoted** `Content-Type:` — the lexer reads `Content`, then hits a stray `-` it cannot tokenize and **stops**. Everything to EOF is silently dropped (workflows, triggers, resources after this point disappear with no error).
- **Quoted** `"Content-Type":` — DSL object keys must be bare identifiers; a quoted key is rejected. The parser emits `Unexpected token` errors and the object value ends up **empty** (your headers are silently lost), though later declarations recover.

Either way the headers are broken. Use a `@ts` block instead.

**Incorrect (unquoted hyphenated key — truncates the file):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: { Content-Type: "application/json" }
}
```

**Incorrect (quoted hyphenated key — headers parse to an empty object):**

```swirls
headers: { "Content-Type": "application/json" }
```

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
      "x-api-key": context.secrets.api_creds.API_KEY,
      "Authorization": "Bearer " + context.secrets.api_creds.AUTH_TOKEN
    }
  }
  body: @ts {
    return JSON.stringify({ query: context.nodes.root.output.query })
  }
}
```

Inside a `@ts` block, header keys are JavaScript string literals — the lexer never sees the hyphens. This is the only safe way to set custom headers with hyphenated keys.

**Also correct (omit headers if defaults suffice):**

HTTP nodes default to JSON content type. If you don't need custom headers, simply omit the `headers` field entirely.

---

### Parser Silently Drops Workflows

Some invalid input makes the lexer or parser stop or skip without emitting an error. `swirls doctor` reports success but with fewer workflows/forms/triggers than expected.

**How to detect:** Always compare the doctor summary counts against what you defined. If doctor reports 2 workflows but you wrote 4, something silently dropped 2.

**Causes of silent drops:**

1. **Regex literals containing quote characters inside `@ts` blocks** — the scanner mistakes the quote for a string boundary and consumes everything to the next quote. See `ts-regex-literals`.

2. **Stray characters at DSL level** — a character the lexer does not recognize (stray Unicode, an unquoted hyphen in an object key) outside comments/strings/fenced blocks stops tokenization; the rest of the file is dropped. See `parser-illegal-characters` and `parser-hyphenated-headers`.

3. **`inputSchema` or `outputSchema` on a non-root node** — the parser emits an error but also **drops the whole node**, which then cascades into "Edge references non-existent node" diagnostics.

4. **Unbalanced braces in `@ts` / `@json` / `@sql` blocks** — the fenced scanner brace-balances to find the end of the block; an extra `{` swallows following declarations into the block.

**Not hazards (parse correctly):** nested template literals, `$${...}`, double-quote characters inside properly quoted strings, and Unicode inside comments or string literals.

**Debugging steps:**

1. Run `bunx swirls doctor` and note the counts
2. Count the forms, workflows, and triggers you defined
3. If counts don't match, binary-search by commenting out halves of the file
4. Check the section above the first missing item for the patterns above
5. Fix and re-run doctor

The issue is always in or before the first missing item, never after it.

---

### Parse Errors Cascade Past the Actual Problem

A single syntax issue causes the parser to lose its place. The reported line number is often after the actual problem. When you see "Unexpected token: expected form, webhook, schedule, graph, workflow, stream, view, trigger, secret, auth, connection, action, postgres, disk, agent, channel, schema, role, or policy", look above the reported line.

**Common causes of cascading errors:**

1. Mismatched braces in `@ts`, `@json`, or `@sql` blocks
2. Misplaced schema keys (`inputSchema`/`outputSchema` on a non-root node) — the node is dropped, then its edges fail
3. Quoted keys with special characters in DSL object literals (use a `@ts` block instead)
4. Regex literals containing quote characters inside `@ts` blocks
5. A missing `{` or `}` on a block declaration

**Debugging strategy:**

When doctor reports an error at line N, look at lines 1 through N for:
- Unbalanced `{` and `}` in fenced blocks
- Any of the silent-drop patterns (see `parser-silent-drops`)
- Unrecognized field names or misplaced keys on nodes

The actual problem is usually 5-50 lines above the reported line.

---

### Pre-Flight Validation Checklist

Before running `swirls doctor`, verify every item on this checklist. Each item corresponds to a known lexer hazard or validation failure.

**Parser safety (silent drops):**

- [ ] No regex literals containing `"`, `'`, or backtick characters inside `@ts` blocks (build with `new RegExp(...)` / `String.fromCharCode` instead)
- [ ] No stray Unicode or other unrecognized characters at DSL level (comments and strings are fine)
- [ ] No `headers` field using plain object literals with hyphenated keys (use a `@ts` block instead)
- [ ] No nested `@ts` or `@json` blocks inside other code blocks (use a single block that returns the full object)
- [ ] Braces balanced in all `@ts { }`, `@json { }`, and `@sql { }` blocks
- [ ] No `inputSchema`/`outputSchema` on non-root nodes (the parser drops the whole node)

**Structure validation:**

- [ ] Every `workflow` has exactly one `root { }` block
- [ ] Every `workflow` has a `label` field
- [ ] `flow { }` edges only reference defined node names
- [ ] No cycles in edges
- [ ] No self-referencing edges

**Node validation:**

- [ ] Every `email` node has `from`, `to`, and `subject` fields
- [ ] Every `scrape` node has a `url` field
- [ ] Every `ai` node has a `kind` field (and `model` + `prompt` for a working call; `schema` for `kind: object`)
- [ ] Every `agent` node has `agent` and `prompt` fields, and any `profile:` matches a profile in the bound agent block
- [ ] Every `code` node has a `code` field
- [ ] Every `switch` node has `cases` and `router` fields
- [ ] Every `http` node has a `url` field
- [ ] Every `workflow` node has `workflow` and `input` fields
- [ ] Every `bucket` node has an `operation` field
- [ ] Every `disk` node has `disk` and `command` fields
- [ ] Every `map` node has `items`, `maxItems`, and exactly one of `subgraph { }` or `workflow:`
- [ ] Every `while` node has `input`, `condition`, `update`, `maxIterations`, and exactly one of `subgraph { }` or `workflow:`
- [ ] Every `stream` node has `stream`, `version`, and `filter`
- [ ] Every `postgres` node has a `postgres` field and exactly one of `select` or `insert`
- [ ] Every `postgres` node with `insert` has a `params` field

**Cross-references (resolved across the workspace — all `.swirls` files under the working directory):**

- [ ] Workflows referenced by `type: workflow` / `map` / `while` nodes are declared somewhere in the workspace
- [ ] Trigger bindings reference declared resources and workflows
- [ ] `postgres:` / `disk:` / `agent:` / `stream:` node fields name declared top-level blocks
- [ ] Secret keys use only `[a-zA-Z0-9_]` characters

**File references:**

- [ ] All `@ts "path.ts.swirls"` references point to files that exist on disk (doctor validates this)

**Schema validation:**

- [ ] `@json` blocks contain valid JSON (double-quoted keys, no trailing commas)
- [ ] Bare schema names (`inputSchema: foo`) resolve to a top-level `schema foo { }` block

**After running doctor:**

- [ ] Doctor summary counts match the number of forms/workflows/triggers you defined
- [ ] No unexpected warnings about unused schemas or types

**A clean `swirls doctor` is not a clean deploy.** `swirls doctor` reports only **error**-severity diagnostics; it does not print **warnings**. Several conditions are warnings, so they pass doctor and only fail (or silently misbehave) at deploy or in the editor LSP. Known warning-only cases to check by eye:

- A `connection` whose `provider` is a valid name but not in the Swirls integration catalog (deploy fails).
- A `postgres` block with a literal (non-secret) connection string.
- A `webhook` declaring neither a shared `secret:` nor a `header:`.
- An unused top-level `schema` block.

When deploy fails but doctor was green, suspect a warning-level issue and check it in the LSP or deploy output.

---

### Validator Diagnostics Cheatsheet

Every error and warning the validator can emit, grouped by category. Use this as a pre-flight checklist to avoid `swirls doctor` rejecting your file.

#### Naming (applies to all resources and nodes)

- `<Kind> name: Name must contain only letters, numbers, and underscores` — The name contains a hyphen, dot, space, or other char. Fix to `^[a-zA-Z0-9_]+$`.
- `Duplicate <kind> name "<n>"` — Two declarations share a name. Rename one.

#### Workflows

- `Workflow must have exactly one root node (no incoming edges), but none were found. Check for cycles.` — The DAG has no entry point. Add `root { }` or break the cycle.
- `Workflow must have exactly one root node, but found N: a, b, ...` — More than one node has no incoming edges. Connect them or remove the extras.
- `Workflow must declare root { } as the entry node; the node with no incoming edges must be the root block (found "<n>" instead).` — The entry node exists but was declared `node foo { }` instead of `root { }`. Rename to `root`.
- `Workflow contains a cycle - DAG workflows cannot have cycles` — Some edge points backwards. Remove it or route through a new node.
- `Duplicate node name "<n>" in workflow` — Two nodes in the same workflow share a name.
- `Edge references non-existent source node "<n>"` / `Edge references non-existent target node "<n>"` — Typo, or the node was dropped due to a parse error. Check spelling; check that the node block wasn't rejected.
- `Edge cannot connect a node to itself` — Self-loop. Remove.

#### Nodes (general)

- `Invalid node type "<t>". Must be one of: agent, ai, bucket, code, disk, email, http, integration, map, parallel, postgres, scrape, stream, switch, wait, while, workflow` — Unknown type name. Use one of the 17. (`graph` is accepted as a legacy alias and normalized to `workflow`, so it never trips this error.)
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

- `Auth block "<n>" requires type: oauth, api_key, basic, or bearer` — Missing or invalid `type:`. (The `cloud` type has been removed; use a `connection` block.)
- `Auth "<n>" references undefined secret block "<s>"` — `secrets:` names a block that does not exist.
- `Auth "<n>" field "<f>" must reference a var from secret block "<s>"` — A field like `client_id: FOO` but `FOO` is not in that secret block's `vars:`.
- `Auth type oauth requires "<f>"` (grant_type / client_id / client_secret / token_url), `Auth type api_key requires "key"`, `Auth type api_key requires "header" or "query_param"`, `Auth type basic requires "<f>"` (username / password), `Auth type bearer requires "token"` — type-specific required fields.

#### Connection blocks

- `Connection block name: <msg>` — name must match `^[a-zA-Z0-9_]+$`.
- `Duplicate connection block name "<n>"` — two connection blocks share a name.
- `Connection "<n>" requires a provider` — `provider:` is missing.
- `Connection "<n>" provider "<p>" must be one of: slack, linear, discord, linkedin, microsoft` — unsupported provider.
- Parser: `connection must declare provider` / `connection provider must be a name` / `Unknown connection property "<key>"` / `Expected connection name`.

#### HTTP / auth / connection usage

- `HTTP node references undefined auth block "<b>"` — Node's `auth:` value is not a declared auth block.
- `"auth" is only valid on http nodes` — You put `auth:` on a non-http node (code, ai, etc.). Remove it.
- `HTTP node references undefined connection "<n>"` — Node's `connection:` value is not a declared `connection` block.
- `"connection" is only valid on http nodes` — You put `connection:` on a non-http node. Remove it.
- `Node "<n>": set "auth" or "connection", not both. Use "auth" for your own credentials, "connection" for a Swirls-brokered grant.` — Drop one of the two.

#### Stream nodes (read side)

Required keys: `stream`, `version`, `filter`.

- `streamId is no longer supported on stream nodes; use stream (stream block name)` — Rename `streamId:` to `stream:` with a bare identifier.
- `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)` — Replace with `filter: @ts { return { ... } }`.
- `Stream node references stream block "<n>" which is not defined` — `stream:` names a block that does not exist in the file or workspace.
- `Stream node "version" must be a valid stream version id (e.g. v1), got "<v>"` — `version:` must match `^v[1-9][0-9]*$`.
- `Stream node pins version "<v>" but stream "<n>" does not declare that version under versions { }` — Pin a `version:` that the stream block actually declares.
- `Stream node filter must be a non-empty @ts block` — `filter: @ts { }` is empty. Return at least `{}`.
- `Stream node "filter" must be an @ts block or @ts "file.ts.swirls" reference` — You used a plain value for `filter:`.

#### Stream top-level block (write side)

`schema`, `condition`, and `prepare` live **inside a `versions:` entry**, never at the top level.

- `Duplicate stream name "<n>"` — Two stream blocks share a name.
- `Stream block requires "workflow" (workflow name)` — Add `workflow: <workflow_name>`.
- `Stream references workflow "<n>" which is not defined` — Fix the workflow name (file or workspace).
- `Stream "<n>" requires "version" (active writer)` — Add the block-level `version:` pointer.
- `Stream "<n>" version pointer "<v>" is invalid — use v1, v2, …` — Pointer must match `^v[1-9][0-9]*$`.
- `Stream "<n>" requires a non-empty versions { } block` — Declare at least one `versions: { v1 { … } }` entry.
- `Stream "<n>" version "<v>" is not declared under versions { }` — The `version:` pointer must name a declared version key.
- `Stream "<n>" declares duplicate version key "<v>"` — Each version key must be unique.
- `Stream "<n>" version key "<v>" is invalid — use v1, v2, …` — Version keys match `^v[1-9][0-9]*$`.
- `Stream "<n>" version "<v>" has no schema; add schema: @json { … } or schema: <name>` — Each version requires a schema (error, not a warning).
- `Stream "<n>" version "<v>" requires "prepare" (@ts { } or @ts "…")` — Add a `prepare` to that version.
- `Stream "<n>" version "<v>": prepare requires a non-empty @ts block or @ts "path.ts.swirls"` — Give `prepare` a body.
- `Stream "<n>" version "<v>": condition requires a non-empty @ts block or @ts "path.ts.swirls"` — Remove `condition:` or give it a body.
- Parser: `top-level "<key>" is invalid on stream blocks — use versions { v1 { schema, condition?, prepare } }` — You put `schema` / `condition` / `prepare` at the top level. Move them inside a version entry.
- Parser: `Unexpected key "<key>" in stream versions block — only schema, condition, and prepare are allowed` — Remove the stray key from the version entry.

#### Parallel nodes

- `Parallel "operation" must be "search", "extract", or "findall", got "<v>"` — Invalid op.
- `Parallel search requires "searchQueries"` / `Parallel extract requires "urls"` / `Parallel findall requires "entityType" / "generator" / "matchConditions" / "matchLimit"` — Missing op-specific field.

#### Vendor-managed schemas

- `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.` — You set `schema:` on `scrape`, `parallel`, `email`, or `disk`. Remove it.

#### AI nodes

- `Invalid ai kind "<k>". Must be one of: text, object, image, video, embed` — Fix the `kind:` value.
- Warning: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` — Either drop the schema or change kind.

#### Workflow (subworkflow) nodes

- `Workflow node requires "workflow"` — Add `workflow: <name>`.
- `Workflow node references workflow "<n>" which is not defined` — Fix the name or declare the child workflow.

#### Map / while nodes

- `Node type "map" requires "items" / "maxItems"` — Required field missing.
- `Node type "while" requires "input" / "condition" / "update" / "maxIterations"` — Required field missing.
- `map node requires maxItems as a positive number` — Add `maxItems: <n>` with `n > 0`.
- `map node concurrency must be a positive integer when set` — Fix to a positive integer or remove `concurrency:`.
- `while node requires maxIterations as a positive integer` — Add `maxIterations: <n>` with `n` an integer ≥ 1.
- `map node requires exactly one of subgraph { } or workflow: <name>` — You set both, or neither. Pick one.
- `while node requires exactly one of subgraph { } or workflow: <name>` — Same — pick one.
- `Node references workflow "<n>" which is not defined` — `workflow: <n>` does not match a workflow in the workspace.
- `map/while subgraph root must declare inputSchema for typed iteration` — Add `inputSchema` (inline @json, object literal, or bare schema name) to the inline `subgraph { }` root or the referenced workflow's root.
- Parser error: `Expected { after subgraph` — Don't put a colon between `subgraph` and `{`.
- Parser error: `label is not valid inside subgraph { }` / `description is not valid inside subgraph { }` — Subgraphs don't take their own label/description.

#### Forms

- Parser error: `Expected \`:\` after \`visibility\`` — `visibility` is a key:value field; the colon is required.
- Parser error: `Expected \`public\` or \`internal\` after \`visibility:\`` — The value must be a bare identifier, not a quoted string.
- Parser error: `Invalid visibility "<x>"; expected \`public\` or \`internal\`` — Only those two values are valid.
- Parser error: `Expected auth block name (bare identifier) after \`auth:\`` — Form `auth:` takes a bare identifier.
- `Form "<n>" references undefined auth block "<a>"` — `auth:` must name a declared `auth` block.
- `Form "<n>" auth block "<a>" must have type \`basic\` (found \`<t>\`)` — Only basic auth blocks can gate forms.

#### Webhooks (authentication)

- Warning: `Webhook "<n>" has no "secret" or "header" set and will accept any POST without verification.` — Add `secret: <block>.<VAR>` and `header: "X-..."` to require verification, or accept the warning for an explicitly unauthenticated endpoint.
- `Webhook "<n>" has "secret" but is missing "header"` / `Webhook "<n>" has "header" but is missing "secret"` — Both must be set together.
- `Webhook "<n>" header name must not be empty` — Trim/non-blank required.
- `Webhook "<n>" header "<name>" is reserved and cannot be used for authentication. Choose a custom header name.` — Pick a custom header (e.g. `X-Webhook-Signature`).
- `Webhook "<n>" references undefined secret block "<block>"` — Declare the `secret <block> { vars: [...] }`.
- `Webhook "<n>" references var "<VAR>" not declared in secret block "<block>"` — Add `VAR` to the block's `vars:`.
- Parser error: `Expected secret block name (e.g. my_secret.VAR)` — `secret:` uses dot notation: `secret: my_secret.VAR`. No quotes.
- Parser error: `Expected "." after secret block name` — Same — dot notation required.
- Parser error: `Expected quoted header name` — `header:` value must be a `"quoted"` string.

#### Schema (top-level `schema` block)

- `Schema name: Name must contain only letters, numbers, and underscores` — Rename to match `^[a-zA-Z0-9_]+$`.
- Schema reference resolution errors come from `validateSchemaFieldRefs` — they fire when `inputSchema: <name>`, `outputSchema: <name>`, `schema: <name>` (on form/webhook/node), or `review: { schema: <name> }` references a name with no matching `schema <name> { }` block in the workspace.

#### Postgres (top-level block)

- `Postgres block requires a connection field` — Add `connection:`.
- Warning: `Postgres connection contains a plaintext string. Use a secret identifier for production deployments.` — Move the URL into a secret.
- `Invalid connection secret key (use only letters, digits, and underscore)` — Bare `connection:` identifiers must match the secret key pattern.
- `Postgres "<n>" connection "<c>" must reference a var from secret block "<s>"` — When `secrets:` is set, the bare `connection:` var must appear in that block's `vars`.
- `Postgres "<n>" references undefined secret block "<s>"` — `secrets:` names a missing block.
- `Postgres block must declare at least one table` — Add a `table <name> { schema: @json { ... } }`.
- `Duplicate table name "<t>" in postgres block` — Rename one.
- `Table "<t>" requires a schema` — Each table needs a JSON Schema.
- `Duplicate postgres block name "<n>"` — Two blocks share a name.

#### Postgres nodes

- `Postgres node requires a "postgres" field` — Add `postgres: <block_name>`.
- `Postgres node references undefined postgres block "<b>"`.
- `Postgres node cannot have both "select" and "insert"` / `Postgres node requires exactly one of "select" or "insert"` — Use exactly one.
- `Postgres insert node requires a "params" (@ts block)` — Inserts always need params.
- `Postgres select must be a SELECT statement` (SELECT or WITH) / `Postgres insert must be an INSERT statement`.
- `Table "<t>" is not declared in postgres block "<b>"` — Every table in the SQL must appear in the block's `table { }` declarations.
- `Column "<c>" is not declared on table "<t>" in postgres block "<b>"` — Explicit `INSERT INTO t (col1, …)` columns must exist on the declared table schema.
- `Postgres INSERT VALUES clause must wrap row values in parentheses, e.g. VALUES ({{key}})`.
- `SQL placeholder "{{<k>}}" has no matching key in params return object` — Every `{{key}}` must be a key of the object `params:` returns. (Extra params keys are not flagged.)
- `condition is only valid on postgres insert nodes` / `condition must be a @ts block`.

#### Triggers

- `Trigger references <type> "<n>" which is not defined`.
- `Trigger references workflow "<g>" which is not defined`.

#### Review

- `review: <path> — <message>` — The review block didn't match the schema (e.g. bad action outcome, missing required field). Fix per the message.

#### Agents (and subagent teams)

- `Duplicate agent block name "<n>"` — Two `agent` blocks share a name.
- `Invalid agent provider "<p>". Must be one of: openrouter, anthropic, openai, google` — Fix the `provider:` value.
- `Agent block requires a non-empty model field` — Add `model: "..."`.
- `Agent "<n>" references undefined secret block "<b>"` — `secrets:` must name a declared `secret` block.
- `Agent "<n>" secret block must declare "<VAR>" for provider "<p>"` — The provider needs its vendor key (e.g. `OPENROUTER_API_KEY`) listed in the referenced secret block's `vars`.
- `Workflow "<n>" is used as an agent tool but the workflow-level description field is missing or empty` — A tool workflow needs a non-empty top-level `description:`.
- `Agent tool workflow "<n>" must declare inputSchema on the root node` — Add `inputSchema` to the tool workflow's `root`.
- `Agent tool workflow "<n>" root inputSchema must declare a non-empty properties object. Add at least one input property so the agent can call the tool.` — Tool input schemas need at least one property.
- `Agent tool workflow "<n>" requires output schema on leaf node "<leaf>"` — Every leaf node of a tool workflow needs a `schema`/`outputSchema`. AI leaves with `kind` other than `object` (`text`, `embed`, `image`, `video`) are exempt: their output is inferred from the kind, so they need no schema.
- `Agent "<n>" cannot include itself in team:` — Remove the self-reference.
- `Agent "<n>" team member "<m>" is not defined in the workspace` — `team:` must name declared `agent` blocks.
- `Agent "<n>" team member "<m>" conflicts with a workflow tool of the same name` — A `team` member and a `tools` workflow share a name; rename one.
- `Agent team contains a cycle: a -> b -> a` — Subagent delegation must not form a loop.
- `Agent "<n>": wallet requires budget as a positive number` — Add `budget:` with a value `> 0`.
- `Agent "<n>": wallet.budget must be a positive number` — Fix the budget value.
- `Agent "<n>": wallet requires cadence (daily, weekly, or monthly)` — Add `cadence:`.
- `Agent "<n>": wallet.cadence must be daily, weekly, or monthly` — Fix the cadence value.
- `Agent "<n>": wallet.maxPerCall must be a positive number` — Fix `maxPerCall` when set.
- `Agent "<n>": wallet.maxPerCall must be less than or equal to wallet.budget` — Lower `maxPerCall` or raise `budget`.

#### Channels

- `Channel "<n>" references unknown agent "<a>"` — `agent:` must name a declared `agent` block.
- `Channel "<n>" references unknown connection "<c>"` — `connection:` must name a declared `connection` block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — The connection's `provider` differs from the channel's `platform`.
- `Duplicate channel routing: multiple enabled bindings for <platform>:<mode>:<agent> (including "<n>")` — Two enabled channels share the same `platform : mode : agent` tuple. Change `mode`, point one at a different agent, or set `enabled: false` on one.
- Parser: `channel platform must be slack, linear, discord, or web` / `channel mode must be mention, dm, or all` / `channel must declare platform` / `channel must declare agent` / `Unknown channel property "<key>"` — invalid field or removed `integration:`.

#### Output format (`format:` on nodes)

- `Invalid output format "<f>". Use one of: markdown, html, text, image, video, audio, mixed, json.` — Fix the `format:` value (bare identifier).
- `Output schema is incompatible with format "<f>" (expect top-level string, a { markdown | html | text | url } string field, or contentMediaType hint).` — The node's resolved output schema cannot be projected into the declared format. `json` and `mixed` are always compatible.

#### Access control (`role` / `policy`)

- `Duplicate role name "<n>"` — Two `role` blocks share a name.
- Warning: `Role "<n>" has an empty match { } and will match no principal` — Add at least one claim condition.
- Parser: `Expected role name after \`allow\`` / `Expected \`->\` after role name` / `Expected \`agent\` after \`->\`` / `Expected an agent name or \`*\`` / `Expected \`allow\` or \`deny\` in policy block` — Grant lines are `allow|deny <role> -> agent <name>|*`.
- There is no `access { }` block; writing one is a parse error (it is not a keyword).

