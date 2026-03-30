---
title: Unicode in Comments Breaks Line Counting
impact: CRITICAL
tags: parser, unicode, comments, line, silent, drop
---

## Unicode in Comments Breaks Line Counting

Using Unicode characters in `//` comments causes the parser to miscount lines. Graphs defined after the comment are silently dropped. `swirls doctor` reports success but with fewer graphs than expected. No error is emitted.

**Incorrect (Unicode box-drawing and arrow characters):**

```swirls
// ──────────────────────────────
// Graph: get_token → fetch OAuth
// ──────────────────────────────
graph get_token {
  label: "Get Token"
  root { type: code label: "Entry" code: @ts { return {} } }
}
```

The `get_token` graph is silently dropped.

**Correct (ASCII only):**

```swirls
// -------------------------------------------
// Graph: get_token - fetch OAuth
// -------------------------------------------
graph get_token {
  label: "Get Token"
  root { type: code label: "Entry" code: @ts { return {} } }
}
```

Characters to avoid in comments: `─`, `│`, `→`, `←`, `↑`, `↓`, `—`, `╌`, `═`, `║`, `╔`, `╗`, `╚`, `╝`, and any other non-ASCII characters.
