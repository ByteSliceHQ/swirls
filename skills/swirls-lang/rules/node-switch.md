---
title: Switch Nodes
impact: HIGH
tags: node, switch, routing, cases, router, conditional
---

## Switch Nodes

Switch nodes route execution to one of several branches based on a TypeScript router function. The router returns a case name that determines which labeled edge to follow.

**Required fields:** `cases`, `router`

**Incorrect (router returns value not in cases):**

```swirls
node route {
  type: switch
  label: "Route"
  cases: ["a", "b"]
  router: @ts {
    return "c"
  }
}
```

The router must return one of the declared case strings.

**Incorrect (edges missing labels for switch):**

```swirls
flow {
  root -> classify
  classify -> handle_a
  classify -> handle_b
}
```

Switch nodes require labeled edges.

**Correct (switch with labeled edges):**

```swirls
node classify {
  type: switch
  label: "Classify urgency"
  cases: ["urgent", "normal", "low"]
  router: @ts {
    const body = (context.nodes.root.output.body ?? "").toLowerCase()
    if (body.includes("urgent") || body.includes("asap")) return "urgent"
    if (body.length > 500) return "normal"
    return "low"
  }
}

node handle_urgent {
  type: ai
  kind: text
  label: "Draft escalation"
  model: "google/gemini-2.5-flash"
  prompt: @ts {
    return "Draft escalation for: " + context.nodes.root.output.subject
  }
}

node handle_normal {
  type: code
  label: "Standard response"
  code: @ts { return { status: "acknowledged" } }
}

node handle_low {
  type: code
  label: "Auto-acknowledge"
  code: @ts { return { status: "logged" } }
}

flow {
  root -> classify
  classify -["urgent"]-> handle_urgent
  classify -["normal"]-> handle_normal
  classify -["low"]-> handle_low
}
```

Switch node fields:
| Field | Required | Type |
|-------|----------|------|
| `cases` | yes | String array |
| `router` | yes | `@ts` block (must return a case string) |
