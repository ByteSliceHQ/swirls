---
title: Hyphenated Keys in DSL Object Literals
impact: CRITICAL
tags: parser, headers, hyphen, content-type, silent, drop
---

## Hyphenated Keys in DSL Object Literals

DSL-level object literals (like a plain `headers: { ... }` value) cannot carry hyphenated keys. The two failure modes differ:

- **Unquoted** `Content-Type:` — the lexer reads `Content`, then hits a stray `-` it cannot tokenize and **stops**. Everything to EOF is silently dropped (workflows, triggers, resources after this point disappear with no error).
- **Quoted** `"Content-Type":` — DSL object keys must be bare identifiers; a quoted key is rejected. The parser emits `Unexpected token` errors and the object value ends up **empty** (your headers are silently lost), though later declarations recover.

Either way the headers are broken. Use a `@ts` block instead.

**Incorrect (unquoted hyphenated key — truncates the file):**

```swirls
node call_api {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: { Content-Type: "application/json" }
}
```

**Incorrect (quoted hyphenated key — headers parse to an empty object):**

```swirls
headers: { "Content-Type": "application/json" }
```

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
      "x-api-key": context.secrets.api_creds.API_KEY,
      "Authorization": "Bearer " + context.secrets.api_creds.AUTH_TOKEN
    }
  }
  body: @ts {
    return JSON.stringify({ query: context.nodes.root.output.query })
  }
}
```

Inside a `@ts` block, header keys are JavaScript string literals — the lexer never sees the hyphens. This is the only safe way to set custom headers with hyphenated keys.

**Also correct (omit headers if defaults suffice):**

HTTP nodes default to JSON content type. If you don't need custom headers, simply omit the `headers` field entirely.
