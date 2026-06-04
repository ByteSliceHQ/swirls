---
title: Workflow Nodes (Subworkflows)
impact: HIGH
tags: node, workflow, graph, subgraph, input, output
---

## Workflow Nodes (Subworkflows)

`type: workflow` nodes call another workflow as a subworkflow. The child workflow runs independently with the provided input, and its leaf node outputs become available to downstream nodes. (`type: graph` is a legacy alias for `type: workflow`, and the `graph:` reference field is a legacy alias for `workflow:`. Both are normalized to the `workflow` forms.)

**Required fields:** `workflow`, `input`

**Incorrect (missing input):**

```swirls
node run_helper {
  type: workflow
  label: "Run helper"
  workflow: helper_workflow
}
```

Error: `Node type "workflow" requires "input"`

**Cross-file references resolve across the workspace:**

```swirls
// helper.swirls defines helper_workflow
// main.swirls references it
node run_helper {
  type: workflow
  label: "Run helper"
  workflow: helper_workflow
  input: @ts { return context.nodes.root.input }
}
```

`swirls doctor` and deploy build a workspace index of every `.swirls` file under the working directory, so a workflow declared in another file resolves. `Workflow node references workflow "<n>" which is not defined` fires only when the name matches no workflow anywhere in the workspace (single-file tools without a workspace index may also report it until the full workspace is considered).

**Correct (child workflow in the same file):**

```swirls
workflow helper_workflow {
  label: "Helper"
  root {
    type: code
    label: "Double"
    inputSchema: @json {
      { "type": "object", "required": ["value"], "properties": { "value": { "type": "number" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["value"], "properties": { "value": { "type": "number" } } }
    }
    code: @ts {
      return { value: context.nodes.root.input.value * 2 }
    }
  }
}

workflow main_workflow {
  label: "Main"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "required": ["value"], "properties": { "value": { "type": "number" } } }
    }
    code: @ts { return { value: context.nodes.root.input.value } }
  }

  node run_helper {
    type: workflow
    label: "Run helper"
    workflow: helper_workflow
    input: @ts {
      return context.nodes.root.input
    }
  }

  node result {
    type: code
    label: "Result"
    code: @ts {
      const out = context.nodes.run_helper.output.root
      return { doubled: out.value }
    }
  }

  flow {
    root -> run_helper
    run_helper -> result
  }
}
```

Subworkflow output is accessed as `context.nodes.<workflowNodeName>.output.<leafNodeName>`. The leaf node names come from the child workflow.

Workflow node fields:
| Field | Required | Type |
|-------|----------|------|
| `workflow` | yes | Workflow name (resolved across the workspace). Legacy alias: `graph`. |
| `input` | yes | `@ts` block |

### Related: map / while inline subgraphs

`type: workflow` runs the child workflow **once**. For per-item iteration over a list, use `type: map` (each item runs the child once). For repeated execution until a condition is false, use `type: while`. Both accept either `workflow: <name>` (the same kind of reference shown above) or an inline `subgraph { ... }` block (no colon) — see `node-map`, `node-while`, and `workflow-subgraph`.
