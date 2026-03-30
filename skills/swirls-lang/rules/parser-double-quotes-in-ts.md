---
title: Double-Quote Characters Inside @ts Blocks
impact: CRITICAL
tags: parser, double-quote, ts, string, silent, drop
---

## Double-Quote Characters Inside @ts Blocks

Literal `"` characters inside `@ts { }` blocks confuse the parser's string boundary detection. The `@ts` block itself appears to parse correctly, but all subsequent graphs, triggers, and resources in the file are silently dropped.

This is one of the most common causes of "missing graphs" with no error output.

**Incorrect (regex with double-quote):**

```swirls
code: @ts {
  s.replace(/"/g, '""')
}
```

**Incorrect (string containing double-quote):**

```swirls
code: @ts {
  return '"' + value + '"'
}
```

**Incorrect (checking for double-quote):**

```swirls
code: @ts {
  if (s.includes('"')) { }
}
```

**Correct (use String.fromCharCode(34)):**

```swirls
code: @ts {
  const Q = String.fromCharCode(34)
  s.split(Q).join(Q + Q)          // instead of s.replace(/"/g, '""')
  return Q + value + Q            // instead of '"' + value + '"'
  if (s.indexOf(Q) >= 0) { }      // instead of s.includes('"')
}
```

When `swirls doctor` reports fewer graphs than you defined with no error messages, check all `@ts` blocks for literal `"` characters.
