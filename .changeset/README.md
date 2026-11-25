# Changesets

A changeset is a short Markdown file that says which package a change affects, whether it is a
patch, minor or major change, and what a user will notice. Add one with:

```sh
bun run changeset
```

Two units are released, and CI checks each has a changeset naming it when its source changes:

- The VS Code extension, `vscode-swirls`. It bundles the language server, the language and the
  definition, so a change to any of them that a user of the editor can see names `vscode-swirls`.
- The npm package `@swirls/deploy`. It compiles in the language and the definition, so a change to
  `packages/deploy`, `packages/language` or `packages/definition` that its users can see names
  `@swirls/deploy`.

A change to the language or the definition usually names both. See [RELEASE.md](../RELEASE.md).
