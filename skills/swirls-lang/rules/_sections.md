# Sections

## 1. Language Spec (spec)

**Impact:** CRITICAL
**Description:** Exhaustive specification of every valid keyword, node type, config field, edge syntax, value type, and fenced block language. Also covers the most common incorrect patterns LLMs generate. READ THESE FIRST before writing any .swirls code. If something is not listed in the strict syntax spec, it does not exist.

## 2. File Structure (structure)

**Impact:** HIGH
**Description:** The seventeen top-level declarations, file discovery, and comment syntax. The foundation for every .swirls file.

## 3. Workflow & Node Basics (workflow)

**Impact:** CRITICAL
**Description:** Workflow anatomy, root node requirements, flow block syntax, edge rules, and DAG constraints. Every workflow starts here. `persistence { }` has been removed; use top-level `stream` blocks instead.

## 4. Node Types (node)

**Impact:** CRITICAL
**Description:** All 16 node types (ai, agent, bucket, code, disk, email, workflow, http, map, parallel, postgres, scrape, stream, switch, wait, while) with required and optional fields. `map` and `while` accept either an inline `subgraph { }` block or a `workflow: <name>` reference. Also covers shared fields: `secrets:` map, `failurePolicy:`, review.

## 5. TypeScript Blocks (ts)

**Impact:** CRITICAL
**Description:** Writing @ts blocks safely. Sandbox restrictions, safe string patterns, and parser-breaking patterns to avoid. The most common source of silent failures.

## 6. Schema & Typing (schema)

**Impact:** HIGH
**Description:** JSON Schema definitions for inputs, outputs, forms, and webhooks. Inline `@json` blocks, inline object literals, and bare-identifier references to top-level `schema <name> { }` blocks all work. `inputSchema` is root-only (and required on map/while subgraph roots); `outputSchema` is root-only; non-root nodes use `schema`. The parser rejects misplaced schema keys.

## 7. Context Object (context)

**Impact:** HIGH
**Description:** The context object available in @ts blocks: context.nodes, context.secrets, context.reviews, and context.meta. How data flows between nodes.

## 8. Resources & Triggers (resource)

**Impact:** HIGH
**Description:** Declaring forms (with `visibility: public/internal` and HTTP Basic `auth:`), webhooks (with shared-secret `secret:` + `header:` verification), schedules, streams, secrets, auth, connection (Swirls-brokered OAuth slots), postgres, disk, agent, channel, role/policy, and reusable top-level `schema` blocks, then binding sources to workflows with triggers. Only three trigger resource types exist: form, webhook, schedule.

## 9. Streams (stream)

**Impact:** MEDIUM
**Description:** Persisting workflow output via versioned top-level `stream { }` blocks (a `version` pointer plus a `versions:` map) and reading it with version-pinned `type: stream` nodes using `filter: @ts` returning a StreamFilter. Covers migration from the removed `persistence { }` block.

## 10. Reviews (review)

**Impact:** MEDIUM
**Description:** Human-in-the-loop review blocks. Pausing execution for approval, collecting feedback, routing based on review responses.

## 11. Parser Pitfalls (parser)

**Impact:** CRITICAL
**Description:** Lexer hazards that silently truncate files, plus an exhaustive cheatsheet of validator diagnostics. Regex literals with quote characters in @ts blocks, stray characters at DSL level, hyphenated object keys (use @ts blocks), nested code blocks. Essential knowledge to avoid hours of debugging.
