---
title: No Nested Template Literals in @ts Blocks
impact: CRITICAL
tags: ts, parser, template, literal, nested, backtick
---

## No Nested Template Literals in @ts Blocks

Template literals inside `${}` interpolation expressions break `@ts` block parsing. The inner backtick is mistaken for the end of the outer template literal. All subsequent content in the file may be silently dropped.

**Incorrect (nested template literals):**

```swirls
code: @ts {
  const result = `Summary:\n${items.map(w => `  - ${w}`).join("\n")}`
}
```

**Correct (use string concatenation for the inner expression):**

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

**Correct (concatenation):**

```swirls
prompt: @ts {
  return "Results:\n" + data.map(r => r.name + ": " + r.score).join("\n")
}
```

Rule: never use backticks inside `${}` interpolation. Use `+` concatenation or helper variables instead.
