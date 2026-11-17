<p align="center">
  <a href="https://swirls.ai">
    <h1 align="center">SWIRLS_</h1>
  </a>
</p>

<p align="center">
  Standard for authoring and deploying agents and workflows.
</p>

<p align="center">
  <a href="https://swirls.ai"><strong>Website</strong></a> ·
  <a href="https://swirls.ai/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.gg/ZXTBZGjQ5a"><strong>Discord</strong></a>
</p>

## Skills

The swirls-lang skill installs directly from the site:

```bash
npx skills add https://swirls.ai
```

That resolves through the Agent Skills Discovery index at
[swirls.ai/.well-known/agent-skills](https://swirls.ai/.well-known/agent-skills/index.json),
which always serves the latest version with an integrity digest.

## Getting Started

Swirls is a compact workflow language for authoring and deploying agents and workflows.
Write `.swirls` files and deploy with `swirls deploy` or `git push`.

- Visit our [website](https://swirls.ai) to learn more about Swirls.
- Visit the [quickstart](https://swirls.ai/docs/quickstart) to get started.

## Repository

| Path | Holds |
| --- | --- |
| [`packages/definition`](./packages/definition) | `@swirls/definition`: the deployment definition schema, the contract between the language and a runtime |
| [`packages/language`](./packages/language) | `@swirls/language`: lexer, parser, AST, validator, serializer and workspace index |
| [`packages/lsp`](./packages/lsp) | `@swirls/lsp`: the language server |
| [`packages/swirls`](./packages/swirls) | The `swirls` npm package |
| [`editors/vscode`](./editors/vscode) | The VS Code extension |
| [`editors/tree-sitter-swirls`](./editors/tree-sitter-swirls) | Tree-sitter grammar and queries for Neovim, Helix and Zed |
| [`cookbook`](./cookbook) | Ready-to-deploy recipes |

The language depends on nothing but the definition. Anything a runtime decides,
such as which integration providers exist or how an `@openui` block is checked,
is passed in through `LanguageHost` (see
[`packages/language/src/host.ts`](./packages/language/src/host.ts)).

```bash
bun install
bun run verify   # type check and tests
bun run build    # language server and VS Code extension
```

## Cookbook

Ready-to-deploy `.swirls` recipes live in [`cookbook/`](./cookbook), organized
by use case.

## Documentation

Visit [https://swirls.ai/docs](https://swirls.ai/docs) to view the full documentation.

## Community

The Swirls community can be found on [Discord](https://discord.gg/ZXTBZGjQ5a) where you can ask questions, voice ideas, and share your projects with other people.

---

## Security

If you believe you have found a security vulnerability in Swirls, we encourage you to **_responsibly disclose this and NOT open a public issue_**.

We do not offer a bug bounty program (yet), but please email [security@swirls.ai](mailto:security@swirls.ai) if you find a security vulnerability.
