---
title: Flow Block and Edges
impact: CRITICAL
tags: graph, flow, edges, labeled, switch
---

## Flow Block and Edges

The `flow { }` block connects nodes with directed edges. Simple edges use `->`. Labeled edges (for switch nodes) use `-["label"]->`.

**Incorrect (wrong edge syntax):**

```swirls
flow {
  root => process           // Wrong: use -> not =>
  root -> process -> done   // Wrong: no chaining
  classify -[urgent]-> h    // Wrong: label must be quoted
}
```

**Correct (valid edge syntax):**

```swirls
flow {
  root -> process
  process -> done
}
```

**Correct (labeled edges for switch routing):**

```swirls
node classify {
  type: switch
  label: "Classify"
  cases: ["urgent", "normal", "low"]
  router: @ts {
    const body = context.nodes.root.output.body.toLowerCase()
    if (body.includes("urgent")) return "urgent"
    if (body.length > 500) return "normal"
    return "low"
  }
}

node handle_urgent {
  type: ai
  kind: text
  label: "Handle urgent"
  model: "google/gemini-2.5-flash"
  prompt: @ts { return context.nodes.root.output.body }
}

node handle_normal {
  type: code
  label: "Handle normal"
  code: @ts { return { status: "normal" } }
}

flow {
  root -> classify
  classify -["urgent"]-> handle_urgent
  classify -["normal"]-> handle_normal
  classify -["low"]-> handle_low
}
```

Edge rules:
- One edge per line: `source -> target`
- Labeled edges: `source -["label"]-> target`
- Labels must be quoted strings matching a case in the switch node
- Source and target must reference defined node names
- No chaining: each edge is its own line
- Parallel branches are fine (root -> a, root -> b)
