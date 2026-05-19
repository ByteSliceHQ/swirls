---
title: Agent Nodes
impact: HIGH
tags: node, agent, llm, tools, role, prompt, harness
---

## Agent Nodes

Agent nodes run an LLM agentic harness defined by a top-level `agent` block. The agent block declares provider, model, secret keys, default system prompt, and the graphs exposed as LLM-callable tools. The agent node binds to that block, supplies a `prompt`, and optionally selects a `role`, narrows `tools`, or overrides `system`.

For a one-shot LLM call (no tools, no loop), use `ai` instead. `agent` is for multi-step harnesses with tool use.

**Required fields:** `agent` (bare identifier naming a top-level `agent <name> { }` block), `prompt` (`@ts`).

### Incorrect (missing required fields)

```swirls
node ask {
  type: agent
  prompt: @ts { return "Hi" }
}
```

The validator errors: `Node type "agent" requires "agent"`. The node must reference a declared `agent` block by name.

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

graph handle {
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

### Correct (role and narrowed tools)

```swirls
node ask {
  type: agent
  label: "Ask with role"
  agent: triage
  role: support
  tools: [search_kb]
  system: @ts {
    return "You are a senior support engineer. Be concise."
  }
  prompt: @ts {
    return context.nodes.root.input.question
  }
}
```

`role:` must name a `role <name> { }` declared inside the bound `agent` block. `tools:` (on the node) further narrows the tools exposed to this specific call; it must be a subset of the agent block's `tools:`. `system:` overrides the agent's default system prompt for this call only.

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `agent` | yes | Bare identifier | Names a top-level `agent <name> { }` block. |
| `prompt` | yes | `@ts` block | User prompt for this turn. |
| `role` | no | Bare identifier | Names a `role` declared inside the bound agent block. |
| `tools` | no | Array of bare identifiers | Subset of the agent block's tool graphs. |
| `system` | no | `@ts` block | Overrides the agent block's default `system:` for this call. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply.

See `resource-agent` for the agent block declaration.
