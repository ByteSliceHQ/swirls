---
title: Safe TypeScript Patterns
impact: CRITICAL
tags: ts, patterns, safe, template, string, regex
---

## Safe TypeScript Patterns

The `@ts { }` scanner tracks braces, strings (single, double, template), and comments. Most ordinary TypeScript parses fine. The known hazards are regex literals containing quote characters and unbalanced braces. Use this as a quick reference.

**Always safe:**

```typescript
// Simple string concatenation
return "Hello, " + name + "!"

// Template literals, including nested ones
return `Hello, ${name}!`
return `Summary:\n${items.map(w => `  - ${w}`).join("\n")}`

// Literal $ before interpolation (currency)
return `Total: $${amount.toFixed(2)}`

// Double-quote characters inside strings
return '"' + value + '"'
if (s.includes('"')) { }

// Nullish coalescing, ternaries, spreads
const val = input.field ?? "default"
const label = score > 80 ? "high" : "low"
return { ...context.nodes.root.output, extra: "value" }

// JSON.stringify
return JSON.stringify({ key: value })

// Regex literals WITHOUT quote characters
/\d+/g.test(s)
s.replace(/\s+/g, " ")
```

**Avoid (silently truncates the rest of the file):**

```typescript
// Regex literal containing a quote character — the scanner mistakes it
// for a string boundary and desyncs. See ts-regex-literals.
s.replace(/"/g, '""')
/can't/.test(s)
// Fix: build from strings — new RegExp(String.fromCharCode(34)), or
// use split/join: s.split(String.fromCharCode(34)).join("")
```

**Avoid (parse errors / mangled config):**

```typescript
// Unbalanced braces anywhere in the block — the scanner counts { } depth
// to find the end of @ts { }. A regex or string trick that leaves braces
// unbalanced ends the block early.
```

Strings and comments inside `@ts` are scanned with full escape handling, so `\"`, `\\`, and backticks inside `${ … }` all work. When in doubt about a regex, build it with `new RegExp(...)` from string parts.
