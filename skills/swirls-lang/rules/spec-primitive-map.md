---
title: Intent to Primitive Map
impact: HIGH
tags: spec, primitives, taxonomy, intent, natural-language, categories
---

## Intent to Primitive Map

Before writing syntax, map the user's request to primitives. The sixteen top-level blocks organize into five categories; pick blocks by category, then look up exact syntax in the other rules.

| Category | Blocks | One-line job |
|---|---|---|
| Agents | `agent`, `channel` | Actors that reason; channels bind them to chat surfaces |
| Workflows | `workflow`, `trigger`, `form`, `webhook`, `schedule`, `schema` | Deterministic procedures and what starts them |
| Memory | `stream`, `disk`, `postgres` | Structured output, files, the user's existing database |
| Connections | `secret`, `auth`, `connection` | Outbound credentials, least-managed to most-managed |
| Access | `role`, `policy` | Inbound permission: who may invoke agents/workflows |

### Common intents

| User says | Use |
|---|---|
| "run X every Monday" / "daily report" | `schedule` + `trigger` + `workflow` |
| "when someone submits the form" | `form` + `trigger` + `workflow` |
| "when service Y calls us" / "on event" | `webhook` + `trigger` + `workflow` |
| "for each item" / "until done" | `map` / `while` node (inline `subgraph { }` or `workflow:` ref) |
| "at the same time" / "in parallel" | `parallel` node |
| "needs human approval first" | `review: { enabled: true }` on the node |
| "summarize / classify / extract with AI" | `ai` node (single call, typed output) |
| "an assistant that can decide / multi-step reasoning" | `agent` block + `agent` node |
| "answer in Slack / Linear / Discord / our site" | `channel` block bound to the agent (+ `connection` for the platform) |
| "restrict the agent's tools for this step" | `profile` inside the agent block, selected via `profile:` on the node |
| "save the results / reuse output later" | top-level `stream` block + `type: stream` reader node |
| "shared files / give the agent a workspace" | `disk` block + `type: disk` nodes |
| "query/update our database" | `postgres` block + `type: postgres` nodes |
| "call an API with our key" | `secret` + `auth` + `http` node |
| "post to Slack/Linear/Discord/LinkedIn/Microsoft without keys" | `connection` block + `http` node `connection:` |
| "send an email" | `email` node |
| "scrape a page" | `scrape` node |
| "only team X can use agent Y" / "map our org chart" | `role` blocks + `policy` grants (grants flip the project to deny-by-default) |
| "password-protect the form" | `basic` auth block + form `auth:` |
| "verify webhook callers" | webhook `secret:` + `header:` |

### Disambiguations the map encodes

- Fuzzy task → `agent`; exact repeatable procedure → `workflow`. Agents call workflows as tools, so "an assistant that follows our process" is both.
- One LLM call with a typed answer → `ai` node; multi-step reasoning with tools → `agent`.
- Outbound credentials (`secret`/`auth`/`connection`) are not inbound permission (`role`/`policy`). "Connect to Slack" is a connection; "only support can use the Slack bot" is access.
- Structured reusable output → `stream`; files → `disk`; the user's own data → `postgres`.
- `role` (top-level, who may invoke) is not `profile` (inside `agent`, what it may do).
