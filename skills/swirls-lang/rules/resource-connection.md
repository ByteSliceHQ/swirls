---
title: Connection Block Declaration
impact: MEDIUM
tags: resource, connection, top-level, oauth, slack, linear, discord, linkedin, microsoft, http, channel, brokered
---

## Connection Block Declaration

Top-level `connection <name> { }` blocks declare a named, project-scoped, outbound OAuth integration slot (Slack, Linear, ...). The DSL declares the slot by name and provider; a human authorizes the grant in the project's Connections UI. Nodes and channels reference a connection by name, and Swirls brokers a short-lived token at execution time. **No credentials live in the file.**

A connection is the replacement for the removed `cloud` auth type. Use `connection` for a Swirls-brokered grant; use `auth` for credentials you bring yourself (see `resource-auth`).

**There is no `type:` field on a connection block** — the keyword `connection` identifies the block.

### Syntax

```swirls
connection <name> {
  provider: slack | linear | discord | linkedin | microsoft   // required; bare value
  label: "<optional label>"
  description: "<optional description>"
}
```

`provider` takes a **bare value** by convention (the parser also accepts a quoted string). It is the only required field.

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `provider` | yes | Bare value. One of `slack`, `linear`, `discord`, `linkedin`, `microsoft`. |
| `label` | no | Display string shown in the Connections UI. |
| `description` | no | Description shown in the Connections UI. |

### Providers

```
slack, linear, discord, linkedin, microsoft
```

No other providers exist. The set mirrors Fabric's integration providers.

### Referencing a connection

A connection is referenced by bare name from two places:

**HTTP nodes** via `connection: <name>`. The token is injected into the request at execution time. `connection` is only valid on `http` nodes. A node sets **either** `auth` **or** `connection`, never both.

```swirls
connection slack_workspace {
  label: "Acme Slack"
  provider: slack
}

node post_message {
  type: http
  method: "POST"
  url: "https://slack.com/api/chat.postMessage"
  connection: slack_workspace
  body: @ts {
    return JSON.stringify({ channel: "C123", text: "done" })
  }
}
```

**Channels** via `connection: <name>`. The connection's `provider` must match the channel's `platform`. See `resource-channel`.

```swirls
channel slack_concierge {
  platform: slack
  agent: concierge
  connection: slack_workspace
  mode: mention
}
```

### Validation diagnostics

- `Connection block name: <msg>` — name must match `^[a-zA-Z0-9_]+$`.
- `Duplicate connection block name "<n>"` — two connection blocks share a name.
- `Connection "<n>" requires a provider` — `provider:` is missing.
- `Connection "<n>" provider "<p>" must be one of: slack, linear, discord, linkedin, microsoft` — unsupported provider.
- Parser: `connection must declare provider` / `connection provider must be a name` / `Unknown connection property "<key>"` / `Expected connection name`.
- `HTTP node references undefined connection "<n>"` — a node's `connection:` value is not a declared connection block.
- `"connection" is only valid on http nodes` — `connection:` appears on a non-http node.
- `Node "<n>": set "auth" or "connection", not both. Use "auth" for your own credentials, "connection" for a Swirls-brokered grant.` — a node set both fields.
- `Channel "<n>" references unknown connection "<c>"` — a channel's `connection:` value is not a declared connection block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — the connection provider differs from the channel platform.

Token exchange and header injection are platform concerns; the DSL validates references and the provider value.
