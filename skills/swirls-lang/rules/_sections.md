# Sections

## 1. Language Spec (spec)

**Impact:** CRITICAL
**Description:** Exhaustive specification of every valid keyword, node type, config field, edge syntax, value type, and fenced block language. Also covers the most common incorrect patterns LLMs generate. READ THESE FIRST before writing any .swirls code. If something is not listed in the strict syntax spec, it does not exist.

## 2. File Structure (structure)

**Impact:** HIGH
**Description:** Top-level declarations, file discovery, version, and comment syntax. The foundation for every .swirls file.

## 3. Graph & Node Basics (graph)

**Impact:** CRITICAL
**Description:** Graph anatomy, root node requirements, flow block syntax, edge rules, and DAG constraints. Every workflow starts here.

## 4. Node Types (node)

**Impact:** CRITICAL
**Description:** All 12 node types (ai, bucket, code, document, firecrawl, graph, http, postgres, resend, stream, switch, wait) with required and optional fields. The core building blocks of workflows.

## 5. TypeScript Blocks (ts)

**Impact:** CRITICAL
**Description:** Writing @ts blocks safely. Sandbox restrictions, safe string patterns, and parser-breaking patterns to avoid. The most common source of silent failures.

## 6. Schema & Typing (schema)

**Impact:** HIGH
**Description:** JSON Schema definitions for inputs, outputs, forms, and webhooks. Inline vs @json syntax. Type safety through the LSP.

## 7. Context Object (context)

**Impact:** HIGH
**Description:** The context object available in @ts blocks: context.nodes, context.secrets, context.reviews, and context.meta. How data flows between nodes.

## 8. Resources & Triggers (resource)

**Impact:** HIGH
**Description:** Declaring forms, webhooks, schedules, secrets, and auth blocks, then binding them to graphs with triggers. The entry points for all workflows.

## 9. Persistence & Streams (stream)

**Impact:** MEDIUM
**Description:** Persisting graph outputs to queryable streams. SQL queries with {{table}} placeholders. Cross-graph data access.

## 10. Reviews (review)

**Impact:** MEDIUM
**Description:** Human-in-the-loop review blocks. Pausing execution for approval, collecting feedback, routing based on review responses.

## 11. Parser Pitfalls (parser)

**Impact:** CRITICAL
**Description:** Known parser bugs that silently drop graphs. Unicode in comments, hyphenated headers (use @ts blocks), double-quotes in @ts, nested templates, nested code blocks. Essential knowledge to avoid hours of debugging.
