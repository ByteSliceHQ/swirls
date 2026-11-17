# @swirls/language

Parser, AST, validator, and serializer for the **.swirls** DSL (domain-specific language). A `.swirls` file describes Swirls resources—forms, webhooks, schedules, workflows, triggers, optional top-level `secret` and `auth` blocks—in a single file. This package provides the core language machinery: turning source text into a structured representation and back.

## Components

### Lexer

**Role:** Turn raw source text into a stream of **tokens** with **source positions**.

The lexer (in `lexer.ts`) reads the file character-by-character and produces tokens such as:

- **Keywords** — `form`, `webhook`, `schedule`, `workflow`, `trigger`, `secret`, `auth`, `node`, `type`, `label`, `schema`, `cron`, `review`, `persistence`, `flow`, etc.
- **Identifiers** — resource and node names (e.g. `contact_form`, `entry`).
- **Literals** — strings (`"..."`), numbers, booleans (`true`/`false`).
- **Punctuation** — `{`, `}`, `[`, `]`, `:`, `,`, `->`, `-["label"]->`.
- **Embedded blocks** — `@ts { ... }`, `@ts "path.ts.swirls"`, `@json { ... }`, `@sql { ... }` with brace-balanced bodies for `{ ... }` forms (strings/comments aware). Each `fenced_block` or `ts_path_ref` token carries the inner content/path and its range so the parser and LSP can treat embedded code as a distinct region.

Every token has a `range` (start/end line, column, and offset). That information is essential for the parser (to attach ranges to AST nodes) and for the LSP (for diagnostics, hover, and go-to-definition).

**Exports:** `Lexer`, `tokenize`, and types `Token`, `TokenKind`, `FencedBlockLang`.

### Parser

**Role:** Consume tokens and build an **abstract syntax tree (AST)** that represents the whole file.

The parser (in `parser.ts`) is a **recursive-descent** parser: it walks the token stream and, for each top-level keyword (`form`, `webhook`, `schedule`, `workflow`, `trigger`, `secret`, `auth`), calls a dedicated parse function. It produces a `SwirlsFile` AST that contains:

- `forms`, `webhooks`, `schedules`, `workflows`, `triggers`, `secrets`, `auths`
- Optional `version`

Each declaration (form, workflow, node, edge, trigger, etc.) has a **source range** so tools can map back to the original text. The parser also collects **parse errors** (unexpected tokens, missing braces, etc.) with ranges so the LSP can show red squiggles in the right place.

**Exports:** `parse`, and types `ParseResult`, `ParseError`.

### AST

**Role:** Typed representation of the structure of a .swirls file.

The AST types (in `ast.ts`) define the shape of the language:

- **SwirlsFile** — root: `version?`, `forms`, `webhooks`, `schedules`, `workflows`, `triggers`, `secrets`, `auths`.
- **Resource declarations** — `FormDecl`, `WebhookDecl`, `ScheduleDecl` with name, label, description, schema, etc.; `SecretsDecl` and `AuthDecl` also support optional `label` and `description`.
- **WorkflowDecl** — `nodes`, `edges`, optional `persistence`, optional `flowRange` (range of the `flow { ... }` block).
- **NodeDecl** — `name`, `type` (e.g. `code`, `ai`, `http`), `configFields` (e.g. `code`, `prompt` as `ConfigValue`), optional `inputSchema`/`outputSchema`, `reviewConfig`.
- **EdgeDecl** — `source`, `target`, optional `label`.
- **TriggerDecl** — `resourceType`, `resourceName`, `workflowName`.

All declarations include a **SourceRange**. Config values can be primitives, objects, arrays, or **ts_block** / **sql_block** (code + range + innerRange) for LSP and execution. Schema fields can carry **JsonBlockInfo** (code + innerRange) when the schema was written in a `\`\`\`json` block.

**Exports:** All AST types and `SourcePosition`, `SourceRange`.

### Validator

**Role:** Run **semantic checks** after parsing. The parser only checks syntax; the validator enforces Swirls rules.

The validator (in `validator.ts`) uses schemas from `@swirls/definition` and the AST to produce **diagnostics** (errors and warnings) with ranges:

- **Resource names** — must match the allowed pattern (e.g. `[a-zA-Z0-9_]+`).
- **Node types** — must be one of the known types (e.g. `code`, `ai`, `http`, `switch`).
- **Workflow structure** — edges must reference existing nodes; workflow must be a **DAG** with exactly one root (no cycles).
- **Triggers** — must reference existing forms/webhooks/schedules and workflows.
- **Node config** — required fields per node type (e.g. `code` for code nodes, `kind` for AI nodes).
- **Persistence** — non-empty condition block when persistence is used.
- **Review config** — validated against the review schema when present.

**Exports:** `validate`, and type `Diagnostic`.

### Serializer

**Role:** Turn the AST back into **.swirls source text**.

The serializer (in `serializer.ts`) walks the AST and emits the DSL string (e.g. `form name { ... }`, `workflow name { node x { ... } flow { a -> b } }`). Edge declarations are wrapped in a **flow** block. It preserves structure and uses `@json { }` / `@ts { }` / `@sql { }` where appropriate. Used for formatting and round-trip (parse → modify → serialize).

**Exports:** `serialize`.

## Pipeline

Typical usage:

1. **Lex** — `tokenize(source)` or `new Lexer(source).tokenize()` → tokens.
2. **Parse** — `parse(source)` → `{ ast: SwirlsFile, errors: ParseError[] }`.
3. If there are parse errors, report them and stop.
4. **Validate** — `validate(ast)` → `Diagnostic[]`.
5. Use `ast` for execution, tooling, or **serialize(ast)** to get source again.

The LSP (in `@swirls/swirls-lsp`) uses this pipeline for diagnostics and for resolving symbols (hover, definition, references); it also uses the AST to know where `@ts { }` and `@json { }` blocks are so it can delegate to TypeScript and JSON language services.

## Dependencies

- **@swirls/definition** — for `nodeTypeSchema`, `resourceNameSchema`, `reviewConfigSchema` used by the validator.
