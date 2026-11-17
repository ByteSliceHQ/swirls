# Third-party notices

## prisma.tmLanguage.json

`prisma.tmLanguage.json` is the Prisma Schema Language TextMate grammar, vendored
unmodified from the Prisma language-tools project:

- Source: https://github.com/prisma/language-tools
  (`packages/vscode/syntaxes/prisma.tmLanguage.json`)
- Copyright: Prisma Data, Inc.
- License: Apache License 2.0
  (https://github.com/prisma/language-tools/blob/main/LICENSE)

It is bundled here so that `@prisma { ... }` islands in `.swirls` files highlight
correctly without requiring the Prisma VS Code extension to be installed.
