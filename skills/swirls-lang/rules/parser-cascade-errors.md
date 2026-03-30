---
title: Parse Errors Cascade Past the Actual Problem
impact: HIGH
tags: parser, error, cascade, line, number, debugging
---

## Parse Errors Cascade Past the Actual Problem

A single syntax issue causes the parser to lose its place. The reported line number is often after the actual problem. When you see "expected form, webhook, schedule, graph, or trigger", look above the reported line.

**Common causes of cascading errors:**

1. Unrecognized fields (like `secrets: ["KEY"]` with quoted strings)
2. Inline objects with special characters in keys
3. Mismatched braces in `@ts` or `@json` blocks
4. Double-quote characters inside `@ts` blocks
5. Nested template literals or `$${...}` in `@ts` blocks
6. Unicode characters in comments

**Debugging strategy:**

When doctor reports an error at line N, look at lines 1 through N for:
- Unbalanced `{` and `}` in `@ts` or `@json` blocks
- Any of the parser-breaking patterns from the parser pitfalls section
- Unrecognized field names on nodes

The actual problem is usually 5-50 lines above the reported line.
