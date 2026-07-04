---
title: View Block Declaration
impact: HIGH
tags: resource, view, top-level, spreadsheet, streams, columns, computed, graph, persistence
---

## View Block Declaration

Top-level `view <name> { }` blocks compose one or more `stream` blocks into a spreadsheet-shaped table. A view maps each source stream row into a typed row (the `columns` mapping), and may add **computed columns** whose values come from running a workflow (graph) once per row. The cloud UI renders a view as a virtualized spreadsheet with per-cell loading states while computed columns run.

**There is no `type:` field on a view block** — the keyword `view` identifies the block. A view is read/derived data: it does not start workflows from triggers, and nothing reads *from* a view inside the DSL (it is surfaced in the cloud UI and via the API, not consumed by nodes).

A view is built from three things:

1. `streams:` — the source `stream` blocks it composes. Their rows become the view's rows.
2. `columns:` — a `@ts` mapping from a source stream row into the view's row shape (validated against `schema`).
3. `computed { }` — optional named columns, each running a `graph` per row to produce a cell value.

### Syntax

```swirls
view <name> {
  label: "<optional label>"            // defaults to <name>
  description: "<optional string>"
  enabled: <boolean>                    // optional; default treated as true
  streams: [<stream_name>, ...]         // required; non-empty list of stream block names

  schema: @json {                       // required; shape of one mapped (non-computed) row
    { ... JSON Schema ... }
  }

  columns: @ts {                        // required; map a source stream row into the row shape
    return { ... }
  }

  computed {                            // optional; zero or more computed columns
    <column_name> {                     // column_name matches ^[a-zA-Z0-9_]+$
      graph: <workflow_name>            // required; workflow run once per row
      input: @ts {                      // required; map the row into the graph's trigger input
        return { ... }
      }
      output: @ts {                     // optional; map the graph output into the cell value
        return ...
      }
    }
    ...
  }
}
```

`columns`, and each computed `input` / `output`, may also be `@ts "path.ts.swirls"` file references. `schema` may instead be a bare-identifier reference to a top-level `schema` block: `schema: my_row_schema`.

**`computed` is a block, not a `key: value` field** — write `computed { ... }` with no colon, the same way `versions { }` is written inside a `stream` block. Inside it, each entry is `<column_name> { graph, input, output? }`.

### Required vs optional fields

Block-level:

| Field | Required | Notes |
|-------|----------|-------|
| `streams` | yes | Non-empty list of `stream` block names declared in the same file or merged workspace. Each must exist; duplicates in the list error. |
| `schema` | yes | `@json { }` literal or `schema: <name>` reference. Shape of one mapped row (computed columns are appended on top of it). |
| `columns` | yes | Non-empty `@ts { }` or `@ts "…"`. Returns the mapped row object for one source stream row. |
| `label` | no | Defaults to the view's name. |
| `description` | no | Free-form description. |
| `enabled` | no | When false, the view stays in the AST and deployment but is not materialized. |
| `computed` | no | Block of named computed columns. Omit it for a plain mapped view. |

Per computed column (inside `computed { }`):

| Field | Required | Notes |
|-------|----------|-------|
| `graph` | yes | Bare identifier (or quoted string) naming a workflow in the same file or merged workspace. `workflow:` is an accepted alias. |
| `input` | yes | Non-empty `@ts { }` or `@ts "…"`. Maps the mapped row into the graph's trigger input; must return a plain object. |
| `output` | no | `@ts` mapping the graph's result into the cell value. Omit it to store the graph output directly. |

### Context shape inside `columns`

`columns` runs once per source stream row. The originating row is exposed under `context.streams`:

- `context.streams.<streamName>.output` — the source stream row's persisted record.
- `context.streams.<streamName>.<versionId>.output` — the same record under the row's version key (e.g. `.v2.output`).

Only the stream that produced the current row is present; sibling streams of the view are absent for that row. Return the mapped row object — it is validated against the view `schema` exactly like a stream `prepare` is validated against its version schema.

### Context shape inside computed `input` and `output`

- `input` gets `context.row` — the mapped row object produced by `columns` — plus the same `context.streams.<name>` as `columns`. Return the object passed to the graph as its trigger input.
- `output` gets `context.output` — the completed graph's **leaf** node outputs, keyed by leaf node name (same shape stream `prepare` sees) — plus `context.row`. Return the cell value. Without `output`, the cell value is the graph's output directly.

