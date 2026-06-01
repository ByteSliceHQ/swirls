---
title: Workflow Anatomy
impact: CRITICAL
tags: workflow, structure, label, description, root, node, flow
---

## Workflow Anatomy

A workflow is a directed acyclic graph (DAG) of nodes connected by edges. It contains a label, optional description, exactly one root node, zero or more additional nodes, and an optional `flow { }` block.

**Incorrect (missing root):**

```swirls
workflow my_workflow {
  label: "My Workflow"
  node step1 {
    type: code
    label: "Step"
    code: @ts { return {} }
  }
}
```

Every workflow must declare exactly one `root { }` block.

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

### Valid top-level keys inside `workflow { }`

| Key | Required | Notes |
|-----|----------|-------|
| `label:` | implicit required | Display string. Defaults to the workflow name if omitted. |
| `description:` | no | Free-form. |
| `root { }` | yes | Exactly one; the entry node. Uses `root { }` syntax, not `node root { }`. |
| `node <name> { }` | no | Zero or more additional nodes. |
| `flow { }` | no (required if there are edges) | Contains edge declarations. |

### Constructs that are NOT valid inside `workflow { }`

- `persistence { }` — removed. The parser errors with a migration message. Use a top-level `stream { }` block instead. See `stream-persistence-block` and `resource-stream`.
- Edge lines at workflow scope (`root -> foo` outside `flow { }`) — parser error: `Edge declarations must be inside a flow { } block`.
- `stream:` at workflow scope (outside a node) — parser error: `"stream:" is only valid inside a node { } block`.
- Bare `type:`, `schema:`, `prompt:` at workflow scope — these only belong inside `root { }` or `node { }` bodies.

### Persistence

To persist a workflow's output, add a **top-level** `stream <name> { }` block that names the workflow. Do not put persistence inside the workflow. See `resource-stream`.

```swirls
workflow my_workflow { ... }

stream my_workflow_log {
  workflow: my_workflow
  version: v1
  versions: {
    v1 {
      schema: @json { ... }
      prepare: @ts { return { ... } }
    }
  }
}
```
