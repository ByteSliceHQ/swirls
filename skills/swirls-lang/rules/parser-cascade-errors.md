---
title: Parse Errors Cascade Past the Actual Problem
impact: HIGH
tags: parser, error, cascade, line, number, debugging
---

## Parse Errors Cascade Past the Actual Problem

A single syntax issue causes the parser to lose its place. The reported line number is often after the actual problem. When you see "Unexpected token: expected form, webhook, schedule, graph, workflow, stream, trigger, secret, auth, postgres, disk, agent, channel, or schema", look above the reported line.

**Common causes of cascading errors:**

1. Mismatched braces in `@ts`, `@json`, or `@sql` blocks
2. Misplaced schema keys (`inputSchema`/`outputSchema` on a non-root node) — the node is dropped, then its edges fail
3. Quoted keys with special characters in DSL object literals (use a `@ts` block instead)
4. Regex literals containing quote characters inside `@ts` blocks
5. A missing `{` or `}` on a block declaration

**Debugging strategy:**

When doctor reports an error at line N, look at lines 1 through N for:
- Unbalanced `{` and `}` in fenced blocks
- Any of the silent-drop patterns (see `parser-silent-drops`)
- Unrecognized field names or misplaced keys on nodes

The actual problem is usually 5-50 lines above the reported line.
