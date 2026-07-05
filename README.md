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

## Skills have moved

The swirls-lang skill installs directly from the site:

```bash
npx skills add https://swirls.ai
```

That resolves through the Agent Skills Discovery index at
[swirls.ai/.well-known/agent-skills](https://swirls.ai/.well-known/agent-skills/index.json),
which always serves the latest version with an integrity digest.

The copy that used to live in this repo (`skills/swirls-lang`) is deprecated
and no longer updated. If you installed from this repo, reinstall with the
command above.

## Getting Started

Swirls is a compact workflow language for authoring and deploying agents and workflows.
Write `.swirls` files and deploy with `swirls deploy` or `git push`.

- Visit our [website](https://swirls.ai) to learn more about Swirls.
- Visit the [quickstart](https://swirls.ai/docs/quickstart) to get started.

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
