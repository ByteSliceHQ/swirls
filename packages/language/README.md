# @swirls/language

Lexer, parser, AST, validator and serializer for the `.swirls` language. This is the reference implementation: the language server, the CLI and any runtime read `.swirls` files through it.

```ts
import { parse, validate } from '@swirls/language'

const { ast, errors } = parse(source)
const diagnostics = errors.length > 0 ? [] : validate(ast)
```

## What is in the package

| Piece | Entry point | What it does |
|---|---|---|
| Lexer | `tokenize`, `Lexer` | Source text to tokens with line, column and offset. Embedded blocks (`@ts { }`, `@json { }`, `@sql { }`, `@prisma { }`, `@openui { }`) are one token each, with the range of their body. |
| Parser | `parse` | Tokens to a `SwirlsFile` AST plus a list of `ParseError`. Hand-written recursive descent. |
| Validator | `validate` | Semantic checks on an AST: names, references, graph shape, per-block rules. Returns `Diagnostic[]` with `error` or `warning` severity. |
| Serializer | `serialize` | An AST back to source. |
| Workspace | `@swirls/language/workspace` | Find the `.swirls` files of a project and index their resources, so references resolve across files. |
| Parse cache | `createParseCache` | A content-keyed LRU around `parse`, for callers that parse the same text repeatedly (an editor, a watcher). |

Every AST node carries a `range`, which is what editor features and diagnostics are built on.

## Top-level blocks

`form`, `webhook`, `schedule`, `workflow` (`graph` is a legacy alias), `stream`, `view`, `trigger`, `secret`, `auth`, `postgres`, `database`, `migration`, `disk`, `computer`, `operation`, `skill`, `agent`, `decision`, `mcp`, `network`, `channel`, `connection`, `connector`, `action`, `app`, `schema`, `role`, `policy`, `mock`, `playbook`, `query`.

The files under [`examples/`](examples) cover each of them and are parsed and validated by the test suite.

## Parsing behaviour worth knowing

- **The parser always returns an AST.** On an error it reports it, skips to the next top-level block and carries on, so one broken block does not hide the rest of the file. Tools can keep working on the blocks that parsed.
- **Nothing is dropped silently.** An unrecognised character, an unknown or repeated key in a block, a wrongly typed value and an unclosed brace are all reported with a range.
- **Validate only a clean parse.** `validate` assumes the file parsed without errors; on a recovered AST it would report references to blocks that failed to parse.

## The runtime's part: `LanguageHost`

Some rules belong to the runtime that will run the file, not to the language: which integration providers exist, how the body of an `@openui { }` block is checked, and which coding harnesses a `computer` may declare. Pass them in:

```ts
validate(ast, {
  workspace, // optional: index from @swirls/language/workspace
  host: {
    providers: { has: (key) => catalog.has(key) },
    openui: { extractBindings, validate },
    harnesses: {
      types: [{ name: 'coding' }],
      providers: [{ name: 'codex', package: 'codex' }],
    },
  },
})
```

With no `host` those checks are skipped: a provider or harness name only has to be well formed. The parser never consults the host, so any file parses the same everywhere.

`swirlsHost` (also at `@swirls/language/hosts/swirls`) is the harness catalog of the hosted Swirls runtime; the language server uses it. It does not include an integration provider catalog or an `@openui` checker.

Vocabulary that the deployment definition fixes (AI providers, search providers, channel platforms) is not host policy. The language reads those lists from `@swirls/definition`, so there is one copy.

## Serializer limits

`serialize` output parses to the same AST, keeps embedded code byte for byte, and is stable when run again. It is not a formatter. The AST does not hold `//` comments or the order blocks were written in, so comments are lost and blocks come out grouped by kind.

## Development

```bash
bun test
```

```bash
bun run typecheck
```

Depends on [`@swirls/definition`](../definition) for the shared schemas (resource names, node types, review config).