### Complete example

```swirls
workflow count_topic_tokens {
  label: "Count topic tokens"
  root {
    type: code
    label: "Count"
    code: @ts {
      return { topic: context.nodes.root.input.topic, tokens: 42 }
    }
  }
}

workflow enrich_topic {
  label: "Enrich topic"
  root {
    type: code
    label: "Enrich"
    code: @ts {
      return { sentiment: "positive" }
    }
  }
}

stream store_topic_tokens {
  label: "Topic tokens"
  workflow: count_topic_tokens
  version: v1
  versions: {
    v1 {
      schema: @json {
        {
          "type": "object",
          "required": ["topic", "tokens"],
          "properties": {
            "topic": { "type": "string" },
            "tokens": { "type": "number" }
          }
        }
      }
      prepare: @ts {
        return { topic: context.output.root.topic, tokens: context.output.root.tokens }
      }
    }
  }
}

view topic_dashboard {
  label: "Topic dashboard"
  description: "One row per stored topic, enriched with sentiment"
  streams: [store_topic_tokens]

  schema: @json {
    {
      "type": "object",
      "required": ["topic", "tokens"],
      "properties": {
        "topic": { "type": "string" },
        "tokens": { "type": "number" }
      }
    }
  }

  columns: @ts {
    return {
      topic: context.streams.store_topic_tokens.output.topic,
      tokens: context.streams.store_topic_tokens.output.tokens
    }
  }

  computed {
    sentiment {
      graph: enrich_topic
      input: @ts {
        return { topic: context.row.topic }
      }
      output: @ts {
        return context.output.root.sentiment
      }
    }
  }
}
```

### Runtime behavior

- A view is materialized **only in a deployed project** (hosted on Swirls Cloud); nothing builds views locally.
- Each source stream row becomes one view row (the `columns` mapping). New stream rows materialize as the source workflow completes; deploying a view backfills existing stream rows.
- Each computed column runs `graph` **once per row** as a normal workflow execution. Those executions are billed against `execution_credits` exactly like trigger-started runs — an over-quota org gets a failed cell, not a free run. A view over a busy stream with computed columns can launch a large number of graph executions, so reach for computed columns deliberately.
- Cells move through `pending → running → completed | failed`; the spreadsheet shows a loading state until each settles.
- Recompute is available from the cloud UI; it fills gaps (missing rows and never-settled cells) and does not re-run cells that already settled.

### Validation rules

- View names must match `^[a-zA-Z0-9_]+$`. Duplicate names error with `Duplicate view name "X"`.
- `streams` is required and non-empty (`View "X" requires "streams" (non-empty list of stream names)`). Each entry must reference a declared stream (`View references stream "Y" which is not defined`); listing a stream twice errors (`View "X" lists stream "Y" more than once`).
- `schema` is required (`View "X" has no schema; add schema: @json { … } or schema: <name>`).
- `columns` is required and must be a non-empty `@ts` block or `@ts "…"` (`View "X" requires "columns" …`, `View "X": columns requires a non-empty @ts block …`).
- Each computed column requires `graph` naming a declared workflow (`… computed column "C" requires "graph"`, `… references workflow "G" which is not defined`) and a non-empty `input` (`… requires "input" …`). A present-but-empty `output` errors. Duplicate computed column names error (`… declares duplicate computed column "C"`).
- **Execution-loop guard:** a view whose computed column runs a graph that writes a stream the same view (or a view it feeds, transitively) composes is rejected — `View "X" creates an infinite execution loop: a computed column runs a graph that writes a stream this view (or a view it feeds) composes.` Each materialized row would otherwise enqueue another graph run forever. Point computed columns at graphs that do **not** write back into the view's source streams. Per-file validation (`swirls doctor`) checks loops among resources in that file; **deploy** merges the workspace AST and runs the same check so cross-file view → workflow → stream loops cannot ship.

### Top-level keyword — disambiguation

The lexer treats `view` as a keyword. At the top level, `view <name> { }` declares a view block. There is no `view` node type and no `view:` config field — a view is not referenced from inside a workflow.
