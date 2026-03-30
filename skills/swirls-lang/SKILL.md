---
name: swirls-lang
description: "Swirls language skill for writing correct .swirls workflow files. Use when writing, reviewing, or debugging .swirls DSL files."
license: MIT
metadata:
  author: swirls
  version: "1.0.0"
---

# Swirls Language

Comprehensive guide for authoring `.swirls` workflow files. Covers the full DSL: file structure, graph declarations, all 11 node types, TypeScript/JSON/SQL embedded blocks, the context object, resources, triggers, persistence, reviews, and known parser pitfalls.

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
| 1 | File Structure | HIGH | `structure-` | Top-level declarations, file discovery, version |
| 2 | Graph & Node Basics | CRITICAL | `graph-` | Root node, flow block, edges, DAG rules |
| 3 | Node Types | CRITICAL | `node-` | All 11 node types, required/optional fields |
| 4 | TypeScript Blocks | CRITICAL | `ts-` | @ts patterns, sandbox limits, safe code |
| 5 | Schema & Typing | HIGH | `schema-` | JSON Schema, inputSchema/outputSchema |
| 6 | Context Object | HIGH | `context-` | context.nodes, context.reviews, context.secrets, context.meta |
| 7 | Resources & Triggers | HIGH | `resource-` | Forms, webhooks, schedules, trigger bindings |
| 8 | Persistence & Streams | MEDIUM | `stream-` | Persistence block, stream nodes, SQL |
| 9 | Reviews | MEDIUM | `review-` | Human-in-the-loop review config |
| 10 | Parser Pitfalls | CRITICAL | `parser-` | Known parser bugs, silent drops, validation |

## Quick Reference

### 1. File Structure
- `structure-top-level-declarations` - Valid top-level blocks: form, webhook, schedule, graph, trigger
- `structure-file-discovery` - File extensions, discovery rules, .ts.swirls files
- `structure-comments` - Comment syntax and ASCII-only restriction

### 2. Graph & Node Basics
- `graph-anatomy` - Graph structure: label, description, persistence, root, nodes, flow
- `graph-root-node` - Every graph needs exactly one root { } block
- `graph-flow-block` - Connecting nodes with edges and labeled edges
- `graph-dag-rules` - No cycles, one root, edge validation

### 3. Node Types
- `node-code` - Code nodes: sandboxed TypeScript execution
- `node-ai` - AI nodes: text, object, image, video, embed kinds
- `node-switch` - Switch nodes: conditional routing with cases
- `node-http` - HTTP nodes: making API requests
- `node-email` - Email nodes: sending email via Resend
- `node-scrape` - Scrape nodes: web scraping with CSS selectors
- `node-stream` - Stream nodes: querying persisted data
- `node-graph` - Graph nodes: calling subgraphs
- `node-wait` - Wait nodes: pausing execution
- `node-bucket` - Bucket nodes: S3-like file operations
- `node-document` - Document nodes: document processing

### 4. TypeScript Blocks
- `ts-block-syntax` - @ts { } inline blocks and @ts "file.ts.swirls" references
- `ts-sandbox-limits` - No imports, no fetch, no fs, no network in code nodes
- `ts-safe-patterns` - Always-safe patterns vs patterns to avoid
- `ts-no-double-quotes` - Use String.fromCharCode(34) instead of literal double-quote
- `ts-no-nested-templates` - Use concatenation instead of nested template literals
- `ts-no-dollar-interpolation` - Avoid $${} in template literals

### 5. Schema & Typing
- `schema-json-schema` - JSON Schema format in @json blocks
- `schema-input-output` - inputSchema (root only) and outputSchema patterns
- `schema-inline-syntax` - Inline object literal schema syntax (no @json)

### 6. Context Object
- `context-nodes` - Accessing upstream node inputs and outputs
- `context-secrets` - Declaring and accessing secrets
- `context-reviews` - Accessing review form responses
- `context-meta` - Execution metadata (triggerId, triggerType)

### 7. Resources & Triggers
- `resource-form` - Form declarations with label, schema, enabled
- `resource-webhook` - Webhook declarations
- `resource-schedule` - Schedule declarations with cron and timezone
- `resource-trigger-binding` - Trigger syntax: resourceType:name -> graphName

### 8. Persistence & Streams
- `stream-persistence-block` - Enabling persistence on a graph
- `stream-query-sql` - SQL queries with {{table}} placeholder
- `stream-column-naming` - Column naming: "nodeName.field"

### 9. Reviews
- `review-config` - Review block structure and fields
- `review-access-downstream` - Accessing review data in downstream nodes

### 10. Parser Pitfalls
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
