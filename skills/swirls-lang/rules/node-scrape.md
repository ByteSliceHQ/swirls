---
title: Firecrawl (Scrape) Nodes
impact: MEDIUM
tags: node, scrape, web, firecrawl, formats, content
---

## Firecrawl (Scrape) Nodes

Firecrawl nodes fetch and extract content from web pages. The type name is `firecrawl`, not `scrape`.

**Required fields:** `url`.

**Vendor-managed output:** Do not set `schema:` on a firecrawl node. The validator errors: `"firecrawl" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

### Incorrect (wrong type name)

```swirls
node fetch {
  type: scrape
  url: @ts { return "https://example.com" }
}
```

`scrape` is not a valid node type. Use `firecrawl`.

### Correct (basic scrape)

```swirls
node scrape_page {
  type: firecrawl
  label: "Scrape webpage"
  url: @ts { return context.nodes.root.input.url }
}
```

### Correct (options)

```swirls
node scrape_article {
  type: firecrawl
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
