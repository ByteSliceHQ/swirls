---
title: context.nodes - Accessing Node Data
impact: HIGH
tags: context, nodes, input, output, upstream, downstream
---

## context.nodes - Accessing Node Data

In `@ts` blocks, `context.nodes` provides access to all ancestor node inputs and outputs. The root node has both `input` (trigger payload) and `output` (its return value). Downstream nodes access upstream outputs.

**Incorrect (accessing input on a non-root node):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    // Non-root nodes don't have .input in the typical sense
    const email = context.nodes.process.input.email
    return { email }
  }
}
```

**Correct (root accesses input, downstream accesses output):**

```swirls
root {
  type: code
  label: "Entry"
  code: @ts {
    // Root has .input from the trigger payload
    const email = context.nodes.root.input.email ?? ""
    return { email: email.toLowerCase() }
  }
}

node enrich {
  type: code
  label: "Enrich"
  code: @ts {
    // Downstream accesses root's output
    const email = context.nodes.root.output.email
    return { email, domain: email.split("@")[1] ?? "" }
  }
}
```

**Correct (accessing any upstream node):**

```swirls
node result {
  type: code
  label: "Result"
  code: @ts {
    const rootEmail = context.nodes.root.output.email
    const enrichDomain = context.nodes.enrich.output.domain
    return { email: rootEmail, domain: enrichDomain }
  }
}
```

**Accessing subgraph output:**

When using a `type: graph` node, the output is keyed by the child graph's leaf node names:

```swirls
node result {
  type: code
  label: "Result"
  code: @ts {
    // run_helper is a graph node calling helper_graph
    // helper_graph's root is its leaf node
    const out = context.nodes.run_helper.output.root
    return { doubled: out.value }
  }
}
```

Pattern summary:
- `context.nodes.root.input` - trigger payload (root node only)
- `context.nodes.<name>.output` - any upstream node's return value
- `context.nodes.<graphNode>.output.<leafName>` - subgraph leaf output
