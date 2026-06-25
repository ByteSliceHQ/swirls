---
title: Validator Diagnostics Cheatsheet
impact: CRITICAL
tags: parser, validator, diagnostics, errors, warnings, reference
---

## Validator Diagnostics Cheatsheet

Every error and warning the validator can emit, grouped by category. Use this as a pre-flight checklist to avoid `swirls doctor` rejecting your file.

### Naming (applies to all resources and nodes)

- `<Kind> name: Name must contain only letters, numbers, and underscores` — The name contains a hyphen, dot, space, or other char. Fix to `^[a-zA-Z0-9_]+$`.
- `Duplicate <kind> name "<n>"` — Two declarations share a name. Rename one.

### Workflows

- `Workflow must have exactly one root node (no incoming edges), but none were found. Check for cycles.` — The DAG has no entry point. Add `root { }` or break the cycle.
- `Workflow must have exactly one root node, but found N: a, b, ...` — More than one node has no incoming edges. Connect them or remove the extras.
- `Workflow must declare root { } as the entry node; the node with no incoming edges must be the root block (found "<n>" instead).` — The entry node exists but was declared `node foo { }` instead of `root { }`. Rename to `root`.
- `Workflow contains a cycle - DAG workflows cannot have cycles` — Some edge points backwards. Remove it or route through a new node.
- `Duplicate node name "<n>" in workflow` — Two nodes in the same workflow share a name.
- `Edge references non-existent source node "<n>"` / `Edge references non-existent target node "<n>"` — Typo, or the node was dropped due to a parse error. Check spelling; check that the node block wasn't rejected.
- `Edge cannot connect a node to itself` — Self-loop. Remove.

### Nodes (general)

- `Invalid node type "<t>". Must be one of: agent, ai, bucket, code, disk, email, http, integration, map, parallel, postgres, scrape, stream, switch, wait, while, workflow` — Unknown type name. Use one of the 17. (`graph` is accepted as a legacy alias and normalized to `workflow`, so it never trips this error.)
- `Node type "<t>" requires "<field>"` — Missing required field. See the node-type rule for the required set.

### Secrets map

- `Invalid secret block key "<k>" in secrets map (use only letters, digits, and underscore)` — Hyphen or bad char in a block name in the node's `secrets:` map.
- `Node references undefined secret block "<b>" in secrets map` — The block is not declared at the top level.
- `Invalid secret var "<v>" for block "<b>"` — Hyphen or bad char in a listed var.
- `Secret block "<b>" has no var "<v>" (declared vars: ...)` — You listed a var the secret block does not declare. Add it to `vars:` or remove it from the map.

### Secret blocks

- `Invalid var "<v>" in secret block (use only letters, digits, and underscore)` — Hyphen or bad char in the secret block's `vars:`.
- `Duplicate var "<v>" in secret block "<n>"` — A var appears twice in the same block's `vars:`.

### Auth blocks

- `Auth block "<n>" requires type: oauth, api_key, basic, or bearer` — Missing or invalid `type:`. (The `cloud` type has been removed; use a `connection` block.)
- `Auth "<n>" references undefined secret block "<s>"` — `secrets:` names a block that does not exist.
- `Auth "<n>" field "<f>" must reference a var from secret block "<s>"` — A field like `client_id: FOO` but `FOO` is not in that secret block's `vars:`.
- `Auth type oauth requires "<f>"` (grant_type / client_id / client_secret / token_url), `Auth type api_key requires "key"`, `Auth type api_key requires "header" or "query_param"`, `Auth type basic requires "<f>"` (username / password), `Auth type bearer requires "token"` — type-specific required fields.

### Connection blocks

- `Connection block name: <msg>` — name must match `^[a-zA-Z0-9_]+$`.
- `Duplicate connection block name "<n>"` — two connection blocks share a name.
- `Connection "<n>" requires a provider` — `provider:` is missing.
- `Connection "<n>" provider "<p>" must be one of: slack, linear, discord, linkedin, microsoft` — unsupported provider.
- Parser: `connection must declare provider` / `connection provider must be a name` / `Unknown connection property "<key>"` / `Expected connection name`.

