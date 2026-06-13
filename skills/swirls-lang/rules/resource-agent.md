---
title: Agent Block Declaration
impact: HIGH
tags: resource, agent, llm, provider, model, profile, tools, sandbox, wallet, secrets, top-level
---

## Agent Block Declaration

Top-level `agent <name> { }` blocks declare an LLM agentic harness: which provider and model to use, which secret block holds the API key, a default system prompt, runtime knobs, optional sandbox sizing, the tools (workflows) the model may call, an optional subagent `team` it may delegate to, and zero or more named `profile <name> { }` sub-blocks. `type: agent` nodes bind to an agent block by bare identifier, and `channel` blocks expose an agent on a chat platform.

**There is no `type:` field on an agent block** — the keyword `agent` identifies the block. Names must match `^[a-zA-Z0-9_]+$`.

### Syntax

```swirls
agent <name> {
  label: "<optional>"
  description: "<optional>"

  provider: openrouter | anthropic | openai | google   // optional, default openrouter
  model: "<string>"                                     // REQUIRED quoted string
  secrets: <secret_block>                               // REQUIRED bare identifier ref

  system: @ts {                       // optional default system prompt (@ts only)
    return "..."
  }

  temperature: <number>               // optional
  maxTokens: <number>                 // optional
  maxSteps: <number>                  // optional; default 20

  tools: [workflow_a, workflow_b]           // optional; workflows exposed as LLM-callable tools
  team: [agent_b, agent_c]                  // optional; other agents this one may delegate to

  sandbox: {                          // optional; workspace sizing + lifecycle
    cpus: 2
    memoryMiB: 1024
    diskGiB: 10
    autoStopMinutes: 15
    autoArchiveMinutes: 60
    autoDeleteMinutes: 1440
    ephemeral: false
  }

  wallet: {                           // optional; enables Zero tool spend (zero_search, zero_get, zero_fetch, zero_wallet_status)
    budget: 50                         // USD per cadence window, > 0
    cadence: daily                     // daily | weekly | monthly (bare identifier)
    maxPerCall: 2                      // optional; per-call ceiling in USD
  }

  profile <profile_name> {                  // zero or more profiles
    description: "<optional>"
    tools: [workflow_a]                  // optional; SUBSET of agent.tools
    system: @ts { return "..." }      // optional override
    sandbox: { cpus: 1 }              // optional override
  }
}
```

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `model` | yes | Non-empty quoted string. |
| `secrets` | yes | Bare identifier naming a top-level `secret` block. NOT a string. The block must declare the provider key var. |
| `provider` | no | Bare identifier: `openrouter` (default), `anthropic`, `openai`, or `google`. |
| `system` | no | `@ts` block returning the default system prompt. `@ts` only. |
| `temperature` | no | Number. |
| `maxTokens` | no | Number. |
| `maxSteps` | no | Number. Caps how many tool-call turns the agent may take. Default **20**. |
| `tools` | no | Array of bare identifiers naming tool workflows in the workspace. |
| `team` | no | Array of bare identifiers naming other `agent` blocks this agent may delegate to as subagents. See below. |
| `sandbox: { }` | no | Workspace sizing and lifecycle. See below. |
| `wallet: { }` | no | Virtual tool-spend budget for Zero capabilities. See below. |
| `profile <name> { }` | no | Zero or more named profiles. Each may override `system`, `sandbox`, and narrow `tools`. |
| `label` | no | Display string. |
| `description` | no | Free-form description. |

### Provider key mapping

The bound `secret` block must declare the env var matching the provider:

| `provider` | Required secret var |
|------------|---------------------|
| `openrouter` (default) | `OPENROUTER_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` |

### Sandbox block

The optional `sandbox: { }` block sizes and governs the per-agent persistent workspace (where built-in read/write/edit/bash/grep/find/ls tools run). All fields are optional numbers/booleans:

| Field | Bound | Notes |
|-------|-------|-------|
| `cpus` | `>= 1` | vCPU count. |
| `memoryMiB` | `>= 128` | Memory in MiB. |
| `diskGiB` | `>= 1` | Disk in GiB. |
| `autoStopMinutes` | `>= 0` | Idle stop; `0` disables. |
| `autoArchiveMinutes` | `>= -1` | Idle archive; `-1` disables. |
| `autoDeleteMinutes` | `>= -1` | Idle delete; `-1` disables. |
| `ephemeral` | boolean | Discard workspace after the turn. |

Out-of-bounds values error with `Agent "<name>": sandbox.<field> must be ...`.

### Wallet block (Zero tool spend)

The optional `wallet: { }` block opts the agent into hosted **Zero** tools (`zero_search`, `zero_get`, `zero_fetch`, `zero_wallet_status`) at runtime. Swirls uses a shared platform wallet (`ZERO_PRIVATE_KEY`); the DSL wallet is a **virtual per-agent budget** enforced per UTC calendar window.

| Field | Required | Notes |
|-------|----------|-------|
| `budget` | yes | Positive number. USD cap for the cadence window. |
| `cadence` | yes | Bare identifier: `daily`, `weekly`, or `monthly`. |
| `maxPerCall` | no | Positive USD ceiling for a single paid `zero_fetch`. Must be `<= budget`. Defaults to a platform cap when omitted. |

