---
title: Graph Anatomy
impact: CRITICAL
tags: graph, structure, label, description, persistence, root, node, flow
---

## Graph Anatomy

A graph is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, optional persistence block, exactly one root node, zero or more additional nodes, and a flow block.

**Incorrect (missing required parts):**

```swirls
graph my_graph {
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

This fails because there is no `label` and no `root { }` block.

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

Graph fields:
- `label` - Required display name
- `description` - Optional description
- `persistence { }` - Optional stream persistence config
- `root { }` - Required entry node (exactly one)
- `node <name> { }` - Additional nodes (zero or more)
- `flow { }` - Edge declarations connecting nodes
