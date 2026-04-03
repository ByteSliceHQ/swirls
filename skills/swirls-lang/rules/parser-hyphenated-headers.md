---
title: Hyphenated Header Keys Parsed as Subtraction
impact: CRITICAL
tags: parser, headers, hyphen, content-type, silent, drop
---

## Hyphenated Header Keys Parsed as Subtraction

Header keys like `Content-Type` cause the parser to treat the hyphen as a subtraction operator. Everything from that point to EOF is silently consumed. All subsequent graphs, triggers, and resources are dropped.

**Incorrect (hyphenated header key, unquoted):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: { Content-Type: "application/json" }
}
```

**Incorrect (hyphenated header key, quoted):**

```swirls
headers: { "Content-Type": "application/json" }
```

Even quoted keys with hyphens cause the same issue. This applies to plain object literals — the parser sees the hyphen as a subtraction operator.

**Correct (use a @ts block that returns the headers object):**

```swirls
node call_api {
  type: http
  label: "Call API"
  method: "POST"
  url: @ts { return "https://api.example.com" }
  headers: @ts {
    return {
      "Content-Type": "application/json",
      "x-api-key": context.secrets.API_KEY,
      "Authorization": "Bearer " + context.secrets.AUTH_TOKEN
    }
  }
  body: @ts {
    return JSON.stringify({ query: context.nodes.root.output.query })
  }
}
```

By using a `@ts` block, header keys are JavaScript string literals — the parser never sees the hyphens as operators. This is the only safe way to set custom headers with hyphenated keys.

**Also correct (omit headers if defaults suffice):**

HTTP nodes default to JSON content type. If you don't need custom headers, simply omit the `headers` field entirely.
