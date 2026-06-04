---
title: Comment Syntax
impact: HIGH
tags: comments, unicode, ascii, parser, doc-comment
---

## Comment Syntax

Swirls supports single-line (`//`) and multi-line (`/* */`) comments. Doc comments (`/* */`) placed immediately before a top-level declaration (or a `node`/`root` block) attach to it and are shown on hover in the LSP.

```swirls
/* Normalizes name, email, and message (trim + lowercase email). */
root {
  type: code
  label: "Entry"
  code: @ts { return {} }
}
```

### Unicode

Comment content may contain any characters — Unicode in `//` or `/* */` comments parses fine:

```swirls
// ──────────────────────────────
// Workflow: get_token → fetch OAuth
// ──────────────────────────────
workflow get_token {
  label: "Get Token"
  root { type: code label: "Entry" code: @ts { return {} } }
}
```

The hazard is Unicode (or any unrecognized character) **outside** comments, strings, and fenced blocks — at DSL token positions the lexer stops on it and silently drops the rest of the file. See `parser-illegal-characters`.

### Doc comments are preserved

`/* ... */` block comments immediately before a top-level declaration attach to it as a doc comment and are preserved by the serializer. `//` line comments are skipped by the lexer and not preserved.
