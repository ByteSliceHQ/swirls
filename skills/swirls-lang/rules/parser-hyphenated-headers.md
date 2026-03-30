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

Even quoted keys with hyphens cause the same issue.

**Correct (omit the headers field entirely):**

```swirls
node call_api {
  type: http
  label: "Call API"
  method: "POST"
  url: @ts { return "https://api.example.com" }
  body: @ts {
    return JSON.stringify({ query: context.nodes.root.output.query })
  }
}
```

HTTP nodes default to JSON content type. There is currently no safe way to set custom headers with hyphenated keys. If you need `application/x-www-form-urlencoded`, the server may infer it from the body format.
