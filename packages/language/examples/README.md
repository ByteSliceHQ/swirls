# Example `.swirls` files

## Basics

| File | What it shows |
|------|----------------|
| **minimal.swirls** | One form, one workflow (`root` code node), one trigger. Optional review on `root`. |
| **contact-form-workflow.swirls** | Form → normalize (`root`) → AI summarize → email confirmation. |
| **ai-tasks.swirls** | AI kinds: `object`, `image`, `embed`, `video` in parallel from one entry. |
| **image-classify.swirls** | File upload (`swirls:file`) → AI vision (`kind: object`); `remix_image` returns generated image handles via engine blob promotion; `vision_lab` Surface app with chat agent, remix OpenUI page (`WorkflowLauncher` + `RunTimeline`). |

## Resources and triggers

| File | What it shows |
|------|----------------|
| **webhook-and-schedule.swirls** | `webhook` + `schedule` resources, one workflow, two triggers on the same workflow. |
| **secrets-declaration.swirls** | Top-level `secret { vars: [...] }`, node `secrets:`, `context.secrets`. |

## Schemas and TypeScript

| File | What it shows |
|------|----------------|
| **named-schema.swirls** | Top-level `schema name { }`, `schema: name` on form and nodes, `version:` |
| **standalone-ts-ref.swirls** + **normalize-email.ts.swirls** | `code: @ts "./normalize-email.ts.swirls"` — logic in a `.ts.swirls` file. |

## Routing and branching

| File | What it shows |
|------|----------------|
| **switch-routing.swirls** | `switch` + `cases` / `router`, labeled edges, AI + code branches. |

## Subworkflows

| File | What it shows |
|------|----------------|
| **subgraph.swirls** | `type: workflow` with `workflow: ` + `input: @ts`, child workflow in the same file. |

## Agents (tool-calling workflows)

| File | What it shows |
|------|----------------|
| **agent.swirls** | Top-level `agent { }` profiles with `secrets:`, nested `role { … }`, workflow-backed `tools: [ … ]`, and `type: agent` webhook demos sharing tool subgraphs.
| **workflow-execute-agent-tool.swirls** | E2E target for `swirls workflow execute`: parent workflow → `type: agent` node → agent calls a single workflow-backed tool that performs a basic code transformation (string reversal). |
| **sandbox-agent-write-poem.swirls** | E2E target for `swirls workflow execute`: parent workflow → `type: agent` node → agent uses the built-in sandbox `write` tool to save a poem as `poem_<unix>.txt` (topic from root input); successful runs persist to `store_poems` stream. |
| **chat-delegating.swirls** | Chat entry `agent` whose tool workflow wraps an `agent` node delegating to a second agent (multi-agent delegation). |

## Loops (`map` / `while`)

| File | What it shows |
|------|----------------|
| **loop-batch-pipeline.swirls** | `map` with inline multi-node `subgraph`, `merge`, then `while` with `condition` / `update` / `maxIterations`, `context.iteration`. |

## Reviews

| File | What it shows |
|------|----------------|
| **review-workflow.swirls** | Review `schema`, `context.reviews`, inline object-literal `inputSchema` / `outputSchema`. |
| **content_review.swirls** | AI screen, review with **`actions:`**, switch routing on `context.reviews.*.decision`, Resend branches. |

## Streams (persist + query)

| File | What it shows |
|------|----------------|
| **stream.swirls** | Top-level `stream { workflow: , condition:, prepare: }`, `type: stream` + `filter: @ts`, `context.output` for leaves. |
| **stream-switch.swirls** | Switch workflow + stream `condition` / `prepare` with optional `context.output` leaves. |

## Integrations

| File | What it shows |
|------|----------------|
| **postgres.swirls** | Top-level `postgres { table { schema: … } }`, `type: postgres` `select:` / `insert:` / `update:` / `delete:`, `params:`. |
| **disk.swirls** | Top-level `disk { id, region, secrets: }`, `type: disk` with `disk:` + `command:` (Swirls Cloud: Archil `disk.exec`). |
| **vendor-keys.swirls** | Shared `PARALLEL_API_KEY`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY` declarations for integration examples (one block name per key, project-wide). |
| **parallel-web-research.swirls** | `parallel` `operation: search` and `extract`. |
| **parallel-findall.swirls** | `operation: findall`, polling fields, `matchConditions`. |

`search-telem.swirls` demonstrates optional Telem web discovery with its own secret block; set `telem_research::TELEM_API_KEY` in project secrets.
