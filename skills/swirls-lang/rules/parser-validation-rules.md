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

### Graphs

- `Graph must have exactly one root node (no incoming edges), but none were found. Check for cycles.` — The DAG has no entry point. Add `root { }` or break the cycle.
- `Graph must have exactly one root node, but found N: a, b, ...` — More than one node has no incoming edges. Connect them or remove the extras.
- `Graph must declare root { } as the entry node; the node with no incoming edges must be the root block (found "<n>" instead).` — The entry node exists but was declared `node foo { }` instead of `root { }`. Rename to `root`.
- `Graph contains a cycle - DAG workflows cannot have cycles` — Some edge points backwards. Remove it or route through a new node.
- `Duplicate node name "<n>" in graph` — Two nodes in the same graph share a name.
- `Edge references non-existent source node "<n>"` / `Edge references non-existent target node "<n>"` — Typo, or the node was dropped due to a parse error. Check spelling; check that the node block wasn't rejected.
- `Edge cannot connect a node to itself` — Self-loop. Remove.

### Nodes (general)

- `Invalid node type "<t>". Must be one of: ai, bucket, code, document, firecrawl, graph, http, parallel, postgres, resend, stream, switch, wait` — Unknown type name. Use one of the 13.
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

### Stream nodes

- `streamId is no longer supported on stream nodes; use stream (stream block name)` — Rename `streamId:` to `stream:` with a bare identifier.
- `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)` — Replace with `filter: @ts { return { ... } }`.
- `Stream node references stream block "<n>" which is not defined` — `stream:` names a block that does not exist in the file.
- `Stream node filter must be a non-empty @ts block` — `filter: @ts { }` is empty. Return at least `{}`.
- `Stream node "filter" must be an @ts block or @ts "file.ts.swirls" reference` — You used a plain value for `filter:`.

### Stream top-level block

- `Stream "<n>": "graph" must reference a declared graph in this file` — Fix the graph name.
- `Stream "<n>": "prepare" is required` — Add a non-empty `prepare: @ts { ... }`.
- `Stream "<n>": "prepare" must be an @ts block or @ts "file.ts.swirls" reference` — Use `@ts`.
- `Stream "<n>": "prepare" @ts block must not be empty` — Add a return.
- `Stream "<n>": "condition" @ts block must not be empty` — Remove `condition:` or give it a body.
- Warning: `Stream "<n>" has no schema; consider adding one`.

### Parallel nodes

- `Parallel "operation" must be "search", "extract", or "findall", got "<v>"` — Invalid op.
- `Parallel search requires "searchQueries"` / `Parallel extract requires "urls"` / `Parallel findall requires "entityType" / "generator" / "matchConditions" / "matchLimit"` — Missing op-specific field.

### Vendor-managed schemas

- `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.` — You set `schema:` on `firecrawl`, `parallel`, or `resend`. Remove it.

### AI nodes

- `Invalid ai kind "<k>". Must be one of: text, object, image, video, embed` — Fix the `kind:` value.
- Warning: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` — Either drop the schema or change kind.

### Graph (subgraph) nodes

- `Graph node requires "graph"` — Add `graph: <name>`.
- `Graph node references graph "<n>" which is not defined` — Fix the name or declare the child graph.

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
- `Trigger references graph "<g>" which is not defined`.

### Review

- `review: <path> — <message>` — The review block didn't match the schema (e.g. bad action outcome, missing required field). Fix per the message.
