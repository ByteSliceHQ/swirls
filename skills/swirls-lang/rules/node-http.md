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
  schema: @json {
    {
      "type": "object",
      "properties": {
        "results": { "type": "array" }
      }
    }
  }
}
```

**Correct (HTTP node with custom headers):**

When you need custom headers (including hyphenated keys like `Content-Type` or `x-api-key`), use a single `@ts` block that returns the entire headers object. Never nest `@ts` blocks inside other `@ts` blocks.

```swirls
node call_api {
  type: http
  label: "Call External API"
  method: "POST"
  url: "https://api.example.com/data"
  secrets: [API_KEY]
  headers: @ts {
    return {
      "x-api-key": context.secrets.API_KEY,
      "x-request-id": "abc123",
      "Content-Type": "application/json"
    }
  }
  body: @ts {
    return JSON.stringify({
      query: context.nodes.root.output.query
    })
  }
}
```

**Note:** Do not use HTTP nodes to call AI/LLM APIs directly. Use `ai` nodes instead — they handle model routing, authentication, and response parsing automatically.

**Warning:** Do not use `headers` as a plain object literal with hyphenated keys like `Content-Type`. The parser treats hyphens as subtraction operators and silently drops the rest of the file. Always use a `@ts` block for headers so keys are JavaScript strings. See the parser-hyphenated-headers and ts-no-nested-code-blocks rules.

HTTP node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `method` | no | "GET", "POST", "PUT", "DELETE", "PATCH" (default: "GET") |
| `headers` | no | `@ts` block returning an object (use string keys for hyphenated names) |
| `body` | no | `@ts` block |
| `schema` | no | `@json` block (use `outputSchema` only on root nodes) |
