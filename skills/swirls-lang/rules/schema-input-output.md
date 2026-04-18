---
title: inputSchema, outputSchema, and schema
impact: HIGH
tags: schema, inputSchema, outputSchema, root, typing
---

## inputSchema, outputSchema, and schema

The three schema keywords each have a specific placement. The parser enforces this strictly and **rejects misplaced schema keys**.

| Keyword | Valid on | Purpose |
|---------|----------|---------|
| `inputSchema` | **root only** | Shape of the trigger payload. Drives `context.nodes.root.input` typing in the LSP. |
| `outputSchema` | **root only** | Shape of what the root node returns. |
| `schema` | **non-root nodes only** | Shape of what that node returns. Equivalent to outputSchema for non-root nodes. |

### Strict parser rules

- `inputSchema` on a non-root node → parser error: `inputSchema is only allowed in root { } blocks`. The entire node is dropped from the AST.
- `outputSchema` on a non-root node → parser error: `Use "schema" instead of "outputSchema" in node blocks`. The entire node is dropped from the AST.
- `schema` on root is technically accepted but redundant — use `outputSchema` on root.

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
root {
  type: code
  label: "Entry"
  inputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":  { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
  outputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":  { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
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
```

### Best practice

Define `outputSchema` on the root node and `schema` on every non-root node that produces data. This enables LSP autocomplete for all downstream `@ts` blocks. Without schemas, `context.nodes.<name>.output` is typed as `unknown` and the LSP cannot help.

### Vendor-managed types

Some node types have their output shape fixed by the vendor API. Do not set `schema:` on them — the validator errors: `"<type>" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

Vendor-managed types:
- `firecrawl`
- `parallel`
- `resend`

These types provide their own runtime type shape; the LSP uses it automatically.
