---
title: inputSchema, outputSchema, and schema
impact: HIGH
tags: schema, inputSchema, outputSchema, root, typing
---

## inputSchema, outputSchema, and schema

`inputSchema` defines the shape of data a node receives. `outputSchema` (on root nodes) and `schema` (on non-root nodes) define what a node produces. The LSP uses these to type `context.nodes.<name>.input` and `context.nodes.<name>.output` for autocomplete and validation. Using `outputSchema` on non-root nodes causes a parse error.

**Key rule:** `inputSchema` is meaningful only on the root node. It defines the shape of the trigger payload. On non-root nodes, input is derived from upstream node outputs via the flow edges.

**Incorrect (inputSchema on a non-root node for typing upstream):**

```swirls
node process {
  type: code
  label: "Process"
  inputSchema: @json {
    { "type": "object", "properties": { "email": { "type": "string" } } }
  }
  code: @ts {
    return { email: context.nodes.root.output.email }
  }
}
```

Defining `inputSchema` on non-root nodes is allowed but rarely useful. The LSP infers input types from upstream `schema` declarations.

**Correct (inputSchema on root, outputSchema on root, schema on non-root nodes):**

```swirls
root {
  type: code
  label: "Entry"
  inputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
  outputSchema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      },
      "additionalProperties": false
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

Best practice: define `outputSchema` on the root node and `schema` on every non-root node that produces data. This enables LSP autocomplete for all downstream `@ts` blocks. Using `outputSchema` on non-root nodes causes a parse error.
