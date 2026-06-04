---
title: Regex Literals With Quote Characters Break @ts Scanning
impact: CRITICAL
tags: ts, parser, regex, quote, silent, drop
---

## Regex Literals With Quote Characters Break @ts Scanning

The `@ts { }` scanner understands TypeScript strings, template literals, and comments — but **not regex literals**. A quote character (`"`, `'`, or `` ` ``) inside a regex literal is mistaken for the start of a string. The scanner then consumes everything until the next matching quote, desyncs, and the rest of the file is **silently dropped** (no error; `swirls doctor` just reports fewer workflows).

**Incorrect (regex containing a double quote):**

```swirls
code: @ts {
  return { r: s.replace(/"/g, '') }
}
```

**Incorrect (regex containing a single quote):**

```swirls
code: @ts {
  return { ok: /can't/.test(s) }
}
```

**Correct (build the pattern from a string, or avoid quote chars in regex):**

```swirls
code: @ts {
  const Q = String.fromCharCode(34)        // the " character
  return { r: s.split(Q).join("") }        // instead of s.replace(/"/g, '')
}
```

```swirls
code: @ts {
  const re = new RegExp("can" + String.fromCharCode(39) + "t")  // ' is charCode 39
  return { ok: re.test(s) }
}
```

### What is safe

- Regex literals **without** quote characters parse fine: `/\d+/g`, `/^https?:/`, `/a{2,3}/`.
- Quote characters inside **proper strings** are fine: `'"'`, `"it's"`, `` `say "hi"` `` all parse correctly — the scanner tracks string boundaries, including escapes.
- Nested template literals and `$${...}` parse correctly (the scanner brace-balances `${ … }` and recurses into inner backticks).

The only @ts quoting hazard is a quote character inside a regex literal (or any other position the scanner cannot recognize as a string).

When `swirls doctor` reports fewer workflows than you defined with no error output, search your `@ts` blocks for regex literals containing `"`, `'`, or backticks.