When `wallet:` is present and the platform wallet is configured, the runtime registers `zero_search` (free catalog search), `zero_get` (inspect capability schema before calling), `zero_fetch` (paid capability calls with method/body and reserve-then-settle accounting), and `zero_wallet_status` (remaining budget for the current cadence window). Org-level prepaid budget is purchased via Autumn `tool_spend` (see billing); the agent wallet caps how fast each agent draws it down. The system prompt appendix guides the model to describe catalog search and automatic tool invocation when users ask about capabilities.

Validator diagnostics:

- `Agent "<n>": wallet requires budget as a positive number`
- `Agent "<n>": wallet.budget must be a positive number`
- `Agent "<n>": wallet requires cadence (daily, weekly, or monthly)`
- `Agent "<n>": wallet.cadence must be daily, weekly, or monthly`
- `Agent "<n>": wallet.maxPerCall must be a positive number`
- `Agent "<n>": wallet.maxPerCall must be less than or equal to wallet.budget`

There is no profile-level wallet override in v1.

```swirls
agent researcher {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  wallet: {
    budget: 50
    cadence: daily
    maxPerCall: 2
  }
}
```

### Complete example

```swirls
secret ai_creds {
  vars: [OPENAI_API_KEY]
}

workflow search_kb {
  label: "Search KB"
  description: "Search the knowledge base for relevant articles."
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

workflow escalate {
  label: "Escalate"
  description: "Escalate a ticket to a senior engineer and return the new ticket id."
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
  maxSteps: 8
  temperature: 0.2
  tools: [search_kb, escalate]

  sandbox: {
    cpus: 2
    memoryMiB: 1024
    diskGiB: 10
    autoStopMinutes: 15
  }

  system: @ts {
    return "You are a support triage agent. Use tools to resolve tickets."
  }

  profile support {
    description: "Frontline support agent"
    tools: [search_kb]
  }

  profile escalations {
    description: "Senior agent who can escalate"
    tools: [search_kb, escalate]
    system: @ts {
      return "You are a senior agent. Escalate only when necessary."
    }
  }
}

workflow handle_ticket {
  label: "Handle ticket"
  root {
    type: agent
    label: "Triage"
    agent: triage
    profile: support
    prompt: @ts {
      return "Ticket: " + context.nodes.root.input.body
    }
  }
}
```

### Tool workflows (workflows-as-tools only)

Tools are workflows exposed to the model. There is no MCP, HTTP, or builtin tool syntax. Each entry in `tools: [ … ]` must name a workflow in the workspace that:

- Has a non-empty workflow-level `description:` (fed to the model as tool help text).
- Has a root node with JSON `inputSchema` that declares a **non-empty `properties` object** (defines the tool call arguments — a tool with zero input properties is rejected: `Agent tool workflow "<n>" root inputSchema must declare a non-empty properties object`).
- Has an output schema on **every leaf node** (`outputSchema` on the root if it is a leaf, or `schema` on non-root leaves).

Built-in workspace tools (read, write, edit, bash, grep, find, ls) are always available inside the sandbox and are not declared in `tools:`.

### Subagent teams

`team: [ … ]` lists other `agent` blocks this agent may delegate to. Each team member becomes a callable tool: the model invokes it with a task description, the member runs as its own agent (own model, tools, and sandbox), and returns its result to the caller. Use teams to compose specialists behind one orchestrator instead of giving a single agent every tool and instruction.

```swirls
agent researcher {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  tools: [search_kb]
  system: @ts { return "Research the question and return concise findings with sources." }
}

agent writer {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  system: @ts { return "Turn findings into clear, well-structured prose." }
}

agent orchestrator {
  secrets: vendor_keys
  model: "google/gemini-3.1-flash-lite"
  maxSteps: 16
  team: [researcher, writer]
  system: @ts {
    return [
      "You coordinate specialists.",
      "Call a team tool with a clear task describing what to do.",
      "Relay the specialist's answer plainly.",
    ].join("\n")
  }
}
```

Team members are referenced by bare identifier (not a quoted string). A `team` member becomes a tool alongside the agent's `tools` workflows, so their names share one namespace.

### Validation rules

- Agent names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `model` must be a non-empty quoted string. `secrets` is required and is a bare identifier, not a string.
- `provider`, if present, must be one of the four allowed values; it defaults to `openrouter`.
- Every entry in `tools:` must name a tool workflow defined in the workspace.
- Every entry in `team:` must name a defined `agent` block in the workspace. An agent cannot list itself, a team member name cannot collide with a `tools:` workflow name in the same agent, and teams cannot form a cycle (`a -> b -> a` is rejected, as is any longer loop).
- Every `profile <name> { }` must have a unique name within the agent block. Each profile's `tools:` must be a SUBSET of the agent's top-level `tools:`.
- `sandbox.<field>` values must satisfy the bounds above.
- `type: agent` nodes' `agent:` field must match a declared agent block. If the node also sets `profile:`, it must name a declared profile in that block.

See `node-agent` for the binding side.
