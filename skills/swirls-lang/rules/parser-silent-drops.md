---
title: Parser Silently Drops Graphs
impact: CRITICAL
tags: parser, silent, drop, graphs, doctor, count
---

## Parser Silently Drops Graphs

The Swirls parser has several bugs where invalid or unsupported syntax causes it to silently stop parsing the rest of the file. `swirls doctor` reports success but with fewer graphs/forms/triggers than expected. No error is emitted.

**How to detect:** Always compare the doctor summary counts against what you defined. If doctor reports 2 graphs but you wrote 4, the parser silently dropped 2.

**Common causes of silent drops (in order of likelihood):**

1. **Double-quote characters inside @ts blocks** - The parser's string boundary detection gets confused. Everything after the block is dropped.

2. **Nested template literals** - Inner backticks inside `${}` interpolation are mistaken for block boundaries.

3. **Dollar sign before interpolation** - `$${amount}` breaks interpolation parsing.

4. **Unicode in comments** - Non-ASCII characters in `//` comments break line counting.

5. **Hyphenated header keys** - `Content-Type` in headers is parsed as subtraction, consuming everything to EOF.

**Debugging steps:**

1. Run `bunx swirls doctor` and note the counts
2. Count the forms, graphs, and triggers you defined
3. If counts don't match, binary-search by commenting out halves of the file
4. Check the section above the first missing graph for parser-breaking patterns
5. Fix the pattern and re-run doctor

The issue is always in or before the first missing item, never after it.
