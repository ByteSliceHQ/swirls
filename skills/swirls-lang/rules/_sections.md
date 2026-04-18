# Sections

## 1. Language Spec (spec)

**Impact:** CRITICAL
**Description:** Exhaustive specification of every valid keyword, node type, config field, edge syntax, value type, and fenced block language. Also covers the most common incorrect patterns LLMs generate. READ THESE FIRST before writing any .swirls code. If something is not listed in the strict syntax spec, it does not exist.

## 2. File Structure (structure)

**Impact:** HIGH
**Description:** Top-level declarations, file discovery, and comment syntax. The foundation for every .swirls file.

## 3. Graph & Node Basics (graph)

**Impact:** CRITICAL
**Description:** Graph anatomy, root node requirements, flow block syntax, edge rules, and DAG constraints. Every workflow starts here. `persistence { }` has been removed; use top-level `stream` blocks instead.

## 4. Node Types (node)

**Impact:** CRITICAL
**Description:** All 13 node types (ai, bucket, code, document, firecrawl, graph, http, parallel, postgres, resend, stream, switch, wait) with required and optional fields. Also covers shared fields: `secrets:` map, `failurePolicy:`, review.

## 5. TypeScript Blocks (ts)

**Impact:** CRITICAL
**Description:** Writing @ts blocks safely. Sandbox restrictions, safe string patterns, and parser-breaking patterns to avoid. The most common source of silent failures.

## 6. Schema & Typing (schema)

**Impact:** HIGH
**Description:** JSON Schema definitions for inputs, outputs, forms, and webhooks. Inline vs @json syntax. `inputSchema` is root-only; `outputSchema` is root-only; non-root nodes use `schema`. The parser rejects misplaced schema keys.

## 7. Context Object (context)

**Impact:** HIGH
**Description:** The context object available in @ts blocks: context.nodes, context.secrets, context.reviews, and context.meta. How data flows between nodes.

## 8. Resources & Triggers (resource)

**Impact:** HIGH
**Description:** Declaring forms, webhooks, schedules, streams, secrets, auth, and postgres blocks, then binding sources to graphs with triggers. Only three trigger resource types exist: form, webhook, schedule.

## 9. Streams (stream)

**Impact:** MEDIUM
**Description:** Persisting graph output via top-level `stream { }` blocks and reading it with `type: stream` nodes using `filter: @ts` returning a StreamFilter. Covers migration from the removed `persistence { }` block.

## 10. Reviews (review)

**Impact:** MEDIUM
**Description:** Human-in-the-loop review blocks. Pausing execution for approval, collecting feedback, routing based on review responses.

## 11. Parser Pitfalls (parser)

**Impact:** CRITICAL
**Description:** Known parser bugs that silently drop graphs, plus an exhaustive cheatsheet of validator diagnostics. Unicode in comments, hyphenated headers (use @ts blocks), double-quotes in @ts, nested templates, nested code blocks. Essential knowledge to avoid hours of debugging.
