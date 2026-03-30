---
title: Safe TypeScript Patterns
impact: CRITICAL
tags: ts, patterns, safe, template, string, concatenation
---

## Safe TypeScript Patterns

The Swirls parser has known issues with certain TypeScript patterns inside `@ts { }` blocks. Some patterns are always safe. Others silently break parsing. Use this as a quick reference.

**Always safe:**

```typescript
// Simple string concatenation
return "Hello, " + name + "!"

// Single-level template literals with ${} interpolation
return `Hello, ${name}!`

// Nullish coalescing
const val = input.field ?? "default"

// JSON.stringify (no nested templates)
return JSON.stringify({ key: value })

// Array methods with concatenation (not nested templates)
items.map(x => "- " + x).join("\n")

// Ternary expressions
const label = score > 80 ? "high" : "low"

// Object spreads
return { ...context.nodes.root.output, extra: "value" }
```

**Avoid (breaks parsing):**

```typescript
// Nested template literals - use concatenation instead
`outer ${`inner ${x}`}`
// Fix: "outer " + `inner ${x}`

// Dollar sign before interpolation - use concatenation
`$${amount}`
// Fix: "$" + amount

// Literal double-quote characters - use String.fromCharCode(34)
s.includes('"')
// Fix: s.indexOf(String.fromCharCode(34)) >= 0

// Regex with double-quote
s.replace(/"/g, '""')
// Fix: s.split(String.fromCharCode(34)).join(String.fromCharCode(34) + String.fromCharCode(34))
```

When in doubt, use string concatenation instead of template literals, and `String.fromCharCode(34)` instead of literal double-quote characters.
