---
title: MCP Block Declaration
impact: MEDIUM
tags: resource, mcp, agent, top-level, tools, remote, model-context-protocol
---

## MCP Block Declaration

Top-level `mcp <name> { }` blocks declare a **remote MCP server slot** an agent may draw tools from. The DSL declares the slot by name; a human binds it to a remote MCP server URL (and optional bearer token) on the project **MCP servers** page in Swirls Cloud. Agents reference a slot by name via `mcp:`. At the agent's first turn the host discovers the server's tools and exposes them to the model as `mcp__<slot>__<tool>`. **No URL or token lives in the file.**

**There is no `type:` field on an mcp block** — the keyword `mcp` identifies the block. Names must match `^[a-zA-Z0-9_]+$`.

### Syntax

```swirls
mcp <name> {
  label: "<optional label>"
  description: "<optional description>"
}
```

Both fields are optional quoted strings. There are no required fields. Unknown keys are rejected.

### Fields

| Field | Required | Notes |
|-------|----------|-------|
| `label` | no | Display string shown on the Cloud MCP servers page. |
| `description` | no | Description shown on the Cloud MCP servers page. |

### Referencing from an agent

An agent draws tools from one or more slots via `mcp: [ slotName, ... ]` — a bare-identifier array, same style as `tools:` and `skills:`. Each entry must name a declared `mcp` block in the workspace.

```swirls
mcp axiom_observability {
  label: "Axiom"
  description: "Query traces, logs, and metrics via MCP"
}

agent observer {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  mcp: [axiom_observability]
}
```

MCP tools are agent-only. Workflows cannot use MCP. There is no MCP node type and no MCP tool syntax inside a workflow.

### Profile narrowing

Profiles may narrow `mcp:` to a subset of the agent block's list (same rule as `tools:` and `skills:`):

```swirls
agent observer {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  mcp: [axiom_observability, product_analytics]

  profile readonly {
    mcp: [axiom_observability]
  }
}
```

Profile `mcp:` must be a **subset** of the agent's top-level `mcp:`.

### Bind in Cloud

Slots are bound per project, not in git.

1. Deploy carries the `mcp` block metadata only (name, label, description). It never carries a server URL or token.
2. On the project **MCP servers** page in Cloud, bind each slot to a remote MCP server URL plus an optional bearer token. Tokens are stored encrypted; the URL is validated against SSRF rules.
3. On the agent's first turn the host connects to each bound slot and discovers its tools.

### Tool naming at runtime

Discovered tools are exposed to the model as `mcp__<slot>__<tool>`. For a slot named `axiom_observability` with a server tool `queryDataset`, the agent sees `mcp__axiom_observability__queryDataset`.

A slot that is **unbound or unreachable yields no tools**. Instruct the agent's system prompt to tell the user to connect the slot on the Cloud MCP servers page when its tools are missing.

### No secrets in git

The server URL and bearer token are bound in Cloud, never written to a `.swirls` file. The `mcp` block is a named slot only. This is the same posture as `connection` blocks (see `resource-connection`).

### Validation diagnostics

- `MCP block name: <msg>` — name must match `^[a-zA-Z0-9_]+$`.
- `Duplicate mcp block name "<n>"` — two `mcp` blocks share a name (also across files in one project).
- `Agent "<n>" references undefined mcp block "<m>"` — an agent's `mcp:` entry is not a declared `mcp` block.
- `Profile "<p>" mcp "<m>" is not listed on agent "<a>" mcp:` — a profile's `mcp:` entry is not in the agent's list.
- Parser: `Expected mcp block name` / `Unknown mcp property "<key>"` / `Duplicate mcp property "<key>"` / `Expected } to close mcp block`.

Binding, discovery, and token exchange are platform concerns; the DSL validates the block shape and the agent references.

See `resource-agent` for the agent block's `mcp:` field.
