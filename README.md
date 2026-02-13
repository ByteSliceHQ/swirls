<p align="center">
  <a href="https://swirls.ai">
    <h1 align="center">🌀 Swirls</h1>
  </a>
</p>

<p align="center">
  The Swiss army knife for building AI workflows.
</p>

<p align="center">
  <a href="https://swirls.ai"><strong>Website</strong></a> ·
  <a href="https://swirls.ai/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.gg/wuS5mnMV"><strong>Discord</strong></a>
</p>

---

Swirls is a visual workflow builder for AI agents with type-safe code generation. Build deterministic workflows with HTTP calls, LLM reasoning, and data transforms - deploy instantly. When you need to integrate into your app, we generate a type-safe SDK tailored to your graphs.

This repo contains our OpenAPI spec, CLI, SDK, MCP server, and the [Skills](https://skills.sh) that power LLM-driven development with Swirls.

## Why Swirls

### Token economics are broken

Traditional MCP tools dump entire API responses into LLM context. An agent enriching a lead might consume 22,500+ tokens of raw JSON just to extract a few fields.

Swirls graphs move orchestration **out** of the LLM and **into** deterministic execution:

```
Traditional MCP:
  Agent → fetch Clearbit (12,500 tokens in context)
       → fetch BuiltWith (10,000 tokens in context)
       → LLM orchestrates extraction
  Total: 22,500+ tokens

Swirls:
  Agent → call enrich_lead graph (1 function call)
       → graph fetches, extracts, scores internally
       → returns structured result (200 tokens)
  Total: 700 tokens — 97% reduction
```

### Type-safe integration

Other visual builders leave you with stringly-typed `fetch` calls. Swirls generates a TypeScript SDK from your graphs:

```typescript
import { enrichLead } from '@swirls/generated';

const result = await enrichLead.execute({
  emial: formData.email
  // ^ TypeScript error: did you mean 'email'?
});
```

Full IntelliSense. Compile-time errors. No API wrestling.

### Auditable and deterministic

Every graph is visual, version-controllable, testable, and shareable. Same inputs always produce the same outputs. Agents can even build their own graphs — turning repeated patterns into optimized, reusable tools.

## How It Works

### 1. Build in the UI

Drag and connect nodes — no code, no infrastructure:

- **HTTP** — Call any REST API
- **LLM** — Claude, GPT-4, Llama
- **Code** — Transform data with TypeScript
- **Decision** — Conditional routing

Deploy and your graph is instantly available as an MCP tool, webhook endpoint, scheduled job, or form handler.

### 2. Use it immediately

Your agent calls it as an MCP tool with minimal context. Or trigger via webhook:

```bash
POST https://swirls.ai/trigger/your-graph-id
```

### 3. Integrate into your app (optional)

```bash
swirls dev gen
```

Generates a type-safe SDK for your graphs — import typed functions, get IntelliSense, catch errors at compile time.

## Skills

This repo ships [Skills.sh](https://skills.sh) skills that LLM agents (Claude Code, etc.) can use when building with Swirls:

| Skill | Description |
|-------|-------------|
| `micro-saas` | Bootstrap a complete micro-SaaS application powered by Swirls |

### Micro-SaaS Skill

We're building a skill to help you bootstrap micro-SaaS apps using:

- **TanStack Start** — Full-stack React with type-safe routing and SSR
- **Better Auth** — Authentication and session management
- **SQLite** — Embedded database, zero infrastructure
- **Swirls** — AI workflows and form handling via generated SDK

This skill will help you go from zero to deployed SaaS.

## OpenAPI Spec

The full OpenAPI 3.1 spec is generated from our type-safe [oRPC](https://orpc.unnoq.com/) contract covering: agents, API keys, forms, graphs, projects, schedules, schemas, secrets, storage, triggers, webhooks, and more.

## CLI

```bash
bun install -g @swirls/cli
```

```bash
swirls dev init      # Initialize a Swirls config
swirls dev gen       # Generate types and SDK from your graphs
swirls auth login    # Authenticate with Swirls
```

## Contributing

We're building in public. Join the [Discord](https://discord.gg/swirls) to shape the roadmap.

- **Add a Skill** — Follow the existing structure in the skills directory
- **Improve the SDK** — PRs welcome
- **Report issues** — Open an issue on this repo

## License

See [LICENSE](./LICENSE) for details.
