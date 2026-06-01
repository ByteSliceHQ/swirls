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

- `Invalid node type "<t>". Must be one of: agent, ai, bucket, code, disk, email, http, map, parallel, postgres, scrape, stream, switch, wait, while, workflow` — Unknown type name. Use one of the 16. (`graph` is accepted as a legacy alias and normalized to `workflow`, so it never trips this error.)
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

- `Auth block "<n>" requires type: oauth, api_key, basic, bearer, or cloud` — Missing or invalid `type:`.
- `Auth "<n>" references undefined secret block "<s>"` — `secrets:` names a block that does not exist.
- `Auth "<n>" references undefined var "<V>" not declared in secret block "<s>"` — A field like `client_id: FOO` but `FOO` is not in that secret block's `vars:`.

### HTTP / auth usage

- `HTTP node references undefined auth block "<b>"` — Node's `auth:` value is not a declared auth block.
- `"auth" is only valid on http nodes` — You put `auth:` on a non-http node (code, ai, etc.). Remove it.

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

- `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.` — You set `schema:` on `scrape`, `parallel`, or `email`. Remove it.

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

- Parser error: `Expected \`public\` or \`internal\` after \`visibility\`` — `visibility` is a bare keyword (no colon, no quotes). Use `visibility public` or `visibility internal`.
- Parser error: `Invalid visibility "<x>"; expected \`public\` or \`internal\`` — Only those two values are valid.

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

- `Postgres block "<n>": connection is required` — Add `connection:`.
- Warning: `Postgres block "<n>": plaintext connection string — use a secret` — Move the URL into a secret.
- `Postgres block "<n>": connection references var "<V>" not declared in secret block "<s>"` — Var must appear in the referenced block's `vars`.
- `Postgres block "<n>" requires at least one "table"` — Add a `table <name> { schema: @json { ... } }`.
- `Postgres block "<n>": duplicate table "<t>"` — Rename one.
- `Postgres block "<n>": table "<t>" requires "schema"` — Each table needs a JSON Schema.

### Postgres nodes

- `Postgres node requires "postgres"` — Add `postgres: <block_name>`.
- `Postgres node references postgres block "<b>" which is not defined`.
- `Postgres node requires exactly one of "select" or "insert"` — Remove the other, or add the missing one.
- `Postgres insert node requires "params"` — Inserts always need params.
- `select must begin with SELECT or WITH` / `insert must begin with INSERT`.
- `select references table "<t>" not declared in postgres block "<b>"` — Add the table declaration.
- `insert references table "<t>" not declared in postgres block "<b>"`.
- `INSERT values must be parenthesized: VALUES ({{key}}, ...)`.
- `Param "<p>" has no matching {{<p>}} placeholder in SQL` / `Placeholder {{<p>}} has no matching key in params` — Align placeholder names with params keys.

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
- `Agent tool workflow "<n>" requires output schema on leaf node "<leaf>"` — Every leaf node of a tool workflow needs a `schema`/`outputSchema`.
- `Agent "<n>" cannot include itself in team:` — Remove the self-reference.
- `Agent "<n>" team member "<m>" is not defined in the workspace` — `team:` must name declared `agent` blocks.
- `Agent "<n>" team member "<m>" conflicts with a workflow tool of the same name` — A `team` member and a `tools` workflow share a name; rename one.
- `Agent team contains a cycle: a -> b -> a` — Subagent delegation must not form a loop.

### Channels

- `Channel "<n>" references unknown agent "<a>"` — `agent:` must name a declared `agent` block.
- `Channel "<n>" platform "<p>" must match integration "<i>"` — Set `integration` equal to `platform`.
- `Duplicate channel routing: multiple enabled bindings for <platform>:<mode>:<agent> (including "<n>")` — Two enabled channels share the same `platform : mode : agent` tuple. Change `mode`, point one at a different agent, or set `enabled: false` on one.
