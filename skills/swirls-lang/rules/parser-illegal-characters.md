---
title: Stray Characters at DSL Level Stop Tokenization
impact: CRITICAL
tags: parser, unicode, illegal, character, silent, drop, truncate
---

## Stray Characters at DSL Level Stop Tokenization

The lexer recognizes a fixed character set at DSL level (identifiers, numbers, strings, braces, brackets, `:`, `,`, `.`, `*`, `->`, `-["…"]->`, negative numbers, `@ts`/`@json`/`@sql`, comments). Any other character **outside** a comment, string, or fenced block makes the lexer stop. Everything after it is **silently dropped** — no error, `swirls doctor` just reports fewer workflows.

**Incorrect (stray Unicode between declarations):**

```swirls
workflow a { label: "A" root { type: code code: @ts { return {} } } }
→
workflow b { label: "B" root { type: code code: @ts { return {} } } }
```

Workflow `b` is silently dropped.

**Incorrect (unquoted hyphenated key — the `-` desyncs the lexer):**

```swirls
headers: { Content-Type: "application/json" }
```

See `parser-hyphenated-headers`.

### Where Unicode IS safe

- **Comments** (`//` and `/* */`) — any characters, including box-drawing, arrows, and em dashes, parse fine.
- **String literals** — `label: "café → done"` is fine.
- **Inside `@ts { }` / `@json { }` / `@sql { }` bodies** — the fenced scanner only tracks braces, strings, and comments; other characters pass through.

The hazard is only a character the lexer does not recognize in a **DSL-level token position** (between declarations, between fields, in place of a value).

**How to detect:** compare `swirls doctor` counts against what you defined. If items are missing, the cutoff point is at or just after the last item that survived — look there for a stray character.
