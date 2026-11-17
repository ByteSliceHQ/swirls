# Swirls

Syntax highlighting and language support for `.swirls` workflow files in VS Code.

## Features

- **Syntax highlighting** for `.swirls` files
- **Language Server (LSP)** for diagnostics, validation, and navigation
- **TypeScript intellisense** inside `@ts { }` blocks
- **JSON validation** inside `@json { }` blocks
- **Language configuration** (comments, brackets, indentation)

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=swirlsai.vscode-swirls) or [Open VSX](https://open-vsx.org/extension/swirlsai/vscode-swirls).

Or install from a `.vsix` file: **Extensions** → **...** → **Install from VSIX...**.

## Configuration


| Setting                                   | Description                                                           | Default |
| ----------------------------------------- | --------------------------------------------------------------------- | ------- |
| `swirls.lsp.enableTypeScriptIntellisense` | Enable TypeScript completions and diagnostics inside `@ts { }` blocks | `true`  |


## Links

- [Swirls](https://swirls.ai)
- [Repository](https://github.com/ByteSliceHQ/swirls)
- [Contributing](CONTRIBUTING.md) — local LSP build, Extension Development Host, testing changes in the monorepo

## For publishers

To add a Marketplace icon, add `icon.png` (128x128 or 256x256) to this directory and set `"icon": "icon.png"` in `package.json`.
