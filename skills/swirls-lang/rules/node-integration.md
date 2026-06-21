---
title: Integration Nodes
impact: HIGH
tags: node, integration, connection, action, oauth, fabric, proxy
---

## Integration Nodes

Integration nodes call third-party APIs through a project **connection** slot using the Fabric token broker and provider proxy. Bind the slot in Cloud **Connections** (Fabric OAuth). `http` nodes with `connection:` use the same binding store and macaroon path.

**Required fields:** `connection`, and either `action:` (preferred) or `path`

**Incorrect (using fetch in a code node):**

```swirls
node post_slack {
  type: code
  code: @ts {
    const res = await fetch("https://slack.com/api/chat.postMessage", { method: "POST" })
    return await res.json()
  }
}
```

**Incorrect (`auth:` on integration — connection only):**

```swirls
node post_slack {
  type: integration
  auth: my_auth
  path: "/chat.postMessage"
}
```

**Correct (typed action block — preferred):**

```swirls
connection team_slack {
  label: "Team Slack"
  provider: slack
}

action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  input: @json { { "type": "object", "required": ["channel", "text"], "properties": { "channel": { "type": "string" }, "text": { "type": "string" } } } }
  output: @json { { "type": "object", "required": ["ok"], "properties": { "ok": { "type": "boolean" } } } }
}

workflow notify {
  label: "Notify"
  root {
    type: code
    label: "Entry"
    code: @ts { return context.nodes.root.input }
  }
  node post_slack {
    type: integration
    label: "Post to Slack"
    connection: team_slack
    action: slack_post_message
    params: @ts {
      return {
        channel: context.nodes.root.output.channel,
        text: context.nodes.root.output.text,
      }
    }
  }
  flow {
    root -> post_slack
  }
}
```

Install prebuilt actions with `swirls add slack` (writes to `swirls/integrations/` and records `swirls.lock.json`). See `resource-action`.

**Correct (raw path — untyped legacy):**

```swirls
node post_slack {
  type: integration
  label: "Post to Slack"
  connection: team_slack
  method: POST
  path: /chat.postMessage
  params: @ts {
    return {
      channel: context.nodes.root.output.channel,
      text: context.nodes.root.output.text,
    }
  }
}
```

Bind the connection in Cloud **Connections** before running the workflow. The runtime verifies the execution macaroon, loads the Fabric project binding, issues a short-lived access token, and proxies the request via `@swirls/integrations/proxy`.

#### Fields

| Field | Required | Type |
|-------|----------|------|
| `connection` | yes | Bare identifier naming a top-level `connection` block |
| `action` | preferred | Bare identifier naming a top-level `action` block; do not set `method`/`path` on the node |
| `path` | legacy | Provider API path when `action:` is omitted (untyped `params`/output) |
| `method` | no | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` (default: `GET`; only when using raw `path:`) |
| `params` | no | `@ts` block returning a JSON object (request body for POST/PUT/PATCH; query params for GET) |
| `schema` | no | `@json` block to type the proxy response (raw `path:` only; action blocks supply output schema) |

#### vs `http` + `connection:`

| | `type: integration` | `type: http` + `connection:` |
|--|---------------------|------------------------------|
| Backend | Fabric token + provider proxy | Fabric token broker |
| URL | Derived from provider + `path` (or action block) | You set full `url` |
| Auth | `connection:` only | `connection:` or `auth:` |
| Runtime | Requires `FABRIC_URL` on executor | Requires `FABRIC_URL` |

Both node styles share the same Fabric binding store. Prefer `integration` + `action:` for typed provider operations; use `http` + `connection:` when you need full URL control.
