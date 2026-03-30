---
title: Dollar Sign Before Interpolation Breaks Parsing
impact: CRITICAL
tags: parser, dollar, interpolation, currency, silent, drop
---

## Dollar Sign Before Interpolation Breaks Parsing

A literal `$` immediately before a `${...}` interpolation (e.g. formatting currency as `$${amount}`) breaks `@ts` parsing. The parser sees `$${` and cannot determine where the interpolation begins.

**Incorrect:**

```swirls
code: @ts {
  return `Total: $${amount.toFixed(2)}`
}
```

**Correct (concatenation):**

```swirls
code: @ts {
  return "Total: $" + amount.toFixed(2)
}
```

Any time you need a literal `$` followed by a `${` interpolation, use string concatenation.
