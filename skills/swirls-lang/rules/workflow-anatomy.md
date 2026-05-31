---
title: Workflow Anatomy
impact: CRITICAL
tags: workflow, structure, label, description, root, node, flow
---

## Workflow Anatomy

A workflow is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, exactly one root node, zero or more additional nodes, and a flow block.

**Incorrect (missing required parts):**

```swirls
workflow my_workflow {
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

This fails because there is no `label` and no `root { }` block.

**Correct (complete workflow structure):**

```swirls
workflow my_workflow {
  label: "My Workflow"
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

Workflow fields:
- `label` - Required display name
- `description` - Optional description
- `root { }` - Required entry node (exactly one)
- `node <name> { }` - Additional nodes (zero or more)
- `flow { }` - Edge declarations connecting nodes
