# @swirls/lsp

**Language Server** for `.swirls` files. It implements the [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) so that editors (e.g. VS Code via an extension) can provide rich editing support for the Swirls DSL in a single, reusable process.

## What is an LSP?

The **Language Server Protocol** is a standard (JSON-RPC over stdio or other transport) that separates “language smarts” from the editor. Instead of each editor implementing diagnostics, completions, hover, and go-to-definition for every language, a **language server** runs once per workspace and answers requests from any LSP-capable client. The editor only needs one LSP client; the server (this package) provides all Swirls-specific behavior. That way, the same server can power VS Code, Cursor, or other editors that support LSP.

## Why do we need one?

Without an LSP, editing `.swirls` files would be plain text: no red squiggles for parse or validation errors, no autocomplete for keywords or node names, no hover docs, and no “Go to definition” for forms, graphs, or nodes. The LSP gives:

- **Diagnostics** — Parse and validation errors (and, inside embedded blocks, TypeScript/JSON/SQL errors) with correct ranges.
- **Completions** — DSL keywords, resource names, node types, property keys, and inside `@ts { }` / `@sql { }` blocks, TS/SQL completions.
- **Hover** — Documentation for declarations (forms, graphs, nodes, etc.) and for the `review` property; inside `@ts { }`, TypeScript type info.
- **Go to definition** — Jump from a reference (e.g. trigger’s `form: X -> Y` or edge `A -> B`) to the definition of `X`, `Y`, `A`, or `B`; inside `@ts { }`, TS symbol definition.
- **Find references** — Find all edges and the definition for a node.
- **Signature help** — Inside `@ts { }`, parameter hints for function calls.

So we need an LSP to make `.swirls` files first-class in the editor and to reuse existing language intelligence for embedded TypeScript and JSON.

## Architecture

The server runs as a **stdio** process: the editor spawns it and talks over stdin/stdout. It keeps a **document cache** (open/updated `.swirls` files) and, for each request, parses the file with `@swirls/language` and then either handles the request in-DSL or delegates to an embedded language service.

### Core flow

1. **Connection & documents** — `server.ts` uses `vscode-languageserver` to create a connection and `TextDocuments` to track open files. On open/change, it (debounced) re-parses and refreshes diagnostics.
2. **Parsing** — Every feature that needs structure calls `parse(text)` from `@swirls/language` to get `{ ast, errors }`. Parse errors are reported as diagnostics; if parsing succeeds, `validate(ast)` adds semantic diagnostics (invalid names, DAG rules, trigger references, etc.).
3. **Position handling** — For each request, the server checks whether the cursor is in the **DSL** or inside an **embedded block** (`@ts { }`, `@json { }`, `@sql { }`). That determines which provider answers (Swirls vs TypeScript vs JSON vs SQL).

### Components

| Component          | Role                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **server.ts**      | LSP connection, document sync, routing of requests to the right provider (DSL vs TS vs JSON vs SQL), diagnostics orchestration, and caching of per-document TS state.                                                                                                                                                                                                            |
| **completions.ts** | **DSL completions**: top-level keywords (`form`, `graph`, …), node types, property keys, trigger bindings (form/webhook/schedule → graph), and node names for edges. Uses the AST to suggest only valid names (e.g. graphs for trigger target).                                                                                                                                  |
| **hover.ts**       | **DSL hover**: resolve the declaration at the cursor (`getDeclarationAtPosition`) and show description (and doc comment) for forms, webhooks, schedules, graphs, triggers, and nodes; special hover for the `review` property.                                                                                                                                                   |
| **definition.ts**  | **DSL go-to-definition**: use `getDeclarationAtPosition` and return the declaration’s `range` (e.g. the `node entry { ... }` block or the `form contact_form { ... }` block).                                                                                                                                                                                                    |
| **references.ts**  | **DSL find-references**: for a node, return the node’s definition range plus every edge that uses it as source or target; for other declarations, return the definition when requested.                                                                                                                                                                                          |
| **ts-service/**    | **Embedded TypeScript**: collect all `@ts { }` regions from the AST, build “virtual” TS files (with a small preamble for Swirls context types and a function wrapper), run the TypeScript **Language Service** on them, and map positions/ranges back to the original `.swirls` file. Used for diagnostics, completions, hover, definition, and signature help inside `@ts { }`. |
| **json-service/**  | **Embedded JSON**: for each `@json { }` block (e.g. schema), run **vscode-json-languageservice** validation and map diagnostics back to the `.swirls` document.                                                                                                                                                                                                                  |
| **sql-service/**   | **Embedded SQL**: detect cursor inside an `@sql { }` block and provide SQL keyword (and stream/table) completions; no full SQL parser, just block detection and simple completions.                                                                                                                                                                                              |

### Embedded blocks

- **`@ts { }` / `@ts "path.ts.swirls"` / `.ts.swirls` files** — Inline code is wrapped in a function and prefixed with a preamble that defines Swirls types (e.g. `SwirlsContext`). Each inline block becomes a virtual `.ts` file; standalone `.ts.swirls` buffers use one virtual file for the whole document, with typings derived from the parent `.swirls` reference (see `ts-bindings.ts`). The TS language service provides diagnostics, completions, hover, go-to-definition, and signature help; the server translates between virtual positions and real positions using `ts-service/virtual-docs.ts`.
- **`@json { }`** — Content is validated with the JSON language service; diagnostics are mapped back to the file via the block’s `innerRange`.
- **`@sql { }`** — Block boundaries and (optionally) stream context are derived from the AST; completions suggest SQL keywords and stream/table names.

## Dependencies

- **@swirls/language** — `parse`, `validate`, AST types, and source ranges for the whole pipeline.
- **vscode-languageserver** / **vscode-languageserver-textdocument** — LSP connection and document model.
- **vscode-json-languageservice** — JSON validation for `@json { }` blocks.
- **typescript** — TypeScript compiler API for the TS language service and virtual TS files.

## Building and running

- Build: `bun run build` (produces `dist/server.js`).
- The package exposes a **bin** entry `lsp` that runs the server. A VS Code (or other) extension typically spawns this binary and connects via stdio.

## Navigation test manifest

Cross-reference go-to-definition and find-references behavior is covered by `src/navigation.test.ts`, driven by cases in `src/nav-manifest.ts`.

When you add a new AST `*RefRange` / `*Ranges` field in `packages/language`, either add it to `NAV_REF_ALLOWLIST` (if it is not a navigation target) or add a manifest case with `astField` and, when possible, a behavioral row that clicks the reference and asserts the definition line. You do not need declaration smoke rows for every top-level block kind—only add behavioral cases for reference sites you care about.

Run `bun test` in this package; structural coverage fails if an AST ref field is unaccounted for.

## Summary

| Question                     | Answer                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is an LSP?              | A standard protocol so a single language server can provide diagnostics, completions, hover, definition, references, etc., to any LSP-capable editor.                                                                           |
| Why do we need one?          | To get editor support for `.swirls` (errors, autocomplete, docs, navigation) and to reuse TypeScript/JSON (and partial SQL) support inside `@ts` / `@json` / `@sql` blocks.                                                     |
| How does it use swirls-lang? | It parses and validates every file with `parse`/`validate`, uses the AST to find declarations and ranges, and uses the AST to locate `@ts` / `@json` / `@sql` blocks so it can delegate to the right embedded language service. |
