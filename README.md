<p align="center">
  <a href="https://swirls.ai">
    <h1 align="center">SWIRLS_</h1>
  </a>
</p>

<p align="center">
  Deploy agentic AI. One file. One command.
</p>

<p align="center">
  <a href="https://swirls.ai"><strong>Website</strong></a> ·
  <a href="https://swirls.ai/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.gg/dAY9Pn5jYe"><strong>Discord</strong></a>
</p>

Swirls is a compact workflow language for deploying agentic AI. Write `.swirls` files, run locally with zero config, and deploy to the cloud with `swirls deploy` or `git push`.

```
resource webhook "/enrich" {
  schema input { email: string }
}

graph enrich_lead {
  node fetch_clearbit: http { ... }
  node score: ai { ... }
  node notify: email { ... }
}

trigger webhook "/enrich" -> enrich_lead
```

## What's in this repo

This repo contains the open-source components of Swirls:

| Directory | Description |
|-----------|-------------|
| `skills/swirls-lang` | [Skills.sh](https://skills.sh) skill for writing correct `.swirls` files — used by Claude Code and other LLM agents |

## Skills

Skills are used to write correct `.swirls` files.
They are used by Claude Code and other LLM agents.

```bash
npx skills add https://github.com/ByteSliceHQ/swirls --skill swirls-lang
```

## The Language

`.swirls` is a declarative DSL built around three concepts:

- **Resources** — Entry points (webhooks, forms, schedules)
- **Graphs** — DAGs of typed nodes (code, AI, HTTP, email, switch, stream, scrape, wait, bucket, document, human review, and more)
- **Triggers** — Connect resources to graphs

The language is designed to be diff-friendly, git-native, and easy for LLMs to generate.
Full LSP support is available in VS Code.

The language will be open-sourced. Follow the repo for updates.

## Swirls Cloud

[Swirls Cloud](https://swirls.ai) provides managed execution, observability, secret management, and deployment for your `.swirls` workflows.
Get started at [swirls.ai](https://swirls.ai).

## Contributing

We're building in public.
Join the [Discord](https://discord.gg/dAY9Pn5jYe) to shape the roadmap.

- **Add a Skill** — Follow the structure in `skills/`
- **Report issues** — Open an issue on this repo
