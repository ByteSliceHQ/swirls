---
title: No Double-Quote Characters in @ts Blocks
impact: CRITICAL
tags: ts, parser, double-quote, string, fromCharCode
---

## No Double-Quote Characters in @ts Blocks

Literal `"` characters inside `@ts { }` blocks confuse the parser's string boundary detection. The `@ts` block appears to parse correctly, but all subsequent graphs in the file are silently dropped. `swirls doctor` reports fewer graphs than expected with no error.

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

This is one of the most common causes of "missing graphs" with no error message.
