---
'vscode-swirls': minor
---

The extension is now built from the open-source Swirls repository.

- Diagnostics, hover and navigation are faster on large files and large workspaces.
- Navigation, hover and TypeScript features keep working when another block in the file has a syntax error.
- A `.ts.swirls` file is type-checked against the `.swirls` file that references it even when that file is not open.
- Unknown, repeated and wrongly typed keys in a block are reported, and so are unrecognised characters and unclosed braces.
- TypeScript syntax errors inside `@ts { }` blocks are reported, and diagnostics in single-line `@ts { }` blocks point at the right column.
- The extension is smaller: the language server bundle went from 17 MB to 5 MB.
- The unused `swirls.lsp.enableTypeScriptIntellisense` setting is removed.
