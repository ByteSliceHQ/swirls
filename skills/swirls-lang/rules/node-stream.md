---
title: Stream Nodes
impact: HIGH
tags: node, stream, filter, version, persisted, query, read
---

## Stream Nodes

A `type: stream` node **reads** from a top-level `stream { }` block. It is the read side of Swirls' workflow-to-workflow communication. The node's output is an array of previously persisted records matching the filter, read from one **pinned version** of the stream.

**Required fields:** `stream` (bare identifier naming a top-level stream block in the same project), `version` (the `versions:` key to read, e.g. `v1`), and `filter` (@ts returning a `StreamFilter` object).

**Not valid (removed from schema):** `streamId`, `query`, `querySql`. Using any of them produces a validator error.

### Syntax

```swirls
<node_name> {
  type: stream
  stream: <stream_block_name>
  version: <version_id>
  filter: @ts {
    return {
      <field>: { <op>: <value> },
      ...
    }
  }
}
```

`<version_id>` matches `^v[1-9][0-9]*$` (`v1`, `v2`, …) and MUST name a `versions:` entry declared on the referenced stream block.

### Example

```swirls
node recent_high_scorers {
  type: stream
  label: "Recent high-scoring leads"
  stream: scored_leads
  version: v1
  filter: @ts {
    return {
      score: { gte: 80 },
      name: { eq: context.nodes.root.input.name }
    }
  }
}
```

### StreamFilter shape

`filter` must return a plain object whose keys are field names and whose values are operator objects.

```typescript
type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in'

type StreamFilter = Record<string, Partial<Record<FilterOperator, unknown>>>
```

Multiple top-level keys AND together. Multiple operators on the same key also AND together:

```typescript
// score >= 50 AND score <= 100 AND name equals input
{
  score: { gte: 50, lte: 100 },
  name: { eq: context.nodes.root.input.name }
}
```

### Table vs output fields

Filters address two field kinds uniformly:

- **System columns:** `id`, `created_at`, `deployment_id`, `workflow_execution_id` — mapped to direct column comparisons on the version table.
- **Payload fields:** anything else — the fields your `prepare` returned for this version, mapped to the matching column.

You do not need to distinguish; the runtime infers it.

### Node output

The node's output is `SchemaShape[]` — an array of records matching the **pinned version's** `schema`. Zero matches is not an error. Downstream nodes see it as `context.nodes.<stream_node>.output`.

When `versions[<version>].schema` resolves, the LSP types `context.nodes.<stream_node>.output` as the matching TypeScript array. If the version has no schema or the reference is missing, the LSP types it as `unknown[]`.

### Reading multiple streams in one workflow

A `type: stream` node has **no incoming edge**, so it is a root candidate. A workflow that reads several streams (a merge, dedupe, or join) therefore needs one real `root { }` that fans out to each stream node. Leave the stream nodes parentless and every one of them counts as a root — validation fails with `Workflow must have exactly one root node, but found N`.

Drive the reads from a single entry node, then fan them back into a merge:

```swirls
workflow merge_sources {
  label: "Merge investor sources"

  root {
    type: code
    label: "Start"
    code: @ts { return { runAt: new Date().toISOString() } }
  }

  node from_search {
    type: stream
    stream: investors_search
    version: v1
    filter: @ts { return {} }
  }

  node from_findall {
    type: stream
    stream: investors_findall
    version: v1
    filter: @ts { return {} }
  }

  node merge {
    type: code
    label: "Dedupe across sources"
    code: @ts {
      // Each stream node returns ALL matching rows (newest first), not one record.
      const sources = [
        context.nodes.from_search.output,
        context.nodes.from_findall.output,
      ]
      const out = []
      for (const rows of sources) {
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          // If your writer persists one batch row per run (a row holding an
          // array), flatten that array here; otherwise use the row directly.
          out.push(row)
        }
      }
      return { count: out.length, merged: out }
    }
  }

  flow {
    root -> from_search
    root -> from_findall
    from_search -> merge
    from_findall -> merge
  }
}
```

(`investors_search` and `investors_findall` are top-level `stream { }` blocks declared elsewhere in the workspace — declare them, or this workflow errors with `Stream node references stream block "..." which is not defined`.)

Two things bite agents here:

- **Every stream read is a root candidate.** Fan out from one `root { }`; never leave a stream node parentless.
- **A stream node returns an array of rows, not one record.** Reads come back newest-first (`created_at DESC`). If each run persisted a batch (one row holding an array), iterate rows and flatten. To read just the most recent set, take the first non-empty row.

### Pagination and sorting

Not implemented yet. All queries return all matching rows ordered by `created_at DESC` (newest first). Pagination / sort will be added as optional fields later.

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `stream` | yes | bare identifier | Must match a top-level `stream <name> { }` block. |
| `version` | yes | `v1`, `v2`, … | Must name a `versions:` entry on the referenced stream block. |
| `filter` | yes | `@ts { }` or `@ts "file.ts.swirls"` | Must be non-empty; must return a `StreamFilter` object. |

### Common mistakes

**Incorrect (old `query` field):**

```swirls
node recent {
  type: stream
  stream: "submissions"
  query: @sql { SELECT * FROM {{table}} }
}
```

Error: `querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)`.

**Incorrect (missing `version`):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  filter: @ts { return {} }
}
```

`version` is required on every `type: stream` node — there is no implicit default. Pin it: `version: v1`.

**Incorrect (referencing an undefined stream block):**

```swirls
node recent {
  type: stream
  stream: undefined_stream
  version: v1
  filter: @ts { return {} }
}
```

Error: `Stream node references stream block "undefined_stream" which is not defined`.

**Incorrect (pinning a version the stream does not declare):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  version: v9
  filter: @ts { return {} }
}
```

Error: `Stream node pins version "v9" but stream "scored_leads" does not declare that version under versions { }`. An invalid id (e.g. `version: latest`) errors with `Stream node "version" must be a valid stream version id (e.g. v1), got "latest"`.

**Incorrect (empty filter):**

```swirls
node recent {
  type: stream
  stream: scored_leads
  version: v1
  filter: @ts { }
}
```

Error: `Stream node filter must be a non-empty @ts block`. If you want all rows, return `{}` from the filter: `filter: @ts { return {} }`.

See `resource-stream` for the write side (top-level `stream { }` block declaration).
