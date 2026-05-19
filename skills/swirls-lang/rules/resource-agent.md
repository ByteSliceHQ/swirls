---
title: Agent Block Declaration
impact: HIGH
tags: resource, agent, llm, provider, model, role, tools, top-level
---

## Agent Block Declaration

Top-level `agent <name> { }` blocks declare an LLM agentic harness: which provider and model to use, which secret block holds the API key, a default system prompt, runtime knobs, the tools (subgraphs) the model may call, and zero or more named `role <name> { }` sub-blocks. `type: agent` nodes bind to an agent block by bare identifier.

**There is no `type:` field on an agent block** — the keyword `agent` identifies the block.

### Syntax

```swirls
agent <name> {
  label: "<optional>"
  description: "<optional>"

  provider: openrouter | anthropic | openai | google
  model: "<string>"
  secrets: <secret_block>             // optional

  system: @ts {                       // optional default system prompt
    return "..."
  }

  temperature: <number>               // optional
  maxTokens: <number>                 // optional
  maxSteps: <number>                  // optional

  tools: [graph_a, graph_b]           // optional; graphs exposed as LLM-callable tools

  role <role_name> {                  // zero or more roles
    description: "<optional>"
    tools: [graph_a]                  // optional; subset of agent.tools
    system: @ts { return "..." }      // optional override
  }
}
```

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `provider` | yes | Bare identifier: `openrouter`, `anthropic`, `openai`, or `google`. |
| `model` | yes | Quoted string. |
| `secrets` | no | Bare identifier naming a top-level `secret` block. |
| `system` | no | `@ts` block returning the default system prompt. |
| `temperature` | no | Number. |
| `maxTokens` | no | Number. |
| `maxSteps` | no | Number. Caps how many tool-call turns the agent may take. |
| `tools` | no | Array of bare identifiers naming graphs in the same workspace. |
| `role <name> { }` | no | Zero or more named roles. Each may override `system` and narrow `tools`. |
| `label` | no | Display string. |
| `description` | no | Free-form description. |

### Complete example

```swirls
secret ai_creds {
  vars: [OPENAI_API_KEY]
}

graph search_kb {
  label: "Search KB"
  root {
    type: code
    label: "Search"
    inputSchema: @json {
      { "type": "object", "required": ["q"], "properties": { "q": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["hits"], "properties": { "hits": { "type": "array" } } }
    }
    code: @ts { return { hits: [] } }
  }
}

graph escalate {
  label: "Escalate"
  root {
    type: code
    label: "Escalate"
    inputSchema: @json {
      { "type": "object", "required": ["reason"], "properties": { "reason": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["ticketId"], "properties": { "ticketId": { "type": "string" } } }
    }
    code: @ts { return { ticketId: "T-1" } }
  }
}

agent triage {
  label: "Support triage agent"
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
  maxSteps: 5
  temperature: 0.2
  tools: [search_kb, escalate]

  system: @ts {
    return "You are a support triage agent. Use tools to resolve tickets."
  }

  role support {
    description: "Frontline support agent"
    tools: [search_kb]
  }

  role escalations {
    description: "Senior agent who can escalate"
    tools: [search_kb, escalate]
    system: @ts {
      return "You are a senior agent. Escalate only when necessary."
    }
  }
}

graph handle_ticket {
  label: "Handle ticket"
  root {
    type: agent
    label: "Triage"
    agent: triage
    role: support
    prompt: @ts {
      return "Ticket: " + context.nodes.root.input.body
    }
  }
}
```

### Validation rules

- Agent names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `provider` must be one of the four allowed values.
- `model` must be a non-empty quoted string.
- Every entry in `tools:` must name a graph defined in the workspace.
- Every `role <name> { }` must have a unique name within the agent block. Each role's `tools:` must be a subset of the agent's top-level `tools:`.
- `type: agent` nodes' `agent:` field must match a declared agent block. If the node also sets `role:`, it must name a declared role in that block.

See `node-agent` for the binding side.
