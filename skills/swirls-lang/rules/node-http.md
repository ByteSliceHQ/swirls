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
secret api_creds {
  vars: [API_KEY]
}

node call_api {
  type: http
  label: "Call External API"
  method: "POST"
  url: "https://api.example.com/data"
  secrets: { api_creds: [API_KEY] }
  headers: @ts {
    return {
      "x-api-key": context.secrets.api_creds.API_KEY,
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

Declare the vars your node needs in a top-level `secret` block, then reference that block in the node's `secrets:` map. HTTP nodes also support an `auth:` field that references a top-level `auth` block for OAuth, API key, basic, or bearer authentication. For a Swirls-brokered OAuth grant (Slack, Linear, ...), use `connection:` referencing a top-level `connection` block instead. Set **either** `auth` **or** `connection` on a node, never both. See `resource-secrets`, `resource-auth`, and `resource-connection` rules.

**Note:** Do not use HTTP nodes to call AI/LLM APIs directly. Use `ai` nodes instead — they handle model routing, authentication, and response parsing automatically.

**Warning:** Do not use `headers` as a plain object literal with hyphenated keys like `Content-Type`. Unquoted, the stray `-` stops the lexer and silently drops the rest of the file; quoted, the key is rejected and the headers object parses empty. Always use a `@ts` block for headers so keys are JavaScript strings. See the parser-hyphenated-headers and ts-no-nested-code-blocks rules.

HTTP node fields:
| Field | Required | Type |
|-------|----------|------|
| `url` | yes | `@ts` block or string |
| `method` | no | "GET", "POST", "PUT", "DELETE", "PATCH" (default: "GET") |
| `headers` | no | `@ts` block returning an object (use string keys for hyphenated names) |
| `body` | no | `@ts` block |
| `auth` | no | bare identifier naming a top-level `auth` block (mutually exclusive with `connection`) |
| `connection` | no | bare identifier naming a top-level `connection` block (mutually exclusive with `auth`) |
| `schema` | no | `@json` block (use `outputSchema` only on root nodes) |

### Output shape

`context.nodes.<n>.output` is the **parsed response body directly** — the JSON value if the body parses as JSON, otherwise the raw text string. There is **no `{ status, headers, body }` envelope**: do not read `output.status` or `output.body`. The HTTP status, statusText, content-type, and duration are on a separate `context.nodes.<n>.meta`, not on `output`.

```swirls
node read_api {
  type: ai
  label: "Use the response"
  kind: object
  schema: @json { { "type": "object", "properties": { "ok": { "type": "boolean" } } } }
  prompt: @ts {
    // The fetched JSON body is the node output itself, not output.body.
    const body = context.nodes.call_api.output
    return "Summarize: " + JSON.stringify(body).slice(0, 4000)
  }
}
```

### Runtime limits (not validated, they bite at execution)

- **30-second timeout** per request — a long poll past 30s fails with `HTTP request timeout (30s)`. For slow upstreams, poll in shorter calls rather than one long request.
- **Internal/private addresses are blocked** (SSRF guard), re-checked on every redirect. You cannot call a private/internal host from an http node.
- At most **5 redirects** are followed, and the `Authorization` header is stripped on cross-origin redirects.
