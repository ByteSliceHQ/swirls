# Releasing

This repository releases two things, both from the `release` workflow:

- The VS Code extension, `vscode-swirls` (publisher `swirlsai`), to the Visual Studio Marketplace and
  to Open VSX. It bundles the language server, so `@swirls/lsp`, `@swirls/language` and
  `@swirls/definition` reach users through it.
- The npm package [`@swirls/deploy`](https://www.npmjs.com/package/@swirls/deploy). Its build has
  `@swirls/language` and `@swirls/definition` compiled in, so it does not wait on them.

`@swirls/lsp`, `@swirls/language` and `@swirls/definition` are not published to npm.

## Version policy

Both use SemVer and Changesets, and are versioned independently.

- `patch` for fixes, `minor` for features and for changes in behaviour. Both are below 1.0.
- A change to `editors/vscode`, `packages/lsp`, `packages/language` or `packages/definition` that
  someone using the editor can notice needs a changeset naming `vscode-swirls`.
- A change to `packages/deploy`, `packages/language` or `packages/definition` that someone using
  `@swirls/deploy` can notice needs a changeset naming `@swirls/deploy`. A change to the language or
  the definition usually names both.
- CI (`scripts/check-changeset.ts`) fails a pull request that changes that source without a
  changeset naming the unit. A change nobody using either will notice (a refactor, tooling) takes
  the `skip-changeset` label instead.

## Normal release

1. On the feature branch, add a changeset and commit it with the change:

   ```sh
   bun run changeset
   ```

2. Merge the pull request after CI passes.
3. The `release` workflow's `version` job opens or updates a pull request titled
   `chore(release): version the VS Code extension and @swirls/deploy`. It bumps the version of each
   unit a changeset names and moves the changesets into `editors/vscode/CHANGELOG.md` and
   `packages/deploy/CHANGELOG.md`.
4. Review those changelogs and versions, then merge it. The workflow runs again on `main`, finds no
   changesets waiting, and starts two independent jobs:
   - `extension` builds and packages the extension, publishes the VSIX to both registries, then
     creates the tag `vscode-v<version>` and a GitHub release with the VSIX attached. It does
     nothing when that tag exists.
   - `npm` publishes `@swirls/deploy` (see [npm](#npm)), then creates the tag
     `@swirls/deploy@<version>` and a GitHub release with the changelog entry and the tarball. It
     does nothing when npm has the version and the tag exists.

   A unit whose version did not change is already released, so its job finds nothing to do.

5. Check the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=swirlsai.vscode-swirls),
   the [Open VSX page](https://open-vsx.org/extension/swirlsai/vscode-swirls) and the
   [npm page](https://www.npmjs.com/package/@swirls/deploy) show the new versions.

Do not publish from a developer checkout during the normal flow.

## Credentials

### VS Code extension

The `extension` job reads two repository secrets:

| Secret     | What it is                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `VSCE_PAT` | An Azure DevOps personal access token for the `swirlsai` publisher, scope Marketplace: Manage. |
| `OVSX_PAT` | An Open VSX access token for an account that is a member of the `swirlsai` namespace.          |

If either is missing the release step fails before it builds anything and names the one that is
not set. Both tokens expire; when one does, replace the secret and re-run the workflow.

### npm

The `npm` job publishes by [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm
trusts this repository's workflow through GitHub OIDC, so there is no npm token to store or
rotate. It runs in the GitHub environment `npm` with `id-token: write`, on Node 24 with the latest
npm, which trusted publishing needs. It is a job of its own so that protection rules on that
environment (required reviewers, say) hold up only the npm release, never the extension.

The trusted publisher is set on npmjs.com under `@swirls/deploy` → Settings → Trusted publishing:

| Field             | Value          |
| ----------------- | -------------- |
| Publisher         | GitHub Actions |
| Organization      | `ByteSliceHQ`  |
| Repository        | `swirls`       |
| Workflow filename | `release.yml`  |
| Environment name  | `npm`          |

Every field must match the run exactly. A mismatch (a renamed workflow file, a job without the
environment) makes `npm publish` fail with a 404 or "not authorized" error; nothing is published.
Once it works, the package's Settings page can be set to require two-factor authentication and
disallow tokens, so only this workflow can publish.

`scripts/release-deploy.ts` does the work:

1. Asks the registry for `https://registry.npmjs.org/@swirls%2Fdeploy/<version>` and checks whether
   the tag `@swirls/deploy@<version>` exists on GitHub.
2. Builds the package and packs it with `bun pm pack`. The package's dependencies use `catalog:`
   and `workspace:` versions, which only Bun's packer resolves; `npm publish` of the folder would
   ship them as written. It then fails unless the packed `package.json` has no `catalog:` or
   `workspace:` left and the tarball holds `dist/index.js` and `dist/index.d.ts`.
3. Publishes the tarball with `npm publish --provenance --access public` (a prerelease version goes
   to the `next` dist-tag), unless npm already has the version.
4. Creates the tag and the GitHub release, unless the tag exists.

### Checking provenance

The [npm page](https://www.npmjs.com/package/@swirls/deploy) shows a "Built and signed on GitHub
Actions" provenance badge linking to the workflow run and commit. From a shell:

```sh
npm view @swirls/deploy@<version> dist.attestations
```

```sh
cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @swirls/deploy@<version> && npm audit signatures
```

`npm audit signatures` reports the package as having a verified registry signature and a verified
attestation.

## Checking a release without publishing

```sh
bun run release:extension --dry-run
```

This builds and packages the extension and prints the version, the tag and the release notes it
would use. It needs no tokens and publishes nothing.

```sh
bun run release:deploy --dry-run
```

This builds, packs and checks `@swirls/deploy`, runs `npm publish --dry-run` on the tarball to show
what would be uploaded, and prints whether it would publish, the tag and the release notes. It
needs no credentials and publishes, tags and releases nothing.

## Recovery

The tag is created last, and it is what marks a version as released. So a run that failed part way
can simply be run again: a registry that already has the version is skipped, and the rest of the
release carries on. Re-run the failed job from its run page (Re-run failed jobs), which builds the
same commit; the `extension` and `npm` jobs are independent, so re-running one leaves the other
alone.

### VS Code extension

- **One registry has the version, the other does not.** Re-run the `extension` job.
- **Both registries have it but there is no tag or GitHub release.** Re-run the `extension` job.
- **A bad version was published.** Ship a fix as a new patch version. A Marketplace version can be
  removed from the publisher page, and an Open VSX version through its API, but users who already
  updated keep it until a newer version exists.

### npm

- **The job failed before npm accepted the version** (a build or tarball check failed, or trusted
  publishing was refused). Nothing was published. Fix the cause (for a refused publish, compare the
  trusted publisher settings with the table above) and re-run the `npm` job, or, if the fix needs a
  code change, merge it; the next run on `main` publishes.
- **npm accepted the version but tagging or the GitHub release failed.** Do not publish that
  version again (npm refuses it anyway) and do not bump the version to get past it. Re-run the
  `npm` job of the run that published: it sees npm has the version, skips publishing, and creates
  the tag and the release on that run's commit. If that run cannot be re-run, create them by hand
  on the commit npm's provenance names:

  ```sh
  gh release create @swirls/deploy@<version> --target <commit> \
    --title "@swirls/deploy <version>" --notes "<changelog entry>"
  ```

- **A bad version was published.** Ship a fix as a new patch version. Mark a dangerous one with
  `npm deprecate @swirls/deploy@<version> "<why>"`. Avoid unpublishing: npm never allows that
  version number again.
- **`latest` points at the wrong version.** `npm dist-tag add @swirls/deploy@<good-version> latest`
  (this needs an npm login with publish rights; trusted publishing covers only `npm publish`).

## Local commands

| Command                               | What it does                                              |
| ------------------------------------- | --------------------------------------------------------- |
| `bun run changeset`                   | Write a changeset.                                        |
| `bun x changeset status`              | Show the version the waiting changesets would produce.    |
| `bun run version-packages`            | What the workflow runs to build the version pull request. |
| `bun run release:extension --dry-run` | Build and package the extension, publish nothing.         |
| `bun run release:deploy --dry-run`    | Build, pack and check `@swirls/deploy`, publish nothing.  |
