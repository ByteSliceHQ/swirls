---
title: Action Block Declaration
impact: MEDIUM
tags: resource, action, top-level, integration, registry, slack
---

## Action Block Declaration

Top-level `action <name> { }` blocks declare a typed integration operation: provider, HTTP transport, and optional input/output JSON schemas. Integration nodes reference an action by bare identifier and inherit transport + typing from the block at deploy time.

Use `swirls add <provider> [items...]` to pull prebuilt action blocks from the registry into `swirls/integrations/<provider>/`. Installed actions are tracked in `swirls.lock.json` (source, version, sha256).

### Syntax

```swirls
action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  description: "Post a message to a channel"
  scopes: ["chat:write"]
  input: @json { { "type": "object", "required": ["channel", "text"], "properties": { ... } } }
  output: @json { { "type": "object", "required": ["ok"], "properties": { ... } } }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `provider` | yes | Must match a Fabric provider (`slack`, `linear`, …) and the bound connection's `provider`. |
| `method` | yes | `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. |
| `path` | yes | Provider API path (leading `/` optional). |
| `encoding` | no | `json` (default), `form`, or `query`. |
| `input` / `output` | no | Inline `@json`, object literal, or bare `schema` name. |
| `scopes` | no | OAuth scopes required by the action. |
| `label`, `description` | no | Display metadata. |

### Integration node reference

```swirls
connection team_slack { provider: slack }

node post_slack {
  type: integration
  connection: team_slack
  action: slack_post_message
  params: @ts { return { channel: "C1", text: "hi" } }
}
```

When `action:` is set, do **not** set `method` or `path` on the node — deploy inlines transport from the action block. Prefer `action:` over raw `path:` for typed `params` and output.

### Registry

- In-repo seed: `registry/index.json` + provider action files.
- CLI: `swirls add slack` (all items) or `swirls add slack post_message`.
- Override registry URL: `--registry` or `SWIRLS_REGISTRY_URL`.

See `node-integration` and `resource-connection`.
