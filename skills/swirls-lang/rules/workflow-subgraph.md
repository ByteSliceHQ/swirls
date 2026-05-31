---
title: Inline `subgraph { }` Block (Map / While)
impact: HIGH
tags: workflow, subgraph, inline, map, while, iteration, no-colon, body
---

## Inline `subgraph { }` Block

`map` and `while` nodes can either reference a top-level workflow by name (`workflow: <name>`) or define the iteration body inline as a `subgraph { ... }` block. The inline form is keyword-only — **no colon, no quotes, no value**.

### Syntax

```swirls
node <name> {
  type: map        // or while
  // ... other map/while fields ...

  subgraph {
    root { ... }
    node child1 { ... }
    node child2 { ... }
    flow {
      root -> child1
      child1 -> child2
    }
  }
}
```

### Body shape

`subgraph { }` accepts the same inner body as `workflow { }`:

- Exactly one `root { }` block (entry node).
- Zero or more `node <name> { }` blocks.
- Optional `flow { }` block with edges.

But it does **NOT** accept its own `label:` or `description:` at the top level. Both are parser errors:

```
label is not valid inside subgraph { }
description is not valid inside subgraph { }
```

The subgraph runs in the parent workflow's namespace; it does not have a separate name or display label.

### Required: `inputSchema` on the root

The subgraph root **must** declare `inputSchema`. This is required so the iteration item (for `map`) or per-iteration input (for `while`) is typed. The validator emits:

```
map/while subgraph root must declare inputSchema for typed iteration
```

`inputSchema` accepts inline `@json { }`, an inline object literal, or a bare top-level schema name.

### Example (map): multi-node subgraph

```swirls
node per_ticket {
  type: map
  items: @ts { return context.nodes.root.output.tickets }
  maxItems: 100
  concurrency: 2

  subgraph {
    root {
      type: code
      label: "Normalize"
      inputSchema: support_ticket_item
      code: @ts {
        const item = context.iteration.item
        return { id: item.id, body: item.body.trim() }
      }
    }

    node triage {
      type: code
      schema: @json { ... }
      code: @ts { return { priority: 1 } }
    }

    node handoff {
      type: code
      schema: @json { ... }
      code: @ts {
        return {
          ticketId: context.nodes.root.output.id,
          priority: context.nodes.triage.output.priority,
        }
      }
    }

    flow {
      root -> triage
      triage -> handoff
    }
  }
}
```

### Example (while): two-node subgraph

```swirls
node refine_digest {
  type: while
  input: @ts { return { draft: context.nodes.merge.output.draft } }
  condition: @ts { return context.iteration.index < 3 }
  update: @ts {
    return { draft: context.iteration.previous?.polish?.text ?? context.iteration.input.draft }
  }
  maxIterations: 5

  subgraph {
    root {
      type: code
      inputSchema: digest_draft
      code: @ts { return { blob: context.iteration.input.draft } }
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

### Inline subgraph vs. referenced workflow

Pick one based on reuse:

- **Inline `subgraph { }`** — The iteration body is single-purpose and lives next to the loop. Easier to read top-to-bottom.
- **`workflow: <name>`** — The same body is used elsewhere too, or the body is large enough to want its own file/section. The referenced workflow's root must still declare `inputSchema`.

The validator rejects both-set and neither-set:

```
map node requires exactly one of subgraph { } or workflow: <name>
while node requires exactly one of subgraph { } or workflow: <name>
```

### DAG rules apply

The subgraph is a DAG: exactly one root (the `root { }` block), no cycles, every edge target must be a declared node. The validator runs `dagValidation` on it just like any top-level workflow.

### Edges live in `flow { }`

Edges inside a subgraph go in a `flow { }` block, same as a top-level workflow:

```swirls
subgraph {
  root { ... }
  node next { ... }
  flow { root -> next }   // OK
}
```

`root -> next` outside `flow { }` is a parser error: `Edge declarations must be inside a flow { } block`.

### Iteration context

The subgraph (or referenced workflow) sees `context.iteration.*` instead of just `context.nodes.root.input`. See `context-iteration`.
