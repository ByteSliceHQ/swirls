---
title: Channel Block Declaration
impact: MEDIUM
tags: resource, channel, top-level, agent, slack, linear, discord, web, platform, connection, mode
---

## Channel Block Declaration

Top-level `channel <name> { }` blocks bind an `agent` block to a chat platform. Once a channel is enabled, the agent answers messages on that platform: each inbound message starts an agent turn and the agent's reply is posted back to the conversation. The same agent block can simultaneously back a `type: agent` node, a `swirls chat` session, and one or more channels.

**There is no `type:` field on a channel block** — the keyword `channel` identifies the block. A channel is not a node and cannot appear inside a workflow's `flow { }`.

### Syntax

```swirls
channel <name> {
  platform: slack | linear | discord | web    // required
  connection: <connection_name>                 // optional; bare name of a top-level connection block
  agent: <agent_name>                           // required; bare identifier
  mode: mention | dm | all                      // optional; defaults to mention
  enabled: true | false                         // optional; defaults to enabled
  label: "<optional label>"
  description: "<optional description>"
}
```

`platform` and `mode` take **bare values** by convention (the parser also accepts quoted strings). `agent` is a bare identifier naming a top-level `agent` block (a quoted string also parses). Unlike most blocks, channels reject unknown keys: `Unknown channel property "<key>"`.

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `platform` | yes | Bare value. One of `slack`, `linear`, `discord`, `web`. Where messages are delivered and how inbound events are routed. |
| `connection` | no | Bare name of a top-level `connection` block supplying the OAuth credential. Its `provider` must match `platform`. Lets one project bind multiple connections of the same provider. See `resource-connection`. |
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
| `web` | Standalone authenticated chatbox at `/chat/web/:projectId/:channelName` and embed/API surface. |

| `mode` | The agent responds to |
|--------|-----------------------|
| `mention` (default) | Only messages that @-mention the agent. |
| `dm` | Only direct messages. |
| `all` | Both mentions and direct messages. |

For `platform: web`, `mode` is optional and ignored by the chat service — web channels are keyed by **channel name**, not `platform:mode:agent`. You can declare multiple web channels for the same agent (for example separate chatbox links). For OAuth-backed platforms (`slack`, `linear`, `discord`), set `connection:` to name a `connection` block whose `provider` matches `platform`.

Cloud in-app chat lists **all deployed agents** and posts to `/chat/agent/:projectId/:agentName` — no web channel required. Use a `platform: web` channel when you want a dedicated standalone chatbox link or SDK embed keyed by channel name.

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
  agent: concierge
  mode: mention
  enabled: true
}

channel web_concierge {
  label: "Concierge (Web)"
  platform: web
  agent: concierge
  enabled: true
}
```

### Routing uniqueness

For **Slack, Linear, and Discord**, the runtime routes inbound events by the tuple `platform : mode : agent`. Two enabled channels cannot share the same tuple.

For **`platform: web`**, enabled channels are keyed by **channel block name**. Two enabled web channels cannot share the same name. Multiple web channels may bind the same agent.

```swirls
// Valid: same platform + mode, different agents.
channel slack_concierge { platform: slack  agent: concierge  mode: mention }
channel slack_researcher { platform: slack  agent: researcher  mode: mention }
```

```swirls
// Invalid: two enabled bindings for slack:mention:concierge.
channel a { platform: slack  agent: concierge  mode: mention }
channel b { platform: slack  agent: concierge  mode: mention }
```

### Common mistakes

**`agent` as a quoted string.** Convention is a bare identifier naming an `agent` block (a quoted string parses to the same value, but write it bare).

```swirls
// Convention
channel good { platform: web  agent: concierge }
```

### Validation diagnostics

- `Channel "<n>" references unknown agent "<a>"` — `agent:` must name a declared `agent` block.
- `Channel "<n>" references unknown connection "<c>"` — `connection:` must name a declared `connection` block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — the connection's `provider` differs from the channel's `platform`.
- `Duplicate channel name: multiple enabled web channels named "<n>"` — rename one web channel or disable it.
- `Duplicate channel routing: multiple enabled bindings for <platform>:<mode>:<agent> (including "<n>")` — for non-web platforms; change `mode`, point one at a different agent, or disable one.
- Parser: `channel platform must be slack, linear, discord, or web` / `channel mode must be mention, dm, or all` — invalid enum value.
- Parser: `channel must declare platform` / `channel must declare agent` — required field missing.
- Parser: `Unknown channel property "<key>"` — channels reject keys outside the documented set (including removed `integration:`).

See `resource-agent` for the `agent` block (including subagent `team`).
