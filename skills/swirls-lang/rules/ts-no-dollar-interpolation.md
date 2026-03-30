---
title: No Dollar Sign Before Interpolation
impact: CRITICAL
tags: ts, parser, dollar, interpolation, currency
---

## No Dollar Sign Before Interpolation

A literal `$` immediately before `${...}` interpolation (e.g. formatting currency) breaks `@ts` block parsing. The parser sees `$${` and fails to determine where the interpolation begins.

**Incorrect (dollar sign before interpolation):**

```swirls
code: @ts {
  return `Total: $${amount.toFixed(2)}`
}
```

**Correct (use concatenation):**

```swirls
code: @ts {
  return "Total: $" + amount.toFixed(2)
}
```

**Incorrect (price formatting):**

```swirls
prompt: @ts {
  return `The price is $${price} per unit`
}
```

**Correct (concatenation):**

```swirls
prompt: @ts {
  return "The price is $" + price + " per unit"
}
```

Any time you need a literal `$` followed by a `${` interpolation, use string concatenation instead of a template literal.
