---
title: Pre-Flight Validation Checklist
impact: CRITICAL
tags: parser, validation, checklist, doctor, preflight
---

## Pre-Flight Validation Checklist

Before running `swirls doctor`, verify every item on this checklist. Each item corresponds to a known lexer hazard or validation failure.

**Parser safety (silent drops):**

- [ ] No regex literals containing `"`, `'`, or backtick characters inside `@ts` blocks (build with `new RegExp(...)` / `String.fromCharCode` instead)
- [ ] No stray Unicode or other unrecognized characters at DSL level (comments and strings are fine)
- [ ] No `headers` field using plain object literals with hyphenated keys (use a `@ts` block instead)
- [ ] No nested `@ts` or `@json` blocks inside other code blocks (use a single block that returns the full object)
- [ ] Braces balanced in all `@ts { }`, `@json { }`, and `@sql { }` blocks
- [ ] No `inputSchema`/`outputSchema` on non-root nodes (the parser drops the whole node)

**Structure validation:**

- [ ] Every `workflow` has exactly one `root { }` block
- [ ] Every `workflow` has a `label` field
- [ ] `flow { }` edges only reference defined node names
- [ ] No cycles in edges
- [ ] No self-referencing edges

**Node validation:**

- [ ] Every `email` node has `from`, `to`, and `subject` fields
- [ ] Every `scrape` node has a `url` field
- [ ] Every `ai` node has a `kind` field (and `model` + `prompt` for a working call; `schema` for `kind: object`)
- [ ] Every `agent` node has `agent` and `prompt` fields, and any `profile:` matches a profile in the bound agent block
- [ ] Every `code` node has a `code` field
- [ ] Every `switch` node has `cases` and `router` fields
- [ ] Every `http` node has a `url` field
- [ ] Every `workflow` node has `workflow` and `input` fields
- [ ] Every `bucket` node has an `operation` field
- [ ] Every `disk` node has `disk` and `command` fields
- [ ] Every `map` node has `items`, `maxItems`, and exactly one of `subgraph { }` or `workflow:`
- [ ] Every `while` node has `input`, `condition`, `update`, `maxIterations`, and exactly one of `subgraph { }` or `workflow:`
- [ ] Every `stream` node has `stream`, `version`, and `filter`
- [ ] Every `postgres` node has a `postgres` field and exactly one of `select` or `insert`
- [ ] Every `postgres` node with `insert` has a `params` field

**Cross-references (resolved across the workspace — all `.swirls` files under the working directory):**

- [ ] Workflows referenced by `type: workflow` / `map` / `while` nodes are declared somewhere in the workspace
- [ ] Trigger bindings reference declared resources and workflows
- [ ] `postgres:` / `disk:` / `agent:` / `stream:` node fields name declared top-level blocks
- [ ] Secret keys use only `[a-zA-Z0-9_]` characters

**File references:**

- [ ] All `@ts "path.ts.swirls"` references point to files that exist on disk (doctor validates this)

**Schema validation:**

- [ ] `@json` blocks contain valid JSON (double-quoted keys, no trailing commas)
- [ ] Bare schema names (`inputSchema: foo`) resolve to a top-level `schema foo { }` block

**After running doctor:**

- [ ] Doctor summary counts match the number of forms/workflows/triggers you defined
- [ ] No unexpected warnings about unused schemas or types

**A clean `swirls doctor` is not a clean deploy.** `swirls doctor` reports only **error**-severity diagnostics; it does not print **warnings**. Several conditions are warnings, so they pass doctor and only fail (or silently misbehave) at deploy or in the editor LSP. Known warning-only cases to check by eye:

- A `connection` whose `provider` is a valid name but not in the Swirls integration catalog (deploy fails).
- A `postgres` block with a literal (non-secret) connection string.
- A `webhook` declaring neither a shared `secret:` nor a `header:`.
- An unused top-level `schema` block.

When deploy fails but doctor was green, suspect a warning-level issue and check it in the LSP or deploy output.
