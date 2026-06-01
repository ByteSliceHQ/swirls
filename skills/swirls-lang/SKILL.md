---
name: swirls-lang
description: "Swirls language skill for writing correct .swirls workflow files. Use when writing, reviewing, or debugging .swirls DSL files. IMPORTANT: Read spec-strict-syntax FIRST. Only use syntax that is explicitly listed in the spec. Do not invent keywords, node types, fields, or constructs by analogy with other languages."
license: MIT
metadata:
  author: swirls
  version: "4.2.0"
---

# Swirls Language

Comprehensive guide for authoring `.swirls` workflow files. Covers the full DSL: file structure, workflow declarations (formerly `graph`), all 16 node types, TypeScript / JSON / SQL embedded blocks, the context object (including `context.iteration` for map/while), resources, triggers, top-level stream / schema / disk / agent / channel blocks, agent subagent teams, reviews, failure policies, and known parser pitfalls.

## When to Apply

- Writing new `.swirls` files from scratch.
- Adding nodes, workflows, streams, schemas, or triggers to existing `.swirls` files.
- Debugging parse errors or validation failures from `swirls doctor`.
- Writing `@ts` blocks (TypeScript code in nodes).
- Defining JSON Schemas for inputs, outputs, forms, and webhooks (inline or via top-level `schema` blocks referenced by name).
- Connecting workflows to forms, webhooks, or schedules via triggers.
- Configuring form `visibility` (`public` / `internal`) and webhook shared-secret auth (`secret:` + `header:`).
- Building per-item iteration with `map` nodes or counter/condition loops with `while` nodes (inline `subgraph { }` or referenced `workflow: <name>`).
- Persisting workflow output with versioned top-level `stream { }` blocks and reading it with version-pinned `type: stream` nodes.
- Declaring `agent` blocks (with tools, roles, and subagent `team`) and binding them to chat platforms with `channel` blocks.
- Configuring human-in-the-loop review blocks.
- Declaring external Postgres databases and writing parameterized SQL nodes.

## Priority

| # | Category | Impact | Prefix | Rules |
|---|----------|--------|--------|-------|
| 1 | **Language Spec** | **CRITICAL** | `spec-` | **READ FIRST. Exhaustive list of valid syntax, keywords, node types, fields. If it is not listed here, it does not exist.** |
| 2 | File Structure | HIGH | `structure-` | Top-level declarations, file discovery, comment restrictions |
| 3 | Workflow & Node Basics | CRITICAL | `workflow-` | Root node, flow block, edges, DAG rules, inline `subgraph { }` for map/while |
| 4 | Node Types | CRITICAL | `node-` | All 16 node types, required/optional fields, secrets map, failure policy |
| 5 | TypeScript Blocks | CRITICAL | `ts-` | @ts patterns, sandbox limits, safe code |
| 6 | Schema & Typing | HIGH | `schema-` | JSON Schema, inputSchema/outputSchema/schema placement, bare-identifier refs to top-level `schema` blocks |
| 7 | Context Object | HIGH | `context-` | context.nodes, context.reviews, context.secrets, context.meta, context.iteration |
| 8 | Resources & Triggers | HIGH | `resource-` | Forms (incl. `visibility`), webhooks (incl. `secret:`/`header:`), schedules, secrets, auth blocks, postgres blocks, agent blocks (incl. subagent `team`), channel blocks, top-level stream and schema blocks, trigger bindings |
| 9 | Streams | MEDIUM | `stream-` | Filter operators, field paths, migration from persistence |
| 10 | Reviews | MEDIUM | `review-` | Human-in-the-loop review config |
| 11 | Parser Pitfalls | CRITICAL | `parser-` | Known parser bugs, silent drops, validator diagnostics |

## Quick Reference

### 1. Language Spec (READ FIRST)
- `spec-strict-syntax` - **Exhaustive list of every valid keyword, node type, config field, edge syntax, and value type. If something is not listed here, it does not exist. Do not invent syntax.**
- `spec-common-mistakes` - **The most common incorrect patterns with corrections. Check your output against these before returning any .swirls code.**

### 2. File Structure
- `structure-top-level-declarations` - The thirteen valid top-level blocks (plus the optional `version:` line): schema, form, webhook, schedule, workflow, stream, trigger, secret, auth, postgres, disk, agent, channel
- `structure-file-discovery` - File extensions, discovery rules, `.ts.swirls` files
- `structure-comments` - Comment syntax and ASCII-only restriction

### 3. Workflow & Node Basics
- `workflow-anatomy` - Workflow structure: label, description, root, nodes, flow (persistence block removed). The keyword is `workflow` (legacy alias `graph`).
- `workflow-root-node` - Every workflow needs exactly one `root { }` block
- `workflow-flow-block` - Connecting nodes with edges and labeled edges
- `workflow-dag-rules` - No cycles, one root, edge validation
- `workflow-subgraph` - Inline `subgraph { }` block (no colon) inside `map`/`while` nodes; same body as a workflow but no own label/description; subgraph root must declare `inputSchema`

