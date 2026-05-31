---
title: Workflow Nodes (Subgraphs)
impact: HIGH
tags: node, workflow, subgraph, input, output
---

## Workflow Nodes (Subgraphs)

Workflow nodes call another workflow as a subgraph. The child workflow runs independently with the provided input, and its leaf node outputs become available to downstream nodes.

**Required fields:** `workflow`, `input`

**Incorrect (missing input):**

```swirls
node run_helper {
  type: workflow
  label: "Run helper"
  workflow: helper_workflow
}
```

Error: "Node type 'workflow' requires 'input'"

**Cross-file workflow refs:** `workflow:` may name a `workflow` declared in **another** `.swirls` file. `swirls doctor` builds a workspace index and resolves the name across the tree (single-file / LSP validation still requires the workflow in that file).

**Example (helper workflow in the same file—simplest layout):**

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

Subgraph output is accessed as `context.nodes.<workflowNodeName>.output.<leafNodeName>`. The leaf node names come from the child workflow.

Workflow node fields:
| Field | Required | Type |
|-------|----------|------|
| `workflow` | yes | Workflow name (workspace-resolvable across `.swirls` files under `swirls doctor`) |
| `input` | yes | `@ts` block |
