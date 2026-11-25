# Releasing

The only thing this repository releases today is the VS Code extension, `vscode-swirls` (publisher
`swirlsai`), to the Visual Studio Marketplace and to Open VSX. The extension bundles the language
server, so `@swirls/lsp`, `@swirls/language` and `@swirls/definition` reach users through it. Those
three packages are not published to npm yet.

`@swirls/deploy` is built to be published: `bun run build` writes a `dist` that has
`@swirls/language` and `@swirls/definition` compiled in, so it does not wait on them. A change to it
takes a changeset naming `@swirls/deploy`. The release workflow does not publish it to npm yet.

## Version policy

The extension uses SemVer and Changesets.

- `patch` for fixes, `minor` for features and for changes in behaviour. The extension is below 1.0.
- A change to `editors/vscode`, `packages/lsp`, `packages/language` or `packages/definition` that
  someone using the editor can notice needs a changeset naming `vscode-swirls`. CI fails a pull
  request that changes that source without one.
- A change nobody using the editor will notice (a refactor, tooling) takes the `skip-changeset`
  label instead.

## Normal release

1. On the feature branch, add a changeset and commit it with the change:

   ```sh
   bun run changeset
   ```

2. Merge the pull request after CI passes.
3. The `release` workflow opens or updates a pull request titled
   `chore(release): version the VS Code extension`. It bumps the extension's version and moves the
   changesets into `editors/vscode/CHANGELOG.md`.
4. Review that changelog and version, then merge it. The workflow runs again on `main`, finds no
   changesets waiting, and releases: it builds and packages the extension, publishes the VSIX to
   both registries, then creates the tag `vscode-v<version>` and a GitHub release with the VSIX
   attached.
5. Check the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=swirlsai.vscode-swirls)
   and the [Open VSX page](https://open-vsx.org/extension/swirlsai/vscode-swirls) show the version.

Do not publish from a developer checkout during the normal flow.

## Credentials

The workflow reads two repository secrets:

| Secret     | What it is                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `VSCE_PAT` | An Azure DevOps personal access token for the `swirlsai` publisher, scope Marketplace: Manage. |
| `OVSX_PAT` | An Open VSX access token for an account that is a member of the `swirlsai` namespace.          |

If either is missing the release step fails before it builds anything and names the one that is
not set. Both tokens expire; when one does, replace the secret and re-run the workflow.

## Checking a release without publishing

```sh
bun run release:extension --dry-run
```

This builds and packages the extension and prints the version, the tag and the release notes it
would use. It needs no tokens and publishes nothing.

## Recovery

The tag is created last, and it is what marks a version as released. So a run that failed part way
can simply be run again from the Actions tab (`release`, Run workflow): a registry that already has
the version is skipped, and the rest of the release carries on.

- **One registry has the version, the other does not.** Re-run the workflow.
- **Both registries have it but there is no tag or GitHub release.** Re-run the workflow.
- **A bad version was published.** Ship a fix as a new patch version. A Marketplace version can be
  removed from the publisher page, and an Open VSX version through its API, but users who already
  updated keep it until a newer version exists.

## Local commands

| Command                               | What it does                                              |
| ------------------------------------- | --------------------------------------------------------- |
| `bun run changeset`                   | Write a changeset.                                        |
| `bun x changeset status`              | Show the version the waiting changesets would produce.    |
| `bun run version-packages`            | What the workflow runs to build the version pull request. |
| `bun run release:extension --dry-run` | Build and package the extension, publish nothing.         |
