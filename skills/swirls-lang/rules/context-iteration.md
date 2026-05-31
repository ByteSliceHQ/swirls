---
title: context.iteration - Map / While Iteration Data
impact: HIGH
tags: context, iteration, map, while, item, index, input, previous, loop
---

## context.iteration - Map / While Iteration Data

Inside a `map` or `while` node's child workflow (inline `subgraph { }` or referenced `workflow: <name>`), `context.iteration` carries the per-iteration state. The fields available depend on the node type.

### `map` nodes

| Field | Type | Notes |
|-------|------|-------|
| `context.iteration.item` | The current element from `items: @ts { return [...] }`. Typed by the subgraph root's `inputSchema`. | Available on every iteration. |
| `context.iteration.index` | Number | Zero-based iteration counter. |

`map` runs all iterations in parallel up to `concurrency`. Each iteration's `context.iteration.item` is independent.

```swirls
node per_ticket {
  type: map
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100

  subgraph {
    root {
      type: code
      inputSchema: ticket_item_schema
      code: @ts {
        const item = context.iteration.item
        return { id: item.id, body: item.body.trim() }
      }
    }
  }
}
```

### `while` nodes

| Field | Type | Notes |
|-------|------|-------|
| `context.iteration.input` | object | The input for **this** iteration. Iteration 0 receives the value from the outer `input:` field; later iterations receive what `update:` returned. Typed by the subgraph root's `inputSchema`. |
| `context.iteration.index` | Number | Zero-based iteration counter. |
| `context.iteration.previous` | `{ leafName: leafOutput }` or `undefined` | The previous iteration's leaf-node outputs. `undefined` on iteration 0. |

```swirls
node refine_digest {
  type: while
  input: @ts { return { draft: context.nodes.merge.output.draft } }

  condition: @ts {
    return context.iteration.index < 3
  }

  update: @ts {
    const nextDraft =
      context.iteration.previous?.polish?.text ??
      context.iteration.input.draft
    return { draft: nextDraft }
  }

  maxIterations: 5

  subgraph {
    root {
      type: code
      inputSchema: digest_draft_schema
      code: @ts {
        return { blob: context.iteration.input.draft + " (pass " + context.iteration.index + ")" }
      }
    }

    node polish {
      type: code
      schema: @json { ... }
      code: @ts { return { text: context.nodes.root.output.blob.trim() } }
    }

    flow { root -> polish }
  }
}
```

### Handling iteration 0 in `update`

`update` runs **between** iterations and uses `context.iteration.previous` to compute the next input. On the very first call from iteration 0 to iteration 1, `previous` is the iteration-0 output. Use optional chaining or guard explicitly:

```swirls
update: @ts {
  return {
    draft: context.iteration.previous?.polish?.text ?? context.iteration.input.draft
  }
}
```

### Reading map output downstream

A map node's output is an array of leaf-keyed objects in the original `items` order:

```ts
context.nodes.<map_node>.output  // Array<{ <leafName>: <leafOutput> }>
```

```swirls
node merge {
  type: code
  code: @ts {
    const rows = context.nodes.per_ticket.output
    const total = rows.length
    const urgent = rows.filter(r => r.triage?.priority >= 3).length
    return { total, urgent }
  }
}
```

### Reading while output downstream

A while node's output is the **last** iteration's leaf outputs under `lastOutput`:

```ts
context.nodes.<while_node>.output.lastOutput.<leafName>
```

```swirls
node done {
  type: code
  code: @ts {
    const final = context.nodes.refine_digest.output.lastOutput
    return { summary: final?.polish?.text ?? "" }
  }
}
```

### Common mistakes

- **Treating map output as a flat list** — Each entry is `{ leafName: leafOutput }`, not the leaf output directly. Index by leaf name.
- **Treating while output as an array** — While runs sequentially; output is `output.lastOutput` (single object), not an array of iterations.
- **Reading `context.iteration.previous` on iteration 0** — It's `undefined`. Use `?.` or `if (context.iteration.index > 0) { ... }`.
- **Using `context.nodes.root.input` inside a subgraph** — That's the parent workflow's root input. Use `context.iteration.item` (map) or `context.iteration.input` (while) inside the subgraph.
- **Mutating `context.iteration.input`** — Treat it as read-only. Return a new object from `update` to advance state.
