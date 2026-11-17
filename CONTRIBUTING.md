# Contributing

## Setup

```bash
bun install
```

```bash
bun run verify
```

`verify` runs the type check, the tests, the linters and the format check. CI runs the same steps, plus a build and the Tree-sitter grammar tests.

## Checks

| Command                | What it does                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- |
| `bun run fmt`          | Format the repository with oxfmt (`bun run fmt:check` only reports).              |
| `bun run lint`         | oxlint with warnings denied, then a type-aware pass that rejects deprecated APIs. |
| `bun run typecheck`    | `tsc --noEmit` in every package.                                                  |
| `bun run test`         | Unit tests in every package.                                                      |
| `bun run test:grammar` | Tree-sitter corpus and highlight tests.                                           |

Lint rules live in `.oxlintrc.json` and formatting in `.oxfmtrc.json`. When a rule has to be silenced, use `// oxlint-disable-next-line <rule> -- <reason>` and give the reason.

## Commits and pull requests

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, with a type such as `feat`, `fix`, `refactor`, `test`, `docs` or `chore`. CI checks every commit in a pull request and its title with commitlint (`commitlint.config.js`). To check locally:

```bash
bun x commitlint --from origin/main --to HEAD --verbose
```

## Changesets

A change that someone using the VS Code extension can notice needs a changeset:

```bash
bun run changeset
```

CI fails a pull request that changes extension, language server, language or definition source without one. Use the `skip-changeset` label when users will not notice the change. [RELEASE.md](./RELEASE.md) describes how a release is cut.

## Editor extension

See [`editors/vscode/CONTRIBUTING.md`](./editors/vscode/CONTRIBUTING.md) for running the VS Code extension from this repository.
