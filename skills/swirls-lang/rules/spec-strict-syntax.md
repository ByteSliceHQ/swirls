---
title: Strict Syntax Specification
impact: CRITICAL
tags: spec, syntax, keywords, fields, types, strict, hallucination, validation
---

## Strict Syntax Specification

The Swirls DSL is a declarative configuration language. It is not TypeScript, YAML, or a general-purpose programming language. Only the constructs listed below are valid. If something is not listed here, it does not exist in the language. Do not invent syntax by analogy with other languages.

### Complete keyword list

These are the only keywords recognized by the lexer. Any other word is parsed as an identifier or string.

```
form, webhook, schedule, graph, trigger, secret, auth, postgres,
node, root, type, label, description, enabled, schema, cron,
timezone, version, review, persistence, condition, name, flow,
select, insert, params, table
```

### Complete top-level block list

These are the only valid top-level declarations. Nothing else can appear at the top level of a `.swirls` file.

```
version: <number>
form <name> { }
webhook <name> { }
schedule <name> { }
graph <name> { }
trigger <name> { }
secret <name> { }
auth <name> { }
postgres <name> { }
```

### Complete node type list

These are the only valid values for `type:` inside a node or root block. The canonical names come from the runtime schema.

```
ai, bucket, code, document, resend, graph, http,
postgres, firecrawl, stream, switch, wait
```

Note: `resend` is the type name, not `email`. `firecrawl` is the type name, not `scrape`.

### Complete config value types

These are the only value forms that can appear after a `:` in a field assignment.

- String literal: `"value"`
- Number: `42`, `3.14`
- Boolean: `true`, `false`
- Bare identifier: `my_name` (parsed as a string)
- Object literal: `{ key: value }`
- Array literal: `[item1, item2]`
- TypeScript block: `@ts { ... }`
- TypeScript file ref: `@ts "path.ts.swirls"`
- JSON block: `@json { ... }`
- SQL block: `@sql { ... }`

Nothing else is valid. No expressions, no arithmetic, no ternary, no function calls.

### Complete fenced block languages

Only three: `@ts`, `@json`, `@sql`. No others exist. No `@yaml`, `@html`, `@css`, `@graphql`, `@py`, `@sh`.

### Complete edge syntax

Inside a `flow { }` block only:

- Simple edge: `source -> target`
- Labeled edge: `source -["label"]-> target`

No other edge syntax exists. No conditional edges, no weighted edges, no `=>`, no `-->`.

### Constructs that DO NOT exist

The following constructs do not exist in the Swirls DSL. Do not use them.

**No control flow:** `if`, `else`, `while`, `for`, `do`, `switch` (as a keyword), `case`, `default`, `break`, `continue`, `return`

**No variables:** `const`, `let`, `var`, `declare`, `=` assignment

**No functions:** `function`, `async`, `await`, `=>` arrow functions

**No imports/exports:** `import`, `export`, `from`, `require`, `module`

**No types at DSL level:** `interface`, `type` (as a declaration), `extends`, `implements`, `class`, `enum`, `namespace`

**No error handling:** `try`, `catch`, `throw`, `finally`

**No operators at DSL level:** `+`, `-`, `*`, `/`, `%`, `&&`, `||`, `!`, `==`, `!=`, `<`, `>`, `?`, `:` (ternary), `...` (spread)

**No string interpolation at DSL level.** Template literals and `${}` only work inside `@ts` blocks.

**No inline TypeScript outside of `@ts` blocks.** You cannot write `code: return {}`. It must be `code: @ts { return {} }`.

**No `outputSchema` or `inputSchema` on non-root nodes.** Use `schema` instead. The parser rejects `outputSchema` on non-root nodes.

**No `inputSchema` on non-root nodes.** Only the root node accepts `inputSchema`.

**No conditional routing at the edge level.** Conditional routing requires a `switch` node with `cases` and `router`, plus labeled edges in the flow block.

**No `email` node type.** The correct type name is `resend`.

**No `scrape` node type.** The correct type name is `firecrawl`.

**No `api` or `request` node type.** The correct type name is `http`.

**No `delay` or `sleep` node type.** The correct type name is `wait`.

**No `llm` or `prompt` or `chat` node type.** The correct type name is `ai`.

**No `subgraph` or `child` or `call` node type.** The correct type name is `graph`.

**No `db` or `database` or `sql` node type for external databases.** The correct type name is `postgres`.

**No `storage` or `file` or `s3` node type.** The correct type name is `bucket`.

**No `template` or `render` node type.** Generate text in `code` or `ai` nodes.

**No `loop` or `retry` or `parallel` node type.** The graph is a DAG. No cycles, no retries, no parallel fork/join primitives.

**No `webhook` or `form` or `schedule` as node types.** These are top-level resource declarations, not node types. Nodes receive their data through triggers via `context.nodes.root.input`.

**No `trigger` node type.** Triggers are top-level declarations that bind resources to graphs.

### Valid fields per node type

Only these fields are meaningful for each node type. Any other field name is silently stored in `configFields` but has no effect at runtime.

**code:** `code`, `schema`, `secrets`, `review`

**ai:** `kind`, `model`, `prompt`, `temperature`, `maxTokens`, `schema` (required when kind is object), `options`, `secrets`, `review`

**switch:** `cases`, `router`, `review`

**http:** `url`, `method`, `headers`, `body`, `schema`, `auth`, `secrets`, `review`

**resend:** `from`, `to`, `subject`, `text`, `html`, `replyTo`, `review`

**firecrawl:** `url`, `selector`, `onlyMainContent`, `formats`, `maxAge`, `parsers`, `schema`, `review`

**stream:** `stream` (or `streamId`), `query`, `schema`, `review`

**graph:** `graph`, `input`, `review`

**wait:** `amount`, `unit`, `review`

**bucket:** `operation`, `path`, `bucket`, `review`

**document:** `documentId`, `review`

**postgres:** `postgres`, `select`, `insert`, `params`, `condition`, `schema`, `review`

All node types also accept: `type`, `label`, `description`

Root nodes additionally accept: `inputSchema`, `outputSchema`
