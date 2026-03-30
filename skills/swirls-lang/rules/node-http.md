---
title: HTTP Nodes
impact: HIGH
tags: node, http, api, request, url, method, body
---

## HTTP Nodes

HTTP nodes make external API requests. Use these instead of trying to use `fetch` in code nodes.

**Required fields:** `url`

**Incorrect (using fetch in a code node):**

```swirls
node call_api {
  type: code
  label: "Call API"
  code: @ts {
    const res = await fetch("https://api.example.com/data")
    return await res.json()
  }
}
```

Code nodes cannot make network requests.

**Correct (HTTP node for API calls):**

```swirls
node call_api {
  type: http
  label: "Call API"
  method: "POST"
  url: @ts {
    return "https://api.example.com/data"
  }
  body: @ts {
    return JSON.stringify({
      query: context.nodes.root.output.query,
    })
  }
  outputSchema: @json {
    {
      "type": "object",
      "properties": {
        "results": { "type": "array" }
      }
    }
  }
}
```

**Warning:** Do not use `headers` with hyphenated keys like `Content-Type`. The parser treats hyphens as subtraction operators and silently drops the rest of the file. HTTP nodes default to JSON content type. See the parser-hyphenated-headers rule.

HTTP node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `method` | no | "GET", "POST", "PUT", "DELETE", "PATCH" (default: "GET") |
| `headers` | no | Object (avoid hyphenated keys) |
| `body` | no | `@ts` block |
| `outputSchema` | no | `@json` block |
