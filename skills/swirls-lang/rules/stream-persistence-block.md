---
title: Persistence Block
impact: MEDIUM
tags: stream, persistence, condition, enabled
---

## Persistence Block

A `persistence { }` block inside a graph stores each execution's node outputs in a queryable stream. The `condition` determines whether a given execution is persisted.

**Incorrect (persistence without condition):**

```swirls
graph my_graph {
  label: "My Graph"
  persistence {
    enabled: true
  }
  root { ... }
}
```

Error: "persistence block requires a non-empty condition (@ts { } or @ts '...')"

**Correct (persistence with condition):**

```swirls
graph submissions {
  label: "Record submission"

  persistence {
    enabled: true
    condition: @ts {
      return true
    }
  }

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score": { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    code: @ts {
      const { score, message } = context.nodes.root.input
      return { score: Number(score) ?? 0, message: String(message ?? "").trim() }
    }
  }
}
```

Persistence fields:
| Field | Required | Type |
|-------|----------|------|
| `enabled` | yes | Boolean |
| `condition` | yes | `@ts` block (must return boolean) |
| `name` | no | String (defaults to graph name) |

Rules:
- One graph = at most one stream
- Stream name defaults to graph name unless `name:` is specified
- Condition must be a non-empty `@ts` block returning `true` (persist) or `false` (skip)
- `name` must match `[a-zA-Z_][a-zA-Z0-9_]*`
