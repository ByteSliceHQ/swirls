---
title: Agent Nodes
impact: HIGH
tags: node, agent, llm, tools, profile, prompt, harness, sandbox, chat, schema
---

## Agent Nodes

Agent nodes run an LLM agentic harness defined by a top-level `agent` block. The agent block declares provider, model, secret keys, default system prompt, runtime knobs, optional sandbox sizing, and the workflows exposed as LLM-callable tools. The agent node binds to that block, supplies a `prompt`, and optionally selects a `profile`, narrows `tools`, overrides `system`, or constrains structured output with `schema`.

Use `agent` when you need tools, a persistent workspace (read/write/edit/bash/grep/find/ls), multi-step reasoning, or chat. For a one-shot LLM call with no tools and no multi-step work, use `ai` instead.

**Required fields:** `agent` (bare identifier naming a top-level `agent <name> { }` block), `prompt` (`@ts` block or file ref).

### Incorrect (missing required fields)

```swirls
node ask {
  type: agent
  prompt: @ts { return "Hi" }
}
```

The validator errors: `Node type "agent" requires "agent"`. The node must reference a declared `agent` block by name.

### Incorrect (`outputSchema` on a node is a hard parse error)

```swirls
node ask {
  type: agent
  agent: triage
  prompt: @ts { return "Hi" }
  outputSchema: @json { { "type": "object" } }
}
```

Parse error: `Use "schema" instead of "outputSchema" in node blocks`. Structured output on a node uses `schema:`, never `outputSchema:`. (`outputSchema` is root-only and belongs on workflow roots, not nodes.)

### Correct (minimal agent node)

```swirls
secret ai_creds {
  vars: [OPENAI_API_KEY]
}

agent triage {
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
  maxSteps: 5
  tools: [search_kb, escalate]
}

workflow handle {
  label: "Handle inbound"
  root {
    type: agent
    label: "Triage"
    agent: triage
    prompt: @ts {
      return "Triage this ticket: " + context.nodes.root.input.body
    }
  }
}
```

### Correct (profile, narrowed tools, structured output)

```swirls
node ask {
  type: agent
  label: "Ask with profile"
  agent: triage
  profile: support
  tools: [search_kb]
  system: @ts {
    return "You are a senior support engineer. Be concise."
  }
  prompt: @ts {
    return context.nodes.root.input.question
  }
  schema: @json {
    {
      "type": "object",
      "required": ["answer"],
      "properties": { "answer": { "type": "string" } }
    }
  }
}
```

`profile:` must name a `profile <name> { }` declared inside the bound `agent` block. `system:` overrides the agent's default system prompt for this call only. `schema:` constrains the final structured output; without it the turn returns the plain completion string.

### System-prompt precedence

System prompt pieces apply low to high: agent `system` (lowest) -> profile `system` (if a profile is chosen) -> node `system` (highest, wins last for final instructions).

### Tools (workflows-as-tools only)

Tools are workflows exposed to the LLM. There is no MCP, HTTP, or builtin tool syntax. Each tool workflow must have a non-empty workflow-level `description`, a root-node `inputSchema`, and an output schema on every leaf node. An AI leaf with `kind` other than `object` is exempt — its output shape is inferred from the kind. See `resource-agent` for the tool-workflow contract.

Node `tools:` may only narrow within the effective set: the profile's tools when a profile is chosen and declares `tools:`, otherwise the agent block's `tools:`. It cannot add tools beyond that set.

If the agent block declares a subagent `team:`, each team member is also exposed to the model as a callable tool (delegated to as its own agent). See `resource-agent` for the team contract.

### Execution shape

A turn runs a tool-call loop capped by the agent's `maxSteps` (default **20**, not 10). Built-in workspace tools (read, write, edit, bash, grep, find, ls) run inside a persistent, per-agent sandbox. Sandbox provisioning is lazy: chat-only turns that never call a tool never start one. Workspace files persist across turns for the same agent. Each subgraph named in the effective `tools:` is exposed to the model using its workflow `description` (tool help text) and root `inputSchema` (call arguments). Tool results are the subgraph's leaf outputs.

### Persistent chat

Multi-turn chat is not authored in the DSL. Start a persistent transcript with `swirls chat start <agent_name>`; the platform stores history (Postgres) and threads each turn's messages back into the agent. The agent's workspace files persist across turns of the same chat.

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `agent` | yes | Bare identifier | Names a top-level `agent <name> { }` block. |
| `prompt` | yes | `@ts` block or file ref | User prompt for this turn. |
| `profile` | no | Bare identifier | Names a `profile` declared inside the bound agent block. |
| `tools` | no | Array of bare identifiers | Narrows within the effective tool set (profile tools if a profile is chosen and declares tools, else agent tools). |
| `system` | no | `@ts` block | Overrides the agent block's default `system:` for this call (highest precedence). |
| `schema` | no | `@json` block, named ref, or inline object | Constrains structured final output. Never `outputSchema`. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply.

See `resource-agent` for the agent block declaration.
