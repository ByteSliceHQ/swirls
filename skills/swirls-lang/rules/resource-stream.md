---
title: Stream Block Declaration
impact: HIGH
tags: resource, stream, top-level, persistence, graph, schema, condition, prepare
---

## Stream Block Declaration

Top-level `stream <name> { }` blocks persist one graph's output into a named, schema-typed record. They replace the removed `persistence { }` block. A `type: stream` node in another graph can read from the same stream by name to achieve graph-to-graph communication.

**There is no `type:` field on a stream block** — the keyword `stream` identifies the block.

### Syntax

```swirls
stream <name> {
  label: "<optional label>"          // defaults to <name>
  description: "<optional string>"
  enabled: <boolean>                  // optional; default treated as true
  graph: <graph_name>                 // required; graph declared in this file
  schema: @json {                     // recommended; warning if omitted
    { ... JSON Schema for one persisted record ... }
  }
  condition: @ts {                    // optional; return true to persist
    return <boolean expression>
  }
  prepare: @ts {                      // required; return the object to persist
    return { ... }
  }
}
```

`condition` and `prepare` may also be `@ts "path.ts.swirls"` file references.

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `graph` | yes | Bare identifier naming a graph in the same file. |
| `prepare` | yes | Non-empty `@ts { }` or `@ts "…"` reference. Must return the record object. |
| `schema` | recommended | Warning if omitted. JSON Schema for one persisted record. |
| `condition` | no | `@ts` returning boolean; if false, skip persist. If present and empty, the validator errors. |
| `label` | no | Defaults to the stream's name. |
| `description` | no | Free-form description. |
| `enabled` | no | When false, runtime skips persistence but the stream stays in the AST and deployment. |

### Context shape inside `condition` and `prepare`

These `@ts` blocks get a specialized `context`:

- `context.output.<leafNodeName>` — output of each DSL leaf node (node with no outgoing edges). Only leaves that actually executed appear. For a single-node graph, `context.output.root` holds the root output.
- `context.nodes.<name>.input` / `.output` — per-node access for every executed node.
- `context.nodes.root.input` — the graph's trigger input.
- `context.reviews`, `context.secrets`, `context.meta` — as in normal nodes (may be empty on CLI).

Because `context.output` is keyed by leaf, and because `switch` routing means only one branch's leaves run, every leaf key is typed as independently optional by the LSP. Narrowing one case does not narrow sibling cases. Use `'leafName' in context.output`, optional chaining (`?.`), non-null assertion (`!`), or explicit runtime checks on the fallback branch.

### Complete example — write side

```swirls
graph process_leads {
  label: "Process incoming leads"

  root {
    type: code
    label: "Score lead"
    inputSchema: @json {
      {
        "type": "object",
        "required": ["email", "name"],
        "properties": {
          "email": { "type": "string" },
          "name": { "type": "string" }
        }
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "required": ["email", "name", "score"],
        "properties": {
          "email": { "type": "string" },
          "name": { "type": "string" },
          "score": { "type": "number" }
        }
      }
    }
    code: @ts {
      return {
        email: context.nodes.root.input.email,
        name: context.nodes.root.input.name,
        score: Math.random() * 100
      }
    }
  }
}

stream scored_leads {
  label: "Scored leads"
  description: "Persists lead scoring output from process_leads"
  graph: process_leads

  schema: @json {
    {
      "type": "object",
      "required": ["email", "name", "score"],
      "properties": {
        "email": { "type": "string" },
        "name":  { "type": "string" },
        "score": { "type": "number" }
      }
    }
  }

  condition: @ts {
    return (context.output.root?.score ?? 0) > 50
  }

  prepare: @ts {
    const lead = context.output.root!
    return {
      email: lead.email,
      name: lead.name,
      score: lead.score
    }
  }
}
```

### Reading a stream — the read side

A `type: stream` node in another graph reads the persisted data:

```swirls
graph enrich_leads {
  label: "Enrich high-scoring leads"

  root {
    type: stream
    label: "Read scored leads"
    stream: scored_leads
    filter: @ts {
      return {
        score: { gte: 80 }
      }
    }
  }
}
```

See `node-stream` for the full filter operator list.

### Validation rules

- Stream names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `graph` must reference a declared graph in the same file.
- `prepare` is required; must be a non-empty `@ts` block or file reference.
- If `condition` is provided, it must be non-empty.
- `schema` is recommended (warning if omitted).

### Top-level vs node keyword — disambiguation

The lexer treats `stream` as a keyword. At the top level:

- `stream <name> { … }` — declare a stream block.
- `stream:` at top-level is invalid and errors with: `"stream:" is only valid inside a node { } block (did you forget to close a brace?)`.

Inside a graph body, `stream:` at graph scope (outside a node) errors the same way. Inside a `node { }` body, `stream:` is a normal config field (used by `type: stream` nodes as the stream reference).
