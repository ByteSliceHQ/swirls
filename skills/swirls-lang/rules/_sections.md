# Sections

## 1. File Structure (structure)

**Impact:** HIGH
**Description:** Top-level declarations, file discovery, version, and comment syntax. The foundation for every .swirls file.

## 2. Graph & Node Basics (graph)

**Impact:** CRITICAL
**Description:** Graph anatomy, root node requirements, flow block syntax, edge rules, and DAG constraints. Every workflow starts here.

## 3. Node Types (node)

**Impact:** CRITICAL
**Description:** All 11 node types (ai, bucket, code, document, email, graph, http, scrape, stream, switch, wait) with required and optional fields. The core building blocks of workflows.

## 4. TypeScript Blocks (ts)

**Impact:** CRITICAL
**Description:** Writing @ts blocks safely. Sandbox restrictions, safe string patterns, and parser-breaking patterns to avoid. The most common source of silent failures.

## 5. Schema & Typing (schema)

**Impact:** HIGH
**Description:** JSON Schema definitions for inputs, outputs, forms, and webhooks. Inline vs @json syntax. Type safety through the LSP.

## 6. Context Object (context)

**Impact:** HIGH
**Description:** The context object available in @ts blocks: context.nodes, context.secrets, context.reviews, and context.meta. How data flows between nodes.

## 7. Resources & Triggers (resource)

**Impact:** HIGH
**Description:** Declaring forms, webhooks, and schedules, then binding them to graphs with triggers. The entry points for all workflows.

## 8. Persistence & Streams (stream)

**Impact:** MEDIUM
**Description:** Persisting graph outputs to queryable streams. SQL queries with {{table}} placeholders. Cross-graph data access.

## 9. Reviews (review)

**Impact:** MEDIUM
**Description:** Human-in-the-loop review blocks. Pausing execution for approval, collecting feedback, routing based on review responses.

## 10. Parser Pitfalls (parser)

**Impact:** CRITICAL
**Description:** Known parser bugs that silently drop graphs. Unicode in comments, hyphenated headers (use @ts blocks), double-quotes in @ts, nested templates, nested code blocks. Essential knowledge to avoid hours of debugging.
