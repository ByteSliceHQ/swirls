---
title: No Nested Code Blocks
impact: CRITICAL
tags: ts, json, block, nested, headers, body, code
---

## No Nested Code Blocks

`@ts` and `@json` blocks cannot be nested inside other `@ts` or `@json` blocks. Each code block must appear at the field level — never inside another code block. When a field needs to produce a compound value (like an object with multiple keys), use a single `@ts` block that returns the entire object.

**Incorrect (nested @ts blocks inside a @ts block):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
  headers: @ts {
    x-api-key: @ts {
      return context.secrets.API_KEY
    }
    x-request-id: "abc123"
  }
}
```

**Incorrect (nested @ts blocks on individual values):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
  body: @ts {
    query: @ts {
      return context.nodes.root.output.query
    }
    limit: 10
  }
}
```

**Correct (single @ts block returning the full object):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: "https://api.example.com/data"
  method: "POST"
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
      query: context.nodes.root.output.query,
      limit: 10
    })
  }
}
```

Rule: a code block (`@ts`, `@json`, `@sql`) is always a leaf — it contains executable code, never other code blocks. If you need to build a structured value, write one `@ts` block that constructs and returns the whole object.
