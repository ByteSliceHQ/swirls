---
title: Scrape Nodes
impact: MEDIUM
tags: node, scrape, web, firecrawl, formats, content
---

## Scrape Nodes

Scrape nodes fetch and extract content from web pages. The DSL type name is `scrape`. Firecrawl is the underlying vendor (`FIRECRAWL_API_KEY`).

**Required fields:** `url`.

**Vendor-managed output:** Do not set `schema:` on a scrape node. The validator errors: `"scrape" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

### Incorrect (wrong type name)

```swirls
node fetch {
  type: firecrawl
  url: @ts { return "https://example.com" }
}
```

`firecrawl` is not a valid node type. Firecrawl is the underlying vendor; the DSL type name is `scrape`. Use `scrape`.

### Correct (basic scrape)

```swirls
node scrape_page {
  type: scrape
  label: "Scrape webpage"
  url: @ts { return context.nodes.root.input.url }
}
```

### Correct (options)

```swirls
node scrape_article {
  type: scrape
  label: "Scrape article"
  url: @ts { return context.nodes.root.output.url }
  onlyMainContent: true
  formats: ["markdown", "html"]
  maxAge: 3600
  parsers: ["readability"]
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `url` | yes | `@ts` block or string | Target page URL. |
| `onlyMainContent` | no | Boolean | Strip navigation / ads / footers. |
| `formats` | no | Array of strings | E.g. `["markdown", "html"]`. |
| `maxAge` | no | Number | Cache lifetime in seconds. |
| `parsers` | no | Array of strings | Parser names to apply. |
| `schema` | **not allowed** | Vendor-managed; omit entirely. |

### API key

`FIRECRAWL_API_KEY` is resolved by the runtime; do not declare it in a `secrets:` map.

### When to use another node type

- **Structured extraction from a list of pages:** use `parallel` with `operation: extract`.
- **Long-running entity discovery:** use `parallel` with `operation: findall`.
- **Arbitrary HTTP request with full control over method / headers / body:** use `http`.
