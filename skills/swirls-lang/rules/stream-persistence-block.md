---
title: Persistence Is Top-Level Stream, Not a Block
impact: CRITICAL
tags: stream, persistence, removed, migration, condition, prepare
---

## Persistence Is Top-Level Stream, Not a Block

The old `persistence { }` block inside a workflow has been **removed** from the language. Do not use it. The parser emits a hard error: `persistence { } blocks have been removed — use a top-level stream block instead`.

Replace persistence with a top-level `stream <name> { }` declaration that references the workflow by name.

**Incorrect (uses the removed persistence block):**

```swirls
workflow submissions {
  label: "Record submission"

  persistence {
    enabled: true
    condition: @ts { return true }
  }

  root {
    type: code
    label: "Entry"
    outputSchema: @json { { "type": "object" } }
    code: @ts { return context.nodes.root.input }
  }
}
```

**Correct (top-level stream block):**

```swirls
workflow submissions {
  label: "Record submission"

  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score":   { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["score", "message"],
        "properties": {
          "score":   { "type": "number" },
          "message": { "type": "string" }
        }
      }
    }
    code: @ts {
      const { score, message } = context.nodes.root.input
      return { score: Number(score) || 0, message: String(message ?? "").trim() }
    }
  }
}

stream submission_log {
  label: "Submission log"
  workflow: submissions
  version: v1

  versions: {
    v1 {
      schema: @json {
        {
          "type": "object",
          "required": ["score", "message"],
          "properties": {
            "score":   { "type": "number" },
            "message": { "type": "string" }
          }
        }
      }

      condition: @ts {
        return true
      }

      prepare: @ts {
        const out = context.output.root!
        return { score: out.score, message: out.message }
      }
    }
  }
}
```

### Key differences from the old persistence block

| Old persistence | New top-level stream |
|-----------------|----------------------|
| Inside `workflow { }` | Top-level block `stream <name> { }` |
| Single implicit shape | **One or more `versions:`**, each with an explicit, required `schema` |
| No version pointer | **Required `version:`** names the active writer version |
| No mapping layer | **Required `prepare: @ts { ... }` per version** returns the shape |
| `condition:` optional | `condition:` optional per version (must be non-empty if given) |
| Stream name defaulted to workflow name | Stream has its own `<name>`; multiple streams can reference one workflow |
| Context accessed via `context.nodes` | `prepare` / `condition` access `context.output.<leafNode>` plus `context.nodes` |

### Why it changed

The old model coupled "what to store" to the workflow definition. The new model separates concerns: workflows produce outputs, and one or more top-level stream blocks each decide whether and how to persist those outputs. This lets you add, remove, or re-shape persistence without editing the workflow, and lets multiple streams tap the same workflow output with different schemas and conditions.

See `resource-stream` for the full spec of top-level `stream { }` blocks and `node-stream` for reading persisted records.