### 4. Node Types (16 total)
- `node-code` - Code nodes: sandboxed TypeScript execution
- `node-ai` - AI nodes: text, object, image, video, embed kinds
- `node-agent` - Agent nodes: bind to a top-level `agent` block; tools, roles, prompt, structured `schema`, maxSteps tool loop (default 20), persistent sandbox workspace, `swirls chat start`
- `node-switch` - Switch nodes: conditional routing with cases
- `node-http` - HTTP nodes: making API requests
- `node-email` - Email nodes (`type: email`): sending email via Resend
- `node-scrape` - Scrape nodes (`type: scrape`): web scraping via Firecrawl
- `node-parallel` - Parallel nodes: search / extract / findall operations
- `node-stream` - Stream nodes: reading persisted stream data at a pinned `version` with filters
- `node-workflow` - Workflow nodes (`type: workflow`, legacy alias `graph`): calling a subworkflow (one-shot)
- `node-map` - Map nodes: per-item iteration with inline `subgraph { }` or `workflow: <name>`; required `items`, `maxItems`; optional `concurrency`
- `node-while` - While nodes: counter/condition loops with `input`, `condition`, `update`, `maxIterations` plus `subgraph { }` or `workflow: <name>`
- `node-wait` - Wait nodes: pausing execution
- `node-bucket` - Bucket nodes: object storage upload/download
- `node-disk` - Disk nodes: bash exec on a top-level `disk` block (Archil-backed)
- `node-postgres` - Postgres nodes: parameterized SELECT and INSERT against external databases
- `node-secrets-map` - `secrets: { block: [VAR] }` object-literal syntax (shared across types)
- `node-failure-policy` - Optional `failurePolicy:` for retry / skip / fallback behavior

### 5. TypeScript Blocks
- `ts-block-syntax` - `@ts { }` inline blocks and `@ts "file.ts.swirls"` references
- `ts-sandbox-limits` - No imports, no fetch, no fs, no network in code nodes
- `ts-safe-patterns` - Always-safe patterns vs patterns to avoid
- `ts-no-double-quotes` - Use `String.fromCharCode(34)` instead of literal double-quote
- `ts-no-nested-templates` - Use concatenation instead of nested template literals
- `ts-no-dollar-interpolation` - Avoid `$${}` in template literals
- `ts-no-nested-code-blocks` - Never nest `@ts` / `@json` blocks inside other code blocks

### 6. Schema & Typing
- `schema-json-schema` - JSON Schema format in `@json` blocks
- `schema-input-output` - `inputSchema` (root and map/while subgraph root only), `outputSchema` (root only), `schema` (non-root); strict parser enforcement; bare-identifier refs to top-level `schema` blocks
- `schema-inline-syntax` - Inline object literal schema syntax (no `@json`)

### 7. Context Object
- `context-nodes` - Accessing upstream node inputs and outputs
- `context-secrets` - Declaring and accessing secrets
- `context-reviews` - Accessing review form responses
- `context-meta` - Execution metadata (triggerId, triggerType)
- `context-iteration` - `context.iteration.item` (map), `context.iteration.input` / `index` / `previous` (while); per-iteration data inside subgraphs

### 8. Resources & Triggers
- `resource-form` - Form declarations with label, schema, enabled, `visibility public | internal` (default internal)
- `resource-webhook` - Webhook declarations with shared-secret `secret: <block>.<VAR>` + `header: "X-..."` verification (paired); reserved-headers list
- `resource-schedule` - Schedule declarations with cron and timezone
- `resource-stream` - Top-level `stream { }` blocks: `workflow`, `version` pointer, and a `versions:` map with per-version schema/condition/prepare
- `resource-schema` - Top-level `schema <name> { }` blocks: reusable JSON Schemas referenced by bare identifier from forms / webhooks / root inputSchema / root outputSchema / non-root schema / review schema
- `resource-trigger-binding` - Trigger syntax: `resourceType:name -> workflowName` (form / webhook / schedule only)
- `resource-secrets` - Top-level `secret { vars: [...] }` blocks
- `resource-auth` - Top-level `auth` blocks (oauth, api_key, basic, bearer, cloud) and http-node `auth:` references
- `resource-postgres` - Top-level `postgres` blocks: connection, table schemas, secret references
- `resource-disk` - Top-level `disk` blocks: Archil-backed remote disks (`id: "dsk-..."`, secrets)
- `resource-agent` - Top-level `agent` blocks: required model + secrets, provider enum (default openrouter), tools (workflows-as-tools), subagent `team`, optional `sandbox { }` sizing/lifecycle, optional `role` sub-blocks
- `resource-channel` - Top-level `channel` blocks: bind an agent to a chat platform (`platform`/`integration` slack/linear/discord/web, `agent`, `mode` mention/dm/all, `enabled`); platform must equal integration

### 9. Streams
- `stream-persistence-block` - Migration note: `persistence { }` removed; use top-level `stream { }`
- `stream-query-sql` - SQL queries replaced by `filter: @ts { ... }` returning a `StreamFilter`
- `stream-column-naming` - Filter field paths: table columns vs output JSON fields

### 10. Reviews
- `review-config` - Review block structure, actions, and fields
- `review-access-downstream` - Accessing review data in downstream nodes via `context.reviews`

### 11. Parser Pitfalls
- `parser-unicode-comments` - Unicode in comments breaks line counting
- `parser-hyphenated-headers` - Hyphenated header keys parsed as subtraction
- `parser-double-quotes-in-ts` - Double-quote chars inside `@ts` blocks drop workflows
- `parser-nested-templates` - Nested template literals break `@ts` parsing
- `parser-dollar-interpolation` - `$${}` breaks `@ts` parsing
- `parser-silent-drops` - Parser silently drops workflows with no error
- `parser-cascade-errors` - Parse errors cascade past the actual problem
- `parser-validation-checklist` - Pre-flight checklist before running `swirls doctor`
- `parser-validation-rules` - Exhaustive list of validator diagnostics and how to fix each

## How to Use

Individual rules live in `rules/`. Each file covers one concept with incorrect / correct examples.

For a single compiled document with all rules, see `AGENTS.md` (regenerated from the rules directory; may lag the rule files between updates).
