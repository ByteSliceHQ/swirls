---
title: Pre-Flight Validation Checklist
impact: CRITICAL
tags: parser, validation, checklist, doctor, preflight
---

## Pre-Flight Validation Checklist

Before running `swirls doctor`, verify every item on this checklist. Each item corresponds to a known parser bug or validation failure.

**Parser safety (silent drops):**

- [ ] Comments use ASCII only (no box-drawing, arrows, em dashes, or other Unicode)
- [ ] No `headers` field using plain object literals with hyphenated keys (use a `@ts` block instead)
- [ ] No literal `"` characters inside `@ts` blocks (use `String.fromCharCode(34)`)
- [ ] No nested template literals inside `@ts` blocks (use concatenation)
- [ ] No `$${...}` patterns in template literals (use concatenation)
- [ ] No nested `@ts` or `@json` blocks inside other code blocks (use a single block that returns the full object)

**Structure validation:**

- [ ] Every `graph` has exactly one `root { }` block
- [ ] Every `graph` has a `label` field
- [ ] `flow { }` edges only reference defined node names
- [ ] No cycles in edges
- [ ] No self-referencing edges

**Node validation:**

- [ ] Every `resend` node has `from`, `to`, and `subject` fields
- [ ] Every `ai` node has `kind`, `model`, and `prompt` fields
- [ ] Every `ai` node with `kind: object` has a `schema`
- [ ] Every `code` node has a `code` field
- [ ] Every `switch` node has `cases` and `router` fields
- [ ] Every `http` node has a `url` field
- [ ] Every `graph` node has `graph` and `input` fields
- [ ] Every `bucket` node has an `operation` field
- [ ] Every `postgres` node has a `postgres` field and exactly one of `select` or `insert`
- [ ] Every `postgres` node with `insert` has a `params` field
- [ ] Every `postgres` node references a `postgres` block defined in the same file

**Trigger validation:**

- [ ] All graphs referenced by `type: graph` nodes are in the same file
- [ ] Trigger bindings reference resources and graphs defined in the same file
- [ ] Secret keys use only `[a-zA-Z0-9_]` characters

**File references:**

- [ ] All `@ts "path.ts.swirls"` references point to files that exist on disk (doctor validates this)

**Schema validation:**

- [ ] `@json` blocks contain valid JSON (double-quoted keys, no trailing commas)
- [ ] Braces are balanced in all `@ts { }`, `@json { }`, and `@sql { }` blocks

**After running doctor:**

- [ ] Doctor summary counts match the number of forms/graphs/triggers you defined
- [ ] No unexpected warnings about unused schemas or types
