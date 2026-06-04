---
title: Parser Silently Drops Workflows
impact: CRITICAL
tags: parser, silent, drop, workflows, doctor, count
---

## Parser Silently Drops Workflows

Some invalid input makes the lexer or parser stop or skip without emitting an error. `swirls doctor` reports success but with fewer workflows/forms/triggers than expected.

**How to detect:** Always compare the doctor summary counts against what you defined. If doctor reports 2 workflows but you wrote 4, something silently dropped 2.

**Causes of silent drops:**

1. **Regex literals containing quote characters inside `@ts` blocks** — the scanner mistakes the quote for a string boundary and consumes everything to the next quote. See `ts-regex-literals`.

2. **Stray characters at DSL level** — a character the lexer does not recognize (stray Unicode, an unquoted hyphen in an object key) outside comments/strings/fenced blocks stops tokenization; the rest of the file is dropped. See `parser-illegal-characters` and `parser-hyphenated-headers`.

3. **`inputSchema` or `outputSchema` on a non-root node** — the parser emits an error but also **drops the whole node**, which then cascades into "Edge references non-existent node" diagnostics.

4. **Unbalanced braces in `@ts` / `@json` / `@sql` blocks** — the fenced scanner brace-balances to find the end of the block; an extra `{` swallows following declarations into the block.

**Not hazards (parse correctly):** nested template literals, `$${...}`, double-quote characters inside properly quoted strings, and Unicode inside comments or string literals.

**Debugging steps:**

1. Run `bunx swirls doctor` and note the counts
2. Count the forms, workflows, and triggers you defined
3. If counts don't match, binary-search by commenting out halves of the file
4. Check the section above the first missing item for the patterns above
5. Fix and re-run doctor

The issue is always in or before the first missing item, never after it.
