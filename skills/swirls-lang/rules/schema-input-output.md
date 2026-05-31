---
title: inputSchema, outputSchema, and schema
impact: HIGH
tags: schema, inputSchema, outputSchema, root, typing, named, reference
---

## inputSchema, outputSchema, and schema

The three schema keywords each have a specific placement. The parser enforces this strictly and **rejects misplaced schema keys**.

| Keyword | Valid on | Purpose |
|---------|----------|---------|
| `inputSchema` | **root only** (and map/while subgraph root) | Shape of the incoming payload (trigger or iteration item). Drives `context.nodes.root.input` (or `context.iteration.item` / `context.iteration.input`) typing in the LSP. |
| `outputSchema` | **root only** | Shape of what the root node returns. |
| `schema` | **non-root nodes** (and form / webhook / postgres table / review / top-level `schema` block) | Shape of what that node returns. Equivalent to `outputSchema` for non-root nodes. |

### Strict parser rules

- `inputSchema` on a non-root node → parser error: `inputSchema is only allowed in root { } blocks`. The entire node is dropped from the AST. (A map/while `subgraph { }` root counts as a root for this rule.)
- `outputSchema` on a non-root node → parser error: `Use "schema" instead of "outputSchema" in node blocks`. The entire node is dropped from the AST.
- `schema` on root is technically accepted but redundant — use `outputSchema` on root.

### Three forms of schema value

Every schema field accepts three value forms:

1. **Inline `@json { ... }` block:**
   ```swirls
   inputSchema: @json {
     { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
   }
   ```
2. **Inline object literal** (no `@json` keyword):
   ```swirls
   inputSchema: {
     "type": "object",
     "required": ["email"],
     "properties": { "email": { "type": "string" } }
   }
   ```
3. **Bare identifier** referencing a top-level `schema <name> { }` block:
   ```swirls
   inputSchema: contact_payload
   ```

The bare-identifier form requires a matching `schema <name> { }` declaration in the workspace. See `resource-schema`.

### Incorrect (inputSchema on non-root)

```swirls
node enrich {
  type: code
  label: "Enrich"
  inputSchema: @json { { "type": "object" } }
  code: @ts { return {} }
}
```

The parser drops this node silently (after logging an error). Downstream references to `context.nodes.enrich.output` will fail at validation or runtime.

### Incorrect (outputSchema on non-root)

```swirls
node process {
  type: code
  label: "Process"
  outputSchema: @json { { "type": "object" } }
  code: @ts { return {} }
}
```

Same outcome — the node is dropped.

### Correct (each kind in the right place)

```swirls
schema contact_payload {
  label: "Contact payload"
  schema: @json {
    { "type": "object", "required": ["name", "email"], "properties": { "name": { "type": "string" }, "email": { "type": "string" } } }
  }
}

workflow handle {
  label: "Handle"

  root {
    type: code
    label: "Entry"
    inputSchema: contact_payload
    outputSchema: contact_payload
    code: @ts {
      const { name, email } = context.nodes.root.input
      return { name: name.trim(), email: email.trim().toLowerCase() }
    }
  }

  node greet {
    type: code
    label: "Greet"
    schema: @json {
      {
        "type": "object",
        "required": ["greeting"],
        "properties": { "greeting": { "type": "string" } }
      }
    }
    code: @ts {
      return { greeting: "Hello, " + context.nodes.root.output.name + "!" }
    }
  }

  flow { root -> greet }
}
```

### Map / while subgraph root

Inside a `subgraph { }` block on a `map` or `while` node, the root **must** declare `inputSchema`. The validator emits: `map/while subgraph root must declare inputSchema for typed iteration`. This types `context.iteration.item` (map) or `context.iteration.input` (while). See `workflow-subgraph`.

### Best practice

Define `outputSchema` (root) and `schema` (every non-root node that produces data) — or factor them into a top-level `schema <name> { }` block and reference by name. This enables LSP autocomplete for all downstream `@ts` blocks. Without schemas, `context.nodes.<name>.output` is typed as `unknown` and the LSP cannot help.

### Vendor-managed types

Some node types have their output shape fixed by the vendor API. Do not set `schema:` on them — the validator errors: `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

Vendor-managed types:
- `scrape`
- `parallel`
- `email`
- `disk`

These types provide their own runtime type shape; the LSP uses it automatically.

### AI text + schema warning

`type: ai` with `kind: text` produces a plain string output. Setting `schema:` on it is a warning: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` Either drop the schema or change `kind` to `object` for structured JSON output.
