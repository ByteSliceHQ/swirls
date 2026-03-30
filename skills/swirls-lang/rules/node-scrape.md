---
title: Scrape Nodes
impact: MEDIUM
tags: node, scrape, web, css, selector, firecrawl
---

## Scrape Nodes

Scrape nodes fetch and extract content from web pages. They support CSS selectors for targeted extraction.

**Required fields:** `url`

**Correct (basic scrape):**

```swirls
node scrape_page {
  type: scrape
  label: "Scrape webpage"
  url: @ts { return context.nodes.root.input.url }
}
```

**Correct (with CSS selector and options):**

```swirls
node scrape_article {
  type: scrape
  label: "Scrape article"
  url: @ts { return context.nodes.root.output.url }
  selector: ".article-content"
  onlyMainContent: true
  formats: ["markdown", "html"]
  maxAge: 3600
}
```

Scrape node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `selector` | no | CSS selector string |
| `onlyMainContent` | no | Boolean |
| `formats` | no | String array ("markdown", "html") |
| `maxAge` | no | Number (cache seconds) |
| `parsers` | no | String array |

Scrape nodes infer `FIRECRAWL_API_KEY` as a secret. You do not need to declare it.
