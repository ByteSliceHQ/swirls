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

The referenced `.ts.swirls` file must exist on disk. `swirls doctor` validates that the file is present and will report an error if it is missing. The file contains a function body (not a module) and exists in the same namespace with the same `context` object as inline blocks:

```typescript
// handlers/process.ts.swirls
const email = context.nodes.root.input.email ?? ""
return { email: email.toLowerCase() }
```

The `@ts` prefix is used for: `code`, `prompt`, `router`, `from`, `to`, `subject`, `text`, `html`, `replyTo`, `url`, `body`, `headers`, `input`, `path`, and persistence `condition` fields.

**No nesting:** `@ts` blocks cannot contain other `@ts` blocks. Each `@ts` block is a leaf that contains executable code. If a field needs to produce a compound value (e.g., a headers object with multiple keys), use a single `@ts` block that returns the entire object. See the ts-no-nested-code-blocks rule.

Brace balancing: the lexer counts `{` and `}` depth to find the closing brace. Inner braces (objects, if-blocks, functions) are fine as long as they are balanced.
