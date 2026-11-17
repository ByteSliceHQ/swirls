# tree-sitter-swirls

A [tree-sitter](https://tree-sitter.github.io) grammar for the Swirls DSL (`.swirls` files), for editors that use tree-sitter: Neovim, Helix and Zed. It provides highlighting, folding, indentation and language injection for embedded `@ts`, `@json`, `@sql`, `@prisma`, `@sh` and `@ps` blocks.

It is not the compiler's parser. The parser in `packages/language` decides what is valid. This grammar models the shapes all blocks share (`kind name { ... }`, `key: value`, edges, grants), so it accepts new block kinds and field names without a change, and it does not report semantic errors.

`*.ts.swirls` files are TypeScript modules and are not covered.

## Neovim

With [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter) (`main` branch), register the parser, then run `:TSInstall swirls`:

```lua
vim.filetype.add({ extension = { swirls = 'swirls' } })

vim.api.nvim_create_autocmd('User', {
  pattern = 'TSUpdate',
  callback = function()
    require('nvim-treesitter.parsers').swirls = {
      install_info = {
        url = 'https://github.com/ByteSliceHQ/swirls',
        branch = 'main',
        location = 'editors/tree-sitter-swirls',
      },
    }
  end,
})

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'swirls',
  callback = function() vim.treesitter.start() end,
})
```

On the older `master` branch, set the same `install_info` (plus `files = { 'src/parser.c', 'src/scanner.c' }`) on `require('nvim-treesitter.parsers').get_parser_configs().swirls`.

Neovim reads queries from its runtime path, so link them in:

```sh
ln -s /path/to/swirls/editors/tree-sitter-swirls/queries ~/.config/nvim/queries/swirls
```

## Helix

Add to `~/.config/helix/languages.toml`, then run `hx --grammar fetch` and `hx --grammar build`:

```toml
[[language]]
name = "swirls"
scope = "source.swirls"
file-types = ["swirls"]
comment-token = "//"
block-comment-tokens = { start = "/*", end = "*/" }
indent = { tab-width = 2, unit = "  " }

[[grammar]]
name = "swirls"
source = { git = "https://github.com/ByteSliceHQ/swirls", rev = "<commit>", subpath = "editors/tree-sitter-swirls" }
```

Copy `queries/highlights.scm`, `injections.scm` and `locals.scm` to `~/.config/helix/runtime/queries/swirls/`. Two things differ from the Neovim dialect:

- Helix themes style `constant.numeric`, `constant.builtin.boolean`, `variable.other.member` and `constant.character.escape` where `highlights.scm` says `@number`, `@boolean`, `@property` and `@string.escape`. Rename those four captures in your copy.
- `indents.scm` uses other capture names. Use this instead:

  ```scm
  [(body) (object) (array) (embedded_block)] @indent
  ["}" "]"] @outdent
  ```

## Zed

Zed loads grammars through an extension. In the extension's `extension.toml`:

```toml
[grammars.swirls]
repository = "https://github.com/ByteSliceHQ/swirls"
rev = "<commit>"
path = "editors/tree-sitter-swirls"
```

and in `languages/swirls/config.toml`:

```toml
name = "Swirls"
grammar = "swirls"
path_suffixes = ["swirls"]
line_comments = ["// "]
block_comment = ["/* ", " */"]
tab_size = 2
brackets = [
  { start = "{", end = "}", close = true, newline = true },
  { start = "[", end = "]", close = true, newline = true },
  { start = "\"", end = "\"", close = true, newline = false, not_in = ["string", "comment"] },
]
```

Copy `queries/highlights.scm` and `injections.scm` into `languages/swirls/`. Zed's `indents.scm` has its own form:

```scm
(_ "{" "}" @end) @indent
(_ "[" "]" @end) @indent
```

## Development

```sh
npm install              # installs the pinned tree-sitter CLI; needs a C compiler
npm run generate         # grammar.js -> src/parser.c, src/grammar.json, src/node-types.json
npm test                 # corpus tests in test/corpus, highlight tests in test/highlight
npm run parse:examples   # parses every .swirls file in cookbook/, examples and fixtures
```

`src/parser.c`, `src/grammar.json` and `src/node-types.json` are generated and checked in, so editors can build the parser without the CLI. Regenerate them after any change to `grammar.js`. The parser is generated at ABI 14 so that editors on older tree-sitter runtimes can load it.

`src/scanner.c` is written by hand. It finds the end of an embedded block by counting braces the way the Swirls lexer does for that language (`scan*BlockBody` in `packages/language/src/lexer.ts`). If the lexer's rules change, change the scanner to match.

To add a corpus test, append a case to a file in `test/corpus/` and run `npx tree-sitter test --update` to fill in the tree, then check the tree is what you expect.

`scripts/parse-all.sh` takes extra directories, for example a checkout of the registry: `sh scripts/parse-all.sh ../../../swirls-platform/registry`.
