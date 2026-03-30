---
title: Graph Nodes (Subgraphs)
impact: HIGH
tags: node, graph, subgraph, input, output
---

## Graph Nodes (Subgraphs)

Graph nodes call another graph as a subgraph. The child graph runs independently with the provided input, and its leaf node outputs become available to downstream nodes.

**Required fields:** `graph`, `input`

**Incorrect (missing input):**

```swirls
node run_helper {
  type: graph
  label: "Run helper"
  graph: helper_graph
}
```

Error: "Node type 'graph' requires 'input'"

**Incorrect (referencing graph in another file):**

```swirls
// helper.swirls defines helper_graph
// main.swirls references it
node run_helper {
  type: graph
  label: "Run helper"
  graph: helper_graph
  input: @ts { return context.nodes.root.input }
}
```

Warning: `swirls doctor` does not resolve cross-file references. It reports "Graph node references graph 'helper_graph' which is not defined." Keep related graphs in the same file.

**Correct (subgraph in same file):**

```swirls
graph helper_graph {
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

graph main_graph {
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
    type: graph
    label: "Run helper"
    graph: helper_graph
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

Subgraph output is accessed as `context.nodes.<graphNodeName>.output.<leafNodeName>`. The leaf node names come from the child graph.

Graph node fields:
| Field | Required | Type |
|-------|----------|------|
| `graph` | yes | Graph name (must be defined in same file) |
| `input` | yes | `@ts` block |
