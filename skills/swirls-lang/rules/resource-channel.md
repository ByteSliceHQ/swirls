---
title: Channel Block Declaration
impact: MEDIUM
tags: resource, channel, top-level, agent, slack, linear, discord, web, platform, integration, mode
---

## Channel Block Declaration

Top-level `channel <name> { }` blocks bind an `agent` block to a chat platform. Once a channel is enabled, the agent answers messages on that platform: each inbound message starts an agent turn and the agent's reply is posted back to the conversation. The same agent block can simultaneously back a `type: agent` node, a `swirls chat` session, and one or more channels.

**There is no `type:` field on a channel block** — the keyword `channel` identifies the block. A channel is not a node and cannot appear inside a workflow's `flow { }`.

### Syntax

```swirls
channel <name> {
  platform: slack | linear | discord | web    // required
  integration: slack | linear | discord | web  // required; must equal platform
  agent: <agent_name>                           // required; bare identifier
  mode: mention | dm | all                      // optional; defaults to mention
  enabled: true | false                         // optional; defaults to enabled
  label: "<optional label>"
  description: "<optional description>"
}
```

`platform`, `integration`, and `mode` take **bare keyword values** (not quoted strings). `agent` is a **bare identifier** naming a top-level `agent` block, not a quoted string.

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `platform` | yes | Bare value. One of `slack`, `linear`, `discord`, `web`. Where messages are delivered. |
| `integration` | yes | Bare value. Credential source for the binding. **Must equal `platform`.** |
| `agent` | yes | Bare identifier naming an `agent` block (same file or another file in the workspace). |
| `mode` | no | Bare value `mention` (default), `dm`, or `all`. Controls which inbound events reach the agent. |
| `enabled` | no | Boolean. `false` makes the binding inactive. Defaults to enabled. |
| `label` | no | Display string shown in the Portal. |
| `description` | no | Description shown in the Portal. |

### Platforms and modes

| `platform` | Where the agent runs |
|------------|----------------------|
| `slack` | Slack channels and DMs. |
| `linear` | Linear issues and comments. |
| `discord` | Discord servers and DMs. |
| `web` | The embedded web chat surface. |

| `mode` | The agent responds to |
|--------|-----------------------|
| `mention` (default) | Only messages that @-mention the agent. |
| `dm` | Only direct messages. |
| `all` | Both mentions and direct messages. |

The `web` surface typically uses `mode: dm`.

**Correct (one agent, two surfaces):**

```swirls
secret vendor_keys {
  vars: [ OPENROUTER_API_KEY ]
}

agent concierge {
  label: "Concierge"
  secrets: vendor_keys
  provider: openrouter
  model: "openai/gpt-4o-mini"
  maxSteps: 8
  system: @ts {
    return "You are a helpful concierge. Prefer tools over guessing."
  }
}

channel slack_concierge {
  label: "Concierge (Slack)"
  platform: slack
  integration: slack
  agent: concierge
  mode: mention
  enabled: true
}

channel web_concierge {
  label: "Concierge (Web)"
  platform: web
  integration: web
  agent: concierge
  mode: dm
  enabled: true
}
```

### Routing uniqueness

The runtime routes an inbound event by the tuple `platform : mode : agent`. **Two enabled channels cannot share the same tuple** — the runtime would not know which binding wins. A disabled channel (`enabled: false`) does not count, so an inactive duplicate is allowed.

```swirls
// Valid: same platform + mode, different agents.
channel slack_concierge { platform: slack  integration: slack  agent: concierge  mode: mention }
channel slack_researcher { platform: slack  integration: slack  agent: researcher  mode: mention }
```

```swirls
// Invalid: two enabled bindings for slack:mention:concierge.
channel a { platform: slack  integration: slack  agent: concierge  mode: mention }
channel b { platform: slack  integration: slack  agent: concierge  mode: mention }
```

### Common mistakes

**`platform` and `integration` mismatch.** The two fields must be equal.

```swirls
// Incorrect
channel bad { platform: slack  integration: web  agent: concierge }
```

```swirls
// Correct
channel good { platform: slack  integration: slack  agent: concierge }
```

**`agent` as a quoted string.** It is a bare identifier naming an `agent` block.

```swirls
// Incorrect
channel bad { platform: web  integration: web  agent: "concierge" }
```

```swirls
// Correct
channel good { platform: web  integration: web  agent: concierge }
```

### Validation diagnostics

- `Channel "<n>" references unknown agent "<a>"` — `agent:` must name a declared `agent` block.
- `Channel "<n>" platform "<p>" must match integration "<i>"` — set `integration` equal to `platform`.
- `Duplicate channel routing: multiple enabled bindings for <platform>:<mode>:<agent> (including "<n>")` — change `mode`, point one at a different agent, or disable one.

See `resource-agent` for the `agent` block (including subagent `team`).
