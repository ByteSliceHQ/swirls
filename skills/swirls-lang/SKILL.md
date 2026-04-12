---
name: swirls-lang
description: "Swirls language skill for writing correct .swirls workflow files. Use when writing, reviewing, or debugging .swirls DSL files. IMPORTANT: Read spec-strict-syntax FIRST. Only use syntax that is explicitly listed in the spec. Do not invent keywords, node types, fields, or constructs by analogy with other languages."
license: MIT
metadata:
  author: swirls
  version: "1.3.0"
---

# Swirls Language

Comprehensive guide for authoring `.swirls` workflow files. Covers the full DSL: file structure, graph declarations, all 12 node types, TypeScript/JSON/SQL embedded blocks, the context object, resources, triggers, persistence, reviews, and known parser pitfalls.

## When to Apply

- Writing new `.swirls` files from scratch
- Adding nodes, graphs, or triggers to existing `.swirls` files
- Debugging parse errors or validation failures from `swirls doctor`
- Writing `@ts` blocks (TypeScript code in nodes)
- Defining JSON Schemas for inputs, outputs, forms, and webhooks
- Connecting graphs to forms, webhooks, or schedules via triggers
- Setting up persistence and stream queries
- Configuring human-in-the-loop review blocks

## Priority

| # | Category | Impact | Prefix | Rules |
|---|----------|--------|--------|-------|
| 1 | **Language Spec** | **CRITICAL** | `spec-` | **READ FIRST. Exhaustive list of valid syntax, keywords, node types, fields. If it is not listed here, it does not exist.** |
| 2 | File Structure | HIGH | `structure-` | Top-level declarations, file discovery, version, postgres blocks |
| 3 | Graph & Node Basics | CRITICAL | `graph-` | Root node, flow block, edges, DAG rules |
| 4 | Node Types | CRITICAL | `node-` | All 12 node types, required/optional fields |
| 5 | TypeScript Blocks | CRITICAL | `ts-` | @ts patterns, sandbox limits, safe code |
| 6 | Schema & Typing | HIGH | `schema-` | JSON Schema, inputSchema/outputSchema/schema |
| 7 | Context Object | HIGH | `context-` | context.nodes, context.reviews, context.secrets, context.meta |
| 8 | Resources & Triggers | HIGH | `resource-` | Forms, webhooks, schedules, secrets, auth blocks, trigger bindings |
| 9 | Persistence & Streams | MEDIUM | `stream-` | Persistence block, stream nodes, SQL |
| 10 | Reviews | MEDIUM | `review-` | Human-in-the-loop review config |
| 11 | Parser Pitfalls | CRITICAL | `parser-` | Known parser bugs, silent drops, validation |

## Quick Reference

### 1. Language Spec (READ FIRST)
- `spec-strict-syntax` - **Exhaustive list of every valid keyword, node type, config field, edge syntax, and value type. If something is not listed in this file, it does not exist in Swirls. Do not invent syntax.**
- `spec-common-mistakes` - **The 14 most common incorrect patterns with corrections. Check your output against these before returning any .swirls code.**

### 2. File Structure
- `structure-top-level-declarations` - Valid top-level blocks: form, webhook, schedule, graph, trigger, secret, auth, postgres
- `structure-file-discovery` - File extensions, discovery rules, .ts.swirls files
- `structure-comments` - Comment syntax and ASCII-only restriction

### 3. Graph & Node Basics
- `graph-anatomy` - Graph structure: label, description, persistence, root, nodes, flow
- `graph-root-node` - Every graph needs exactly one root { } block
- `graph-flow-block` - Connecting nodes with edges and labeled edges
- `graph-dag-rules` - No cycles, one root, edge validation

### 4. Node Types
- `node-code` - Code nodes: sandboxed TypeScript execution
- `node-ai` - AI nodes: text, object, image, video, embed kinds
- `node-switch` - Switch nodes: conditional routing with cases
- `node-http` - HTTP nodes: making API requests
- `node-email` - Resend nodes (`type: resend`): sending email via Resend
- `node-scrape` - Firecrawl nodes (`type: firecrawl`): web scraping with CSS selectors
- `node-stream` - Stream nodes: querying persisted data
- `node-graph` - Graph nodes: calling subgraphs
- `node-wait` - Wait nodes: pausing execution
- `node-bucket` - Bucket nodes: S3-like file operations
- `node-document` - Document nodes: document processing
- `node-postgres` - Postgres nodes: parameterized SELECT and INSERT against external databases

### 5. TypeScript Blocks
- `ts-block-syntax` - @ts { } inline blocks and @ts "file.ts.swirls" references
- `ts-sandbox-limits` - No imports, no fetch, no fs, no network in code nodes
- `ts-safe-patterns` - Always-safe patterns vs patterns to avoid
- `ts-no-double-quotes` - Use String.fromCharCode(34) instead of literal double-quote
- `ts-no-nested-templates` - Use concatenation instead of nested template literals
- `ts-no-dollar-interpolation` - Avoid $${} in template literals
- `ts-no-nested-code-blocks` - Never nest @ts/@json blocks inside other code blocks

### 6. Schema & Typing
- `schema-json-schema` - JSON Schema format in @json blocks
- `schema-input-output` - inputSchema (root only), outputSchema (root only), and schema (non-root nodes) patterns
- `schema-inline-syntax` - Inline object literal schema syntax (no @json)

### 7. Context Object
- `context-nodes` - Accessing upstream node inputs and outputs
- `context-secrets` - Declaring and accessing secrets
- `context-reviews` - Accessing review form responses
- `context-meta` - Execution metadata (triggerId, triggerType)

### 8. Resources & Triggers
- `resource-form` - Form declarations with label, schema, enabled
- `resource-webhook` - Webhook declarations
- `resource-schedule` - Schedule declarations with cron and timezone
- `resource-trigger-binding` - Trigger syntax: resourceType:name -> graphName
- `resource-secrets` - Top-level secret { vars: [...] } blocks
- `resource-auth` - Top-level auth blocks (oauth, api_key, basic, bearer) and http node `auth:` references
- `resource-postgres` - Top-level postgres blocks: connection, table schemas, secret references

### 9. Persistence & Streams
- `stream-persistence-block` - Enabling persistence on a graph
- `stream-query-sql` - SQL queries with {{table}} placeholder
- `stream-column-naming` - Column naming: "nodeName.field"

### 10. Reviews
- `review-config` - Review block structure and fields
- `review-access-downstream` - Accessing review data in downstream nodes

### 11. Parser Pitfalls
- `parser-unicode-comments` - Unicode in comments breaks line counting
- `parser-hyphenated-headers` - Hyphenated header keys parsed as subtraction
- `parser-double-quotes-in-ts` - Double-quote chars inside @ts blocks drop graphs
- `parser-nested-templates` - Nested template literals break @ts parsing
- `parser-dollar-interpolation` - $${} breaks @ts parsing
- `parser-silent-drops` - Parser silently drops graphs with no error
- `parser-cascade-errors` - Parse errors cascade past the actual problem
- `parser-validation-checklist` - Pre-flight checklist before running swirls doctor

## How to Use

Individual rules are in `rules/`. Each file covers one concept with incorrect/correct examples.

For a single compiled document with all rules, see `AGENTS.md`.
