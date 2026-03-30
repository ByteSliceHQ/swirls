---
title: TypeScript Block Syntax
impact: CRITICAL
tags: ts, block, syntax, inline, file, reference
---

## TypeScript Block Syntax

TypeScript code can be embedded inline with `@ts { }` or referenced from an external `.ts.swirls` file with `@ts "path"`. Both forms have the same `context` object in scope.

**Incorrect (missing @ts prefix):**

```swirls
node process {
  type: code
  label: "Process"
  code: {
    return { result: 42 }
  }
}
```

**Incorrect (using .ts extension instead of .ts.swirls):**

```swirls
code: @ts "./handler.ts"
```

**Correct (inline @ts block):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const email = context.nodes.root.input.email ?? ""
    return { email: email.toLowerCase() }
  }
}
```

**Correct (external file reference):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts "./handlers/process.ts.swirls"
}
```

The external file contains a function body (not a module). Use `return` and `context` directly:

```typescript
// handlers/process.ts.swirls
const email = context.nodes.root.input.email ?? ""
return { email: email.toLowerCase() }
```

The `@ts` prefix is used for: `code`, `prompt`, `router`, `from`, `to`, `subject`, `text`, `html`, `replyTo`, `url`, `body`, `input`, `path`, and persistence `condition` fields.

Brace balancing: the lexer counts `{` and `}` depth to find the closing brace. Inner braces (objects, if-blocks, functions) are fine as long as they are balanced.