### HTTP / auth / connection usage

- `HTTP node references undefined auth block "<b>"` — Node's `auth:` value is not a declared auth block.
- `"auth" is only valid on http nodes` — You put `auth:` on a non-http node (code, ai, etc.). Remove it.
- `HTTP node references undefined connection "<n>"` — Node's `connection:` value is not a declared `connection` block.
- `"connection" is only valid on http nodes` — You put `connection:` on a non-http node. Remove it.
- `Node "<n>": set "auth" or "connection", not both. Use "auth" for your own credentials, "connection" for a Swirls-brokered grant.` — Drop one of the two.

### Stream nodes (read side)

Required keys: `stream`, `version`, `filter`.

- `streamId is no longer supported on stream nodes; use stream (stream block name)` — Rename `streamId:` to `stream:` with a bare identifier.
- `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)` — Replace with `filter: @ts { return { ... } }`.
- `Stream node references stream block "<n>" which is not defined` — `stream:` names a block that does not exist in the file or workspace.
- `Stream node "version" must be a valid stream version id (e.g. v1), got "<v>"` — `version:` must match `^v[1-9][0-9]*$`.
- `Stream node pins version "<v>" but stream "<n>" does not declare that version under versions { }` — Pin a `version:` that the stream block actually declares.
- `Stream node filter must be a non-empty @ts block` — `filter: @ts { }` is empty. Return at least `{}`.
- `Stream node "filter" must be an @ts block or @ts "file.ts.swirls" reference` — You used a plain value for `filter:`.

### Stream top-level block (write side)

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

### Parallel nodes

- `Parallel "operation" must be "search", "extract", or "findall", got "<v>"` — Invalid op.
- `Parallel search requires "searchQueries"` / `Parallel extract requires "urls"` / `Parallel findall requires "entityType" / "generator" / "matchConditions" / "matchLimit"` — Missing op-specific field.

### Vendor-managed schemas

- `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.` — You set `schema:` on `scrape`, `parallel`, `email`, or `disk`. Remove it.

### AI nodes

- `Invalid ai kind "<k>". Must be one of: text, object, image, video, embed` — Fix the `kind:` value.
- Warning: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` — Either drop the schema or change kind.

### Workflow (subworkflow) nodes

- `Workflow node requires "workflow"` — Add `workflow: <name>`.
- `Workflow node references workflow "<n>" which is not defined` — Fix the name or declare the child workflow.

### Map / while nodes

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

### Forms

- Parser error: `Expected \`:\` after \`visibility\`` — `visibility` is a key:value field; the colon is required.
- Parser error: `Expected \`public\` or \`internal\` after \`visibility:\`` — The value must be a bare identifier, not a quoted string.
- Parser error: `Invalid visibility "<x>"; expected \`public\` or \`internal\`` — Only those two values are valid.
- Parser error: `Expected auth block name (bare identifier) after \`auth:\`` — Form `auth:` takes a bare identifier.
- `Form "<n>" references undefined auth block "<a>"` — `auth:` must name a declared `auth` block.
- `Form "<n>" auth block "<a>" must have type \`basic\` (found \`<t>\`)` — Only basic auth blocks can gate forms.

### Webhooks (authentication)

- Warning: `Webhook "<n>" has no "secret" or "header" set and will accept any POST without verification.` — Add `secret: <block>.<VAR>` and `header: "X-..."` to require verification, or accept the warning for an explicitly unauthenticated endpoint.
- `Webhook "<n>" has "secret" but is missing "header"` / `Webhook "<n>" has "header" but is missing "secret"` — Both must be set together.
- `Webhook "<n>" header name must not be empty` — Trim/non-blank required.
- `Webhook "<n>" header "<name>" is reserved and cannot be used for authentication. Choose a custom header name.` — Pick a custom header (e.g. `X-Webhook-Signature`).
- `Webhook "<n>" references undefined secret block "<block>"` — Declare the `secret <block> { vars: [...] }`.
- `Webhook "<n>" references var "<VAR>" not declared in secret block "<block>"` — Add `VAR` to the block's `vars:`.
- Parser error: `Expected secret block name (e.g. my_secret.VAR)` — `secret:` uses dot notation: `secret: my_secret.VAR`. No quotes.
- Parser error: `Expected "." after secret block name` — Same — dot notation required.
- Parser error: `Expected quoted header name` — `header:` value must be a `"quoted"` string.

