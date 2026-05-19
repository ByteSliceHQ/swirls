---
title: Map Nodes
impact: HIGH
tags: node, map, iteration, items, subgraph, concurrency, maxItems, loop, fanout
---

## Map Nodes

A `map` node iterates over an array and runs a child graph (inline `subgraph { }` or referenced `graph: <name>`) once per element. Output is an array of the child graph's leaf-node outputs in the same order as `items`.

### Required fields

- `items` — `@ts` block returning an array. Each element becomes the iteration item.
- `maxItems` — positive number. Hard cap; the validator rejects unbounded loops.
- Exactly one of:
  - `subgraph { ... }` — inline child graph (no colon). The inline form's root must declare `inputSchema`.
  - `graph: <name>` — bare identifier referencing a top-level graph in the workspace. That graph's root must declare `inputSchema`.

### Optional fields

- `concurrency` — positive integer. How many iterations run in parallel. Defaults to a runtime-chosen value when omitted.
- `label`, `description`, `secrets`, `failurePolicy` — same as any other node.

### Inline subgraph (typical)

```swirls
node per_ticket {
  type: map
  label: "Process each ticket"
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100
  concurrency: 2

  subgraph {
    root {
      type: code
      label: "Normalize"
      inputSchema: @json {
        {
          "type": "object",
          "required": ["id", "body"],
          "properties": {
            "id":   { "type": "string" },
            "body": { "type": "string" }
          },
          "additionalProperties": false
        }
      }
      code: @ts {
        const item = context.iteration.item
        return { id: item.id, body: item.body.trim() }
      }
    }

    node triage {
      type: code
      label: "Triage"
      schema: @json {
        {
          "type": "object",
          "required": ["priority"],
          "properties": { "priority": { "type": "number" } }
        }
      }
      code: @ts {
        const urgent = /urgent|outage/i.test(context.nodes.root.output.body)
        return { priority: urgent ? 3 : 1 }
      }
    }

    flow { root -> triage }
  }
}
```

### Referenced graph

```swirls
graph normalize_ticket {
  label: "Normalize ticket"
  root {
    type: code
    inputSchema: @json {
      { "type": "object", "required": ["id", "body"], "properties": { "id": { "type": "string" }, "body": { "type": "string" } } }
    }
    code: @ts {
      const item = context.iteration.item
      return { id: item.id, body: item.body.trim() }
    }
  }
}

node per_ticket {
  type: map
  label: "Process each"
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100
  graph: normalize_ticket
}
```

### `context.iteration.item`

Inside the subgraph (or referenced graph), each iteration sees its element on `context.iteration.item`. The shape is whatever the subgraph root's `inputSchema` declares. See `context-iteration`.

### Output shape

The map node's output is an array of objects keyed by leaf-node name in the child graph:

```ts
context.nodes.per_ticket.output[i].<leafName>
```

If the child has a single leaf called `triage`:

```swirls
node merge {
  type: code
  code: @ts {
    const rows = context.nodes.per_ticket.output
    return { count: rows.filter(r => r.triage?.priority >= 3).length }
  }
}
```

### Validator errors

- `Node type "map" requires "items"` — Add `items: @ts { return [...] }`.
- `Node type "map" requires "maxItems"` — Add `maxItems: <number>`.
- `map node requires maxItems as a positive number` — `maxItems` was missing or not positive.
- `map node concurrency must be a positive integer when set` — `concurrency` was zero, negative, or non-integer.
- `map node requires exactly one of subgraph { } or graph: <name>` — You set both, or neither.
- `Node references graph "<n>" which is not defined` — `graph: <n>` does not match any graph in the workspace.
- `map/while subgraph root must declare inputSchema for typed iteration` — The inline root (or the referenced graph's root) is missing `inputSchema`.

### Common mistakes

- **`subgraph: { ... }`** — `subgraph` is a bare block, not a key:value pair. No colon.
- **Both `subgraph { }` and `graph: <name>`** — Pick one. The validator rejects both-set and neither-set.
- **No `maxItems`** — Unbounded loops are rejected. Pick a real cap.
- **Subgraph root has no `inputSchema`** — Required for typed iteration.
- **Treating output as a flat list of leaf values** — Output is `[{ leafName: leafOutput }, ...]`, not `[leafOutput, ...]`. Index by leaf name.
