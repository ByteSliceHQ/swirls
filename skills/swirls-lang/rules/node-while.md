---
title: While Nodes
impact: HIGH
tags: node, while, loop, condition, update, maxIterations, iteration, subgraph
---

## While Nodes

A `while` node runs a child workflow (inline `subgraph { }` or referenced `workflow: <name>`) repeatedly until `condition` returns false or `maxIterations` is reached. Each iteration receives the previous iteration's output via `update`.

### Required fields

- `input` — `@ts` block returning the initial loop state object passed into iteration 0.
- `condition` — `@ts` block returning a boolean. Loop continues **while** this is true.
- `update` — `@ts` block returning the next iteration's input. Has access to the previous iteration's output.
- `maxIterations` — positive integer. Hard cap to prevent runaway loops.
- Exactly one of:
  - `subgraph { ... }` — inline child workflow (no colon). The inline form's root must declare `inputSchema`.
  - `workflow: <name>` — bare identifier referencing a top-level workflow in the workspace. That workflow's root must declare `inputSchema`.

### Inline subgraph

```swirls
node refine_digest {
  type: while
  label: "Iteratively tighten digest"

  input: @ts {
    return { draft: context.nodes.merge_digest.output.draft }
  }

  condition: @ts {
    return context.iteration.index < 2
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
      label: "Expand"
      inputSchema: @json {
        { "type": "object", "required": ["draft"], "properties": { "draft": { "type": "string" } } }
      }
      code: @ts {
        return { blob: `pass ${context.iteration.index}: ${context.iteration.input.draft}` }
      }
    }

    node polish {
      type: code
      label: "Polish text"
      schema: @json {
        { "type": "object", "required": ["text"], "properties": { "text": { "type": "string" } } }
      }
      code: @ts {
        return { text: context.nodes.root.output.blob.trim() }
      }
    }

    flow { root -> polish }
  }
}
```

### Iteration context

Inside the subgraph:

- `context.iteration.input` — the input object for **this** iteration (returned by `update` from the previous iteration, or by the outer `input` field on iteration 0).
- `context.iteration.index` — zero-based iteration counter.
- `context.iteration.previous` — the **previous** iteration's leaf outputs (`{ leafName: leafOutput }` shape). `undefined` on iteration 0.

`update` runs **between** iterations and uses the same context to compute the next input. See `context-iteration`.

### Output shape

The while node's output is an object with `lastOutput`, keyed by the child workflow's leaf-node names:

```ts
context.nodes.refine_digest.output.lastOutput.<leafName>
```

For the example above:

```swirls
node done {
  type: code
  code: @ts {
    return {
      summary: context.nodes.refine_digest.output.lastOutput.polish?.text ?? ""
    }
  }
}
```

### Loop semantics

`while` is a **do-while (post-check) loop**: the subgraph always runs at least once, then `condition` decides whether to run another iteration. There is no pre-loop condition check.

1. **Iteration 0**: `input` runs; result becomes `context.iteration.input`. The subgraph runs (unconditionally — `condition` has not been consulted yet).
2. After each iteration the engine evaluates **`condition` first** — it sees this iteration's input and its leaf outputs (`context.iteration.previous`). If `condition` is false, the loop stops here and `update` does **not** run. Only if `condition` is true does `update` run to compute the next iteration's `context.iteration.input`.
3. **maxIterations**: even if `condition` keeps returning true, the loop stops at this count (and `condition`/`update` are skipped on that final iteration). The last iteration's leaf outputs become `output.lastOutput`.
4. Because it is post-check, the subgraph runs at least once whenever `maxIterations >= 1` (which the validator requires). To "skip" work, branch inside the subgraph; you cannot make a `while` run zero times.

### Validator errors

- `Node type "while" requires "input" / "condition" / "update" / "maxIterations"` — Required field missing.
- `while node requires maxIterations as a positive integer` — Must be ≥ 1 and integer.
- `while node requires exactly one of subgraph { } or workflow: <name>` — Pick one.
- `Node references workflow "<n>" which is not defined` — `workflow: <n>` is unknown in the workspace.
- `map/while subgraph root must declare inputSchema for typed iteration` — Add `inputSchema` to the inline root or the referenced workflow's root.

### Common mistakes

- **Missing `update`** — Without `update`, the next iteration would receive the same input. The validator requires it.
- **Returning the wrong shape from `update`** — `update` must return an object matching the subgraph root's `inputSchema`. Otherwise iteration N+1 fails to type-check.
- **Forgetting `maxIterations`** — Required. Defends against logic errors that would loop forever.
- **Using `context.iteration.previous` on iteration 0** — `previous` is `undefined` on the first iteration. Use `?.` or guard with `context.iteration.index > 0`.
- **Treating `output.lastOutput` as a list** — While runs sequentially; output is the **single** last iteration's leaves, not an array.
