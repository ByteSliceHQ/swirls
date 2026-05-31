---
title: Comment Syntax and ASCII Restriction
impact: CRITICAL
tags: comments, unicode, ascii, parser
---

## Comment Syntax and ASCII Restriction

Swirls supports single-line (`//`) and multi-line (`/* */`) comments. Doc comments (`/* */`) placed before a declaration are shown on hover in the LSP.

Unicode characters in comments break the parser's line counting and cause workflows after the comment to be silently dropped.

**Incorrect (Unicode in comments):**

```swirls
// ──────────────────────────────
// Workflow: get_token → fetch OAuth
// ──────────────────────────────
workflow get_token {
  // This workflow may be silently dropped
}
```

**Correct (ASCII only in comments):**

```swirls
// -------------------------------------------
// Workflow: get_token - fetch OAuth
// -------------------------------------------
workflow get_token {
  // This workflow is parsed correctly
}
```

Doc comments appear in editor hover tooltips:

```swirls
/* Normalizes name, email, and message (trim + lowercase email). */
root {
  type: code
  label: "Entry"
  code: @ts { return {} }
}
```

Use only ASCII characters in comments: letters, digits, spaces, hyphens, underscores, periods, parentheses, and standard punctuation. Avoid box-drawing characters, arrows, em dashes, and other Unicode.
