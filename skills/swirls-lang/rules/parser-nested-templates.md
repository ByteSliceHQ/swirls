---
title: Nested Template Literals Break @ts Parsing
impact: CRITICAL
tags: parser, template, literal, nested, backtick, silent, drop
---

## Nested Template Literals Break @ts Parsing

Template literals inside `${}` interpolation (valid JavaScript/TypeScript) break `@ts` block parsing. The inner backtick is mistaken for the end of the outer template literal. All content after the broken block may be silently dropped.

**Incorrect:**

```swirls
code: @ts {
  const result = `Summary:\n${items.map(w => `  - ${w}`).join("\n")}`
}
```

**Correct (concatenation for the inner expression):**

```swirls
code: @ts {
  const result = "Summary:\n" + items.map(w => "  - " + w).join("\n")
}
```

**Incorrect (nested template in prompt):**

```swirls
prompt: @ts {
  return `Results:\n${data.map(r => `${r.name}: ${r.score}`).join("\n")}`
}
```

**Correct:**

```swirls
prompt: @ts {
  return "Results:\n" + data.map(r => r.name + ": " + r.score).join("\n")
}
```

Rule: never use backticks inside `${}` interpolation. Use string concatenation (`+`) instead.
