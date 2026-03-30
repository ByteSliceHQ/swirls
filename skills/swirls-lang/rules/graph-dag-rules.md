---
title: DAG Constraints
impact: CRITICAL
tags: graph, dag, cycle, validation, edges
---

## DAG Constraints

Graphs must be directed acyclic graphs (DAGs). The validator enforces no cycles, exactly one root, and valid edge references.

**Incorrect (cycle in edges):**

```swirls
flow {
  root -> step_a
  step_a -> step_b
  step_b -> step_a
}
```

Error: "Graph contains a cycle - DAG workflows cannot have cycles"

**Incorrect (edge references non-existent node):**

```swirls
flow {
  root -> process
  process -> nonexistent_node
}
```

Error: "Edge references non-existent target node 'nonexistent_node'"

**Incorrect (self-referencing edge):**

```swirls
flow {
  root -> root
}
```

Error: "Edge cannot connect a node to itself"

**Correct (valid DAG with parallel and sequential branches):**

```swirls
graph pipeline {
  label: "Pipeline"

  root {
    type: code
    label: "Entry"
    code: @ts { return context.nodes.root.input ?? {} }
  }

  node enrich { type: code label: "Enrich" code: @ts { return {} } }
  node validate { type: code label: "Validate" code: @ts { return {} } }
  node combine { type: code label: "Combine" code: @ts { return {} } }

  flow {
    root -> enrich
    root -> validate
    enrich -> combine
    validate -> combine
  }
}
```

Validation rules:
- No cycles (topological sort must include all nodes)
- Exactly one node with zero incoming edges (the root)
- The zero-incoming-edge node must be declared with `root { }` syntax
- All edge sources and targets must reference existing node names
- No self-edges
