---
title: Root Node Requirements
impact: CRITICAL
tags: graph, root, entry, inputSchema
---

## Root Node Requirements

Every graph must have exactly one `root { }` block. The root is the entry point. It receives the trigger payload via `context.nodes.root.input`. It is the only node that should use `inputSchema`.

**Incorrect (using node instead of root for entry):**

```swirls
graph my_graph {
  label: "My Graph"

  node entry {
    type: code
    label: "Entry"
    code: @ts { return {} }
  }
}
```

This fails validation: "Graph must declare root { } as the entry node."

**Incorrect (multiple root blocks):**

```swirls
graph my_graph {
  label: "My Graph"

  root {
    type: code
    label: "Entry A"
    code: @ts { return {} }
  }

  root {
    type: code
    label: "Entry B"
    code: @ts { return {} }
  }
}
```

**Correct (single root block with inputSchema):**

```swirls
graph my_graph {
  label: "My Graph"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["email"],
        "properties": {
          "email": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["email"],
        "properties": {
          "email": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
    code: @ts {
      const email = context.nodes.root.input.email ?? ""
      return { email: email.toLowerCase().trim() }
    }
  }
}
```

Root node rules:
- Declared with `root { }` syntax (not `node root { }`)
- Exactly one per graph
- Must have no incoming edges in the flow block
- Only node where `inputSchema` is meaningful (defines trigger payload shape)
- Can be any node type (code, ai, switch, etc.)
