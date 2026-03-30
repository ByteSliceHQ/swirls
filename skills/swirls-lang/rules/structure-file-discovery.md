---
title: File Discovery and Extensions
impact: HIGH
tags: file, discovery, extensions, ts.swirls
---

## File Discovery and Extensions

The Swirls CLI discovers `.swirls` files recursively from the project root. Files with `.ts.swirls` extension are standalone TypeScript files referenced from `code: @ts "./path.ts.swirls"` and are not parsed as DSL.

**Incorrect (wrong file extension for external TypeScript):**

```
handlers/normalize.ts        // Not discovered by Swirls
handlers/normalize.swirls    // Parsed as DSL, will fail
```

**Correct (proper extensions):**

```
workflow.swirls               // DSL file - discovered and parsed
handlers/normalize.ts.swirls  // Standalone TS - only included via @ts reference
```

Discovery rules:
- Searches `.swirls` files recursively from project root
- Ignores `node_modules/` and `__fixtures__/` directories
- Ignores `.ts.swirls` files (only loaded when referenced)
- Each `.swirls` file is parsed independently

A standalone `.ts.swirls` file contains a TypeScript function body (use `return`) with the same `context` object as inline `@ts` blocks:

```typescript
// handlers/normalize.ts.swirls
const raw = context.nodes.root.input.email ?? ""
return { email: raw.trim().toLowerCase() }
```

Reference it from a node:

```swirls
root {
  type: code
  label: "Normalize"
  code: @ts "./handlers/normalize.ts.swirls"
}
```
