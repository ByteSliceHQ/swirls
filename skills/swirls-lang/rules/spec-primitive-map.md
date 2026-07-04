---
title: Intent to Primitive Map
impact: HIGH
tags: spec, primitives, taxonomy, intent, natural-language, categories
---

## Intent to Primitive Map

Before writing syntax, map the user's request to primitives. The top-level blocks organize into five categories; pick blocks by category, then look up exact syntax in the other rules.

| Category | Blocks | One-line job |
|---|---|---|
| Agents | `agent`, `channel`, `skill`, `mcp` | Actors that reason; channels bind them to chat surfaces; skills package repo-local knowledge; mcp slots wire remote MCP servers |
| Workflows | `workflow`, `trigger`, `form`, `webhook`, `schedule`, `schema` | Deterministic procedures and what starts them |
| Memory | `stream`, `view`, `disk`, `postgres`, `database`, `migration` | Structured output, spreadsheet views over it, files, the user's existing database, a Swirls-managed database and its data migrations |
| Connections | `secret`, `auth`, `connection`, `action` | Outbound credentials (least-managed to most-managed) and typed integration operations |
| Access | `role`, `policy` | Inbound permission: who may invoke agents/workflows |

### Common intents

| User says | Use |
|---|---|
| "run X every Monday" / "daily report" | `schedule` + `trigger` + `workflow` |
| "when someone submits the form" | `form` + `trigger` + `workflow` |
| "when service Y calls us" / "on event" | `webhook` + `trigger` + `workflow` |
| "for each item" / "until done" / repeat the same step over many items | `map` / `while` node (inline `subgraph { }` or `workflow:` ref; iterations run one at a time) |
| "research the web with AI" / "multi-query search" / "find entities online" | `parallel` node (Parallel.ai API — not for workflow parallelism) |
| "needs human approval first" | `review: { enabled: true }` on the node |
| "summarize / classify / extract with AI" | `ai` node (single call, typed output) |
| "an assistant that can decide / multi-step reasoning" | `agent` block + `agent` node |
| "answer in Slack / Linear / Discord / our site" | `channel` block bound to the agent (+ `connection` for the platform) |
| "restrict the agent's tools for this step" | `profile` inside the agent block, selected via `profile:` on the node |
| "teach the agent our conventions / reference docs" | `skill` block (from `.agents/skills/<name>/`) + `agent.skills:` |
| "let the agent use a vendor's MCP tools" | `mcp` block + `agent.mcp:` (server URL bound per project in Cloud) |
| "save the results / reuse output later" | top-level `stream` block + `type: stream` reader node |
| "see the data as a spreadsheet / table" | top-level `view` block over the stream(s) |
| "a column that runs AI / a graph for each row" | `computed { }` column in a `view` block |
| "shared files / give the agent a workspace" | `disk` block + `type: disk` nodes |
| "query/update our (existing, self-hosted) database" | `postgres` block + `type: postgres` nodes |
| "give us a database / provision Postgres for this project" | `database` block (`@prisma` schema) + `context.db.<name>` in `code` nodes, or a `type: database` node for governed mutations |
| "a data change that isn't just a schema change" (backfill, column merge) | `migration` block targeting a `database` |
| "call an API with our key" | `secret` + `auth` + `http` node |
| "post to Slack/Linear/Discord/LinkedIn/Microsoft without keys" | `connection` block + `http` node `connection:` |
| "send an email" | `email` node |
| "scrape a page" | `scrape` node |
| "only team X can use agent Y" / "map our org chart" | `role` blocks + `policy` grants (grants flip the project to deny-by-default) |
| "call paid external capabilities / API marketplace" | optional `wallet: { }` on an `agent` block (enables Zero tools) |
| "password-protect the form" | `basic` auth block + form `auth:` |
| "verify webhook callers" | webhook `secret:` + `header:` |

### Disambiguations the map encodes

- Fuzzy task → `agent`; exact repeatable procedure → `workflow`. Agents call workflows as tools, so "an assistant that follows our process" is both.
- One LLM call with a typed answer → `ai` node; multi-step reasoning with tools → `agent`.
- Outbound credentials (`secret`/`auth`/`connection`) are not inbound permission (`role`/`policy`). "Connect to Slack" is a connection; "only support can use the Slack bot" is access.
- Structured reusable output → `stream`; a spreadsheet over that output (with per-row computed columns) → `view`; files → `disk`; the user's own external data → `postgres`; a database Swirls provisions and migrates → `database` (+ `migration` for data transforms a schema diff can't express).
- `postgres` (bring-your-own, hand-written JSON Schema, raw `@sql`) is not `database` (Swirls-managed, Prisma schema, typed `context.db` client). Pick by who operates the database.
- `role` (top-level, who may invoke) is not `profile` (inside `agent`, what it may do).
- `parallel` node is Parallel.ai web research (`search`, `extract`, `findall`), not workflow concurrency. Use `map`/`while` for iteration; independent branches in a DAG are just multiple edges from one node in `flow { }`.