### Schema (top-level `schema` block)

- `Schema name: Name must contain only letters, numbers, and underscores` — Rename to match `^[a-zA-Z0-9_]+$`.
- Schema reference resolution errors come from `validateSchemaFieldRefs` — they fire when `inputSchema: <name>`, `outputSchema: <name>`, `schema: <name>` (on form/webhook/node), or `review: { schema: <name> }` references a name with no matching `schema <name> { }` block in the workspace.

### Postgres (top-level block)

- `Postgres block requires a connection field` — Add `connection:`.
- Warning: `Postgres connection contains a plaintext string. Use a secret identifier for production deployments.` — Move the URL into a secret.
- `Invalid connection secret key (use only letters, digits, and underscore)` — Bare `connection:` identifiers must match the secret key pattern.
- `Postgres "<n>" connection "<c>" must reference a var from secret block "<s>"` — When `secrets:` is set, the bare `connection:` var must appear in that block's `vars`.
- `Postgres "<n>" references undefined secret block "<s>"` — `secrets:` names a missing block.
- `Postgres block must declare at least one table` — Add a `table <name> { schema: @json { ... } }`.
- `Duplicate table name "<t>" in postgres block` — Rename one.
- `Table "<t>" requires a schema` — Each table needs a JSON Schema.
- `Duplicate postgres block name "<n>"` — Two blocks share a name.

### Postgres nodes

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

### Triggers

- `Trigger references <type> "<n>" which is not defined`.
- `Trigger references workflow "<g>" which is not defined`.

### Review

- `review: <path> — <message>` — The review block didn't match the schema (e.g. bad action outcome, missing required field). Fix per the message.

### Agents (and subagent teams)

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

### Channels

- `Channel "<n>" references unknown agent "<a>"` — `agent:` must name a declared `agent` block.
- `Channel "<n>" references unknown connection "<c>"` — `connection:` must name a declared `connection` block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — The connection's `provider` differs from the channel's `platform`.
- `Duplicate channel routing: multiple enabled bindings for <platform>:<mode>:<agent> (including "<n>")` — Two enabled channels share the same `platform : mode : agent` tuple. Change `mode`, point one at a different agent, or set `enabled: false` on one.
- Parser: `channel platform must be slack, linear, discord, or web` / `channel mode must be mention, dm, or all` / `channel must declare platform` / `channel must declare agent` / `Unknown channel property "<key>"` — invalid field or removed `integration:`.

### Output format (`format:` on nodes)

- `Invalid output format "<f>". Use one of: markdown, html, text, image, video, audio, mixed, json.` — Fix the `format:` value (bare identifier).
- `Output schema is incompatible with format "<f>" (expect top-level string, a { markdown | html | text | url } string field, or contentMediaType hint).` — The node's resolved output schema cannot be projected into the declared format. `json` and `mixed` are always compatible.

### Access control (`role` / `policy`)

- `Duplicate role name "<n>"` — Two `role` blocks share a name.
- Warning: `Role "<n>" has an empty match { } and will match no principal` — Add at least one claim condition.
- Parser: `Expected role name after \`allow\`` / `Expected \`->\` after role name` / `Expected \`agent\` after \`->\`` / `Expected an agent name or \`*\`` / `Expected \`allow\` or \`deny\` in policy block` — Grant lines are `allow|deny <role> -> agent <name>|*`.
- There is no `access { }` block; writing one is a parse error (it is not a keyword).
