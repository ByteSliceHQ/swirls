---
title: Parallel Nodes
impact: HIGH
tags: node, parallel, search, extract, findall, research, crawl
---

## Parallel Nodes

Parallel nodes call the Parallel API for parallelized web research tasks. The `operation` field selects one of three modes with different required fields. The response shape is **vendor-managed** — do not set `schema:` on a parallel node; the validator errors if you do.

**Required fields:** `operation`, `objective` (plus operation-specific fields).

**Valid operations:** `search`, `extract`, `findall`. Any other value triggers a validator error: `Parallel "operation" must be "search", "extract", or "findall"`.

### search — multi-query web search

Runs a set of search queries in parallel and returns excerpts.

**Required:** `operation: search`, `objective`, `searchQueries` (@ts returning `string[]`).

**Optional:** `mode` (`one-shot` | `agentic` | `fast`), `excerptsMaxCharsPerResult`, `excerptsMaxCharsTotal`.

```swirls
node research {
  type: parallel
  label: "Research topic"
  operation: search
  objective: @ts {
    return "Find articles about " + context.nodes.root.output.topic
  }
  searchQueries: @ts {
    const topic = context.nodes.root.output.topic
    return [topic + " overview", topic + " 2026 trends", topic + " case studies"]
  }
  excerptsMaxCharsPerResult: 500
  excerptsMaxCharsTotal: 2000
}
```

### extract — structured extraction from URLs

Fetches a list of URLs in parallel and extracts structured content.

**Required:** `operation: extract`, `objective`, `urls` (@ts returning `string[]`).

**Optional:** `excerpts` (boolean), `fullContent` (boolean).

```swirls
node extract_pricing {
  type: parallel
  label: "Extract pricing"
  operation: extract
  objective: @ts { return "Extract product names and prices from each page" }
  urls: @ts {
    return [
      "https://example.com/products/a",
      "https://example.com/products/b"
    ]
  }
  excerpts: true
  fullContent: false
}
```

### findall — long-running entity discovery

Polls the Parallel API for entities matching given conditions.

**Required:** `operation: findall`, `objective`, `entityType`, `generator` (`base` | `core` | `pro` | `preview`), `matchConditions` (@ts), `matchLimit` (number).

**Optional:** `excludeList` (@ts), `pollInterval` (number), `pollIntervalUnit` (`seconds` | `minutes`), `pollTimeout` (number), `pollTimeoutUnit` (`seconds` | `minutes`).

```swirls
node discover_posts {
  type: parallel
  label: "Find related Reddit threads"
  operation: findall
  objective: @ts { return "Find Reddit posts about Kubernetes operator patterns" }
  entityType: "reddit_post"
  generator: "core"
  matchConditions: @ts {
    return [
      { name: "on_topic", description: "Post must discuss Kubernetes operators" },
      { name: "recent", description: "Posted within the last 90 days" }
    ]
  }
  matchLimit: 25
  excludeList: @ts { return [] }
  pollInterval: 30
  pollIntervalUnit: "seconds"
  pollTimeout: 10
  pollTimeoutUnit: "minutes"
}
```

### Fields matrix

| Field | search | extract | findall |
|-------|--------|---------|---------|
| `operation` | required | required | required |
| `objective` | required | required | required |
| `searchQueries` | required | — | — |
| `urls` | — | required | — |
| `mode` | optional | — | — |
| `excerptsMaxCharsPerResult` | optional | — | — |
| `excerptsMaxCharsTotal` | optional | — | — |
| `excerpts` | — | optional | — |
| `fullContent` | — | optional | — |
| `entityType` | — | — | required |
| `generator` | — | — | required |
| `matchConditions` | — | — | required |
| `matchLimit` | — | — | required |
| `excludeList` | — | — | optional |
| `pollInterval` / `pollIntervalUnit` | — | — | optional |
| `pollTimeout` / `pollTimeoutUnit` | — | — | optional |
| `schema` | **not allowed** | **not allowed** | **not allowed** |

### Key rules

- Parallel nodes are the **only** supported fan-out primitive for web research. There is no generic `map`, `fanout`, or `workers` node.
- `schema` is vendor-managed — setting it emits: `"parallel" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`
- `generator` for `findall` selects the compute tier; `core` is the usual default, `pro`/`preview` for larger / newer models.
- `matchLimit` must be in the API's supported range (5–1000).
- `PARALLEL_API_KEY` is resolved by the runtime; do not declare it in `secrets:`.
