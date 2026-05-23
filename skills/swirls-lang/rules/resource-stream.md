---
title: Stream Block Declaration
impact: HIGH
tags: resource, stream, top-level, persistence, graph, version, versions, schema, condition, prepare
---

## Stream Block Declaration

Top-level `stream <name> { }` blocks persist one graph's output into a named, schema-typed record. They replace the removed `persistence { }` block. A `type: stream` node in another graph can read from the same stream (at a pinned version) to achieve graph-to-graph communication.

**There is no `type:` field on a stream block** — the keyword `stream` identifies the block.

Each stream declares one or more **versions** under a `versions:` map. Every version carries its own `schema`, optional `condition`, and required `prepare`. The block's top-level `version:` pointer names which version the writer persists into. `schema`, `condition`, and `prepare` live **only inside a `versions:` entry** — never at the top level of the block.

### Syntax

```swirls
stream <name> {
  label: "<optional label>"          // defaults to <name>
  description: "<optional string>"
  enabled: <boolean>                  // optional; default treated as true
  graph: <graph_name>                 // required; graph declared in this file
  version: <version_id>               // required; active writer version, must exist in versions:

  versions: {
    <version_id> {                    // version_id matches ^v[1-9][0-9]*$ (v1, v2, …)
      schema: @json {                 // required per version
        { ... JSON Schema for one persisted record ... }
      }
      condition: @ts {                // optional; return true to persist
        return <boolean expression>
      }
      prepare: @ts {                  // required; return the object to persist
        return { ... }
      }
    }
    ...
  }
}
```

`condition` and `prepare` may also be `@ts "path.ts.swirls"` file references. `schema` may instead be a bare-identifier reference to a top-level `schema` block: `schema: my_record_schema`.

### Required vs optional fields

Block-level:

| Field | Required | Notes |
|-------|----------|-------|
| `graph` | yes | Bare identifier naming a graph in the same file (or merged workspace). |
| `version` | yes | Active writer `version_id` (`v1`, …). Must match a key in `versions:`. |
| `versions` | yes | Non-empty map of `version_id` → `{ schema, condition?, prepare }`. |
| `label` | no | Defaults to the stream's name. |
| `description` | no | Free-form description. |
| `enabled` | no | When false, runtime skips persistence but the stream stays in the AST and deployment. |

Per-version (inside `versions:`):

| Field | Required | Notes |
|-------|----------|-------|
| `schema` | yes | `@json { }` literal or `schema: <name>` reference. Defines one record's shape for that version. |
| `prepare` | yes | Non-empty `@ts { }` or `@ts "…"` reference. Must return the record object. |
| `condition` | no | `@ts` returning boolean; if false, skip persist. If present and empty, the validator errors. |

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
  version: v1

  versions: {
    v1 {
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
  }
}
```

### Reading a stream — the read side

A `type: stream` node in another graph reads the persisted data at a pinned version:

```swirls
graph enrich_leads {
  label: "Enrich high-scoring leads"

  root {
    type: stream
    label: "Read scored leads"
    stream: scored_leads
    version: v1
    filter: @ts {
      return {
        score: { gte: 80 }
      }
    }
  }
}
```

See `node-stream` for the full filter operator list.

### Provisioning and versioning

- Deploy provisions **one Postgres table per `(stream, version)`** — for example `project_<uuid>.stream_scored_leads_v1`.
- Graph completion writes only to the deployment's active `version` (the block-level `version:` pointer).
- Re-deploying with a **changed `schema` for an existing version id** fails with a drift error. To evolve a record shape, add a **new** `versions:` entry (`v2`, …) and move the `version:` pointer; existing readers stay pinned to the old version until you migrate them.
- The local CLI worker does not write or read stream data — exercise streams in a deployed project.

### Validation rules

- Stream names must match `^[a-zA-Z0-9_]+$`. Duplicate names error with `Duplicate stream name "X"`.
- `graph` is required (`Stream block requires "graph" (graph name)`) and must reference a declared graph (`Stream references graph "X" which is not defined`).
- `version` is required (`Stream "X" requires "version" (active writer)`), must be a valid `version_id` (`… version pointer "X" is invalid — use v1, v2, …`), and must be declared under `versions:` (`… version "X" is not declared under versions { }`).
- `versions:` must be non-empty (`Stream "X" requires a non-empty versions { } block`). Duplicate keys error (`… declares duplicate version key "X"`).
- Each version requires a `schema` (`… version "vN" has no schema; add schema: @json { … } or schema: <name>`) and a non-empty `prepare` (`… version "vN" requires "prepare"`). A present-but-empty `condition` errors too.
- Placing `schema` / `condition` / `prepare` at the **top level** of the block is a parse error: `top-level "<key>" is invalid on stream blocks — use versions { v1 { schema, condition?, prepare } }`. Any key other than `schema`, `condition`, `prepare` inside a version entry errors: `Unexpected key "<key>" in stream versions block — only schema, condition, and prepare are allowed`.

### Top-level vs node keyword — disambiguation

The lexer treats `stream` as a keyword. At the top level:

- `stream <name> { … }` — declare a stream block.
- `stream:` at top-level is invalid and errors with: `"stream:" is only valid inside a node { } block (did you forget to close a brace?)`.

Inside a graph body, `stream:` at graph scope (outside a node) errors the same way. Inside a `node { }` body, `stream:` is a normal config field (used by `type: stream` nodes as the stream reference).
