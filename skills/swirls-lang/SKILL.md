---
name: swirls-lang
description: "Swirls language skill for writing correct .swirls workflow files. Use when writing, reviewing, or debugging .swirls DSL files. IMPORTANT: Read spec-strict-syntax FIRST. Only use syntax that is explicitly listed in the spec. Do not invent keywords, node types, fields, or constructs by analogy with other languages."
license: MIT
metadata:
  author: swirls
  version: "2.0.0"
---

# Swirls Language

Comprehensive guide for authoring `.swirls` workflow files. Covers the full DSL: file structure, graph declarations, all 13 node types, TypeScript / JSON / SQL embedded blocks, the context object, resources, triggers, top-level stream blocks, reviews, failure policies, and known parser pitfalls.

## When to Apply

- Writing new `.swirls` files from scratch.
- Adding nodes, graphs, streams, or triggers to existing `.swirls` files.
- Debugging parse errors or validation failures from `swirls doctor`.
- Writing `@ts` blocks (TypeScript code in nodes).
- Defining JSON Schemas for inputs, outputs, forms, and webhooks.
- Connecting graphs to forms, webhooks, or schedules via triggers.
- Persisting graph output with top-level `stream { }` blocks and reading it with `type: stream` nodes.
- Configuring human-in-the-loop review blocks.
- Declaring external Postgres databases and writing parameterized SQL nodes.

## Priority

| # | Category | Impact | Prefix | Rules |
|---|----------|--------|--------|-------|
| 1 | **Language Spec** | **CRITICAL** | `spec-` | **READ FIRST. Exhaustive list of valid syntax, keywords, node types, fields. If it is not listed here, it does not exist.** |
| 2 | File Structure | HIGH | `structure-` | Top-level declarations, file discovery, comment restrictions |
| 3 | Graph & Node Basics | CRITICAL | `graph-` | Root node, flow block, edges, DAG rules |
| 4 | Node Types | CRITICAL | `node-` | All 13 node types, required/optional fields, secrets map, failure policy |
| 5 | TypeScript Blocks | CRITICAL | `ts-` | @ts patterns, sandbox limits, safe code |
| 6 | Schema & Typing | HIGH | `schema-` | JSON Schema, inputSchema/outputSchema/schema placement |
| 7 | Context Object | HIGH | `context-` | context.nodes, context.reviews, context.secrets, context.meta |
| 8 | Resources & Triggers | HIGH | `resource-` | Forms, webhooks, schedules, secrets, auth blocks, postgres blocks, top-level stream blocks, trigger bindings |
| 9 | Streams | MEDIUM | `stream-` | Filter operators, field paths, migration from persistence |
| 10 | Reviews | MEDIUM | `review-` | Human-in-the-loop review config |
| 11 | Parser Pitfalls | CRITICAL | `parser-` | Known parser bugs, silent drops, validator diagnostics |

## Quick Reference

### 1. Language Spec (READ FIRST)
- `spec-strict-syntax` - **Exhaustive list of every valid keyword, node type, config field, edge syntax, and value type. If something is not listed here, it does not exist. Do not invent syntax.**
- `spec-common-mistakes` - **The 23 most common incorrect patterns with corrections. Check your output against these before returning any .swirls code.**

### 2. File Structure
- `structure-top-level-declarations` - The nine valid top-level blocks: form, webhook, schedule, graph, stream, trigger, secret, auth, postgres
- `structure-file-discovery` - File extensions, discovery rules, `.ts.swirls` files
- `structure-comments` - Comment syntax and ASCII-only restriction

### 3. Graph & Node Basics
- `graph-anatomy` - Graph structure: label, description, root, nodes, flow (persistence block removed)
- `graph-root-node` - Every graph needs exactly one `root { }` block
- `graph-flow-block` - Connecting nodes with edges and labeled edges
- `graph-dag-rules` - No cycles, one root, edge validation

### 4. Node Types (13 total)
- `node-code` - Code nodes: sandboxed TypeScript execution
- `node-ai` - AI nodes: text, object, image, video, embed kinds
- `node-switch` - Switch nodes: conditional routing with cases
- `node-http` - HTTP nodes: making API requests
- `node-email` - Resend nodes (`type: resend`): sending email via Resend
- `node-scrape` - Firecrawl nodes (`type: firecrawl`): web scraping
- `node-parallel` - Parallel nodes: search / extract / findall operations
- `node-stream` - Stream nodes: reading persisted stream data with filters
- `node-graph` - Graph nodes: calling subgraphs
- `node-wait` - Wait nodes: pausing execution
- `node-bucket` - Bucket nodes: object storage upload/download
- `node-document` - Document nodes: document processing
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
- `schema-input-output` - `inputSchema` (root only), `outputSchema` (root only), `schema` (non-root); strict parser enforcement
- `schema-inline-syntax` - Inline object literal schema syntax (no `@json`)

### 7. Context Object
- `context-nodes` - Accessing upstream node inputs and outputs
- `context-secrets` - Declaring and accessing secrets
- `context-reviews` - Accessing review form responses
- `context-meta` - Execution metadata (triggerId, triggerType)

### 8. Resources & Triggers
- `resource-form` - Form declarations with label, schema, enabled
- `resource-webhook` - Webhook declarations
- `resource-schedule` - Schedule declarations with cron and timezone
- `resource-stream` - Top-level `stream { }` blocks: graph, schema, condition, prepare
- `resource-trigger-binding` - Trigger syntax: `resourceType:name -> graphName` (form / webhook / schedule only)
- `resource-secrets` - Top-level `secret { vars: [...] }` blocks
- `resource-auth` - Top-level `auth` blocks (oauth, api_key, basic, bearer, cloud) and http-node `auth:` references
- `resource-postgres` - Top-level `postgres` blocks: connection, table schemas, secret references

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
- `parser-double-quotes-in-ts` - Double-quote chars inside `@ts` blocks drop graphs
- `parser-nested-templates` - Nested template literals break `@ts` parsing
- `parser-dollar-interpolation` - `$${}` breaks `@ts` parsing
- `parser-silent-drops` - Parser silently drops graphs with no error
- `parser-cascade-errors` - Parse errors cascade past the actual problem
- `parser-validation-checklist` - Pre-flight checklist before running `swirls doctor`
- `parser-validation-rules` - Exhaustive list of validator diagnostics and how to fix each

## How to Use

Individual rules live in `rules/`. Each file covers one concept with incorrect / correct examples.

For a single compiled document with all rules, see `AGENTS.md`.
