---
title: Graph Anatomy
impact: CRITICAL
tags: graph, structure, label, description, root, node, flow
---

## Graph Anatomy

A graph is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, exactly one root node, zero or more additional nodes, and an optional `flow { }` block.

**Incorrect (missing root):**

```swirls
graph my_graph {
  label: "My Graph"
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

Every graph must declare exactly one `root { }` block.

**Correct (complete graph structure):**

```swirls
graph my_graph {
  label: "My Graph"
  description: "Optional description"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }
    code: @ts {
      return context.nodes.root.input ?? {}
    }
  }

  node process {
    type: code
    label: "Process"
    schema: @json {
      { "type": "object", "properties": { "result": { "type": "string" } } }
    }
    code: @ts {
      const x = context.nodes.root.output.x
      return { result: x }
    }
  }

  flow {
    root -> process
  }
}
```

### Valid top-level keys inside `graph { }`

| Key | Required | Notes |
|-----|----------|-------|
| `label:` | implicit required | Display string. Defaults to the graph name if omitted. |
| `description:` | no | Free-form. |
| `root { }` | yes | Exactly one; the entry node. Uses `root { }` syntax, not `node root { }`. |
| `node <name> { }` | no | Zero or more additional nodes. |
| `flow { }` | no (required if there are edges) | Contains edge declarations. |

### Constructs that are NOT valid inside `graph { }`

- `persistence { }` — removed. The parser errors with a migration message. Use a top-level `stream { }` block instead. See `stream-persistence-block` and `resource-stream`.
- Edge lines at graph scope (`root -> foo` outside `flow { }`) — parser error: `Edge declarations must be inside a flow { } block`.
- `stream:` at graph scope (outside a node) — parser error: `"stream:" is only valid inside a node { } block`.
- Bare `type:`, `schema:`, `prompt:` at graph scope — these only belong inside `root { }` or `node { }` bodies.

### Persistence

To persist a graph's output, add a **top-level** `stream <name> { }` block that names the graph. Do not put persistence inside the graph. See `resource-stream`.

```swirls
graph my_graph { ... }

stream my_graph_log {
  graph: my_graph
  schema: @json { ... }
  prepare: @ts { return { ... } }
}
```
