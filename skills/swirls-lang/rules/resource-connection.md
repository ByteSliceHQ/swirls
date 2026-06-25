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

Providers are drawn from the Swirls integration catalog (currently `slack`, `linear`, `discord`, `linkedin`, `microsoft`), not a fixed DSL enum. A provider whose name is a valid key (letters, digits, underscore, hyphen) but is not yet in the catalog is **not a hard error** — it is a warning. Because `swirls doctor` does not surface warnings, such a connection **passes `swirls doctor` and then fails at deploy**. Use the Connections page to request an unsupported provider.

### Referencing a connection

A connection is referenced by bare name from three places:

**Integration nodes** (Fabric + provider proxy) via `connection: <name>`. Prefer `action: <actionBlock>` (typed transport from a top-level `action` block); otherwise set `path:` and optional `method` / `params`. Never set `auth:` on integration nodes. See `node-integration` and `resource-action`.

```swirls
node post_slack {
  type: integration
  connection: slack_workspace
  action: slack_post_message
  params: @ts {
    return { channel: "C123", text: "done" }
  }
}
```

**HTTP nodes** via `connection: <name>`. The token is injected into the request at execution time. A node sets **either** `auth` **or** `connection`, never both. Same Fabric binding store as integration nodes.

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
- `Connection "<n>" provider "<p>" must be a valid integration provider key (letters, digits, underscore, hyphen) or one of: slack, linear, discord, linkedin, microsoft` — the provider value has an invalid shape (error severity).
- `Connection "<n>" uses provider "<p>" which is not in the Swirls integration catalog. Deploy will fail until this provider is supported — use the Connections page to request it.` — valid key shape but unsupported provider. This is a **warning**, so `swirls doctor` stays green and deploy is where it fails.
- Parser: `connection provider must be a name` / `Unknown connection property "<key>"` / `Expected connection name`.
- `HTTP node references undefined connection "<n>"` — a node's `connection:` value is not a declared connection block.
- `"connection" is only valid on http and integration nodes` — `connection:` appears on an unsupported node type.
- `Node "<n>": set "auth" or "connection", not both. Use "auth" for your own credentials, "connection" for a Swirls-brokered grant.` — a node set both fields.
- `Channel "<n>" references unknown connection "<c>"` — a channel's `connection:` value is not a declared connection block.
- `Channel "<n>" connection "<c>" provider "<p>" must match platform "<pl>"` — the connection provider differs from the channel platform.

Token exchange and header injection are platform concerns; the DSL validates references and the provider value.
