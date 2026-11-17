# Changesets

A changeset is a short Markdown file that says which package a change affects, whether it is a
patch, minor or major change, and what a user will notice. Add one with:

```sh
bun run changeset
```

Today the only released unit is the VS Code extension, `vscode-swirls`. It bundles the language
server, the language and the definition, so a change to any of them that a user of the editor can
see needs a changeset naming `vscode-swirls`. See [RELEASE.md](../RELEASE.md).
