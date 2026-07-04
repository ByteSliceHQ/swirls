---
title: App Block Declaration
impact: HIGH
tags: resource, app, top-level, expose, brand, generated-ui, dashboard, authority-boundary
---

## App Block Declaration

Top-level `app "<name>" { }` blocks declare a generated application surface over a deployment: which primitives it exposes, to whom, and with what intent. Swirls composes the actual layout at deploy time from the exposed primitives and the app's `description`. The block itself never describes pages, components, or styling beyond a small `brand { }` hint.

**The name is a quoted string, not a bare identifier.** This is the only top-level block where that's true. Hyphens are allowed: `app "client-portal"` is valid, unlike every other block name in the DSL.

**Every field inside `app` is space-separated, never `key: value`.** `description`, `brand`'s `accent`/`logo`, each `expose` member, and the `access` modifier on a database expose entry all bind their value directly with a space. Writing a colon anywhere inside an `app` block is a parser error.

### Syntax

```swirls
app "<name>" {
  description "<generation prompt, a quoted string>"   // required

  expose {                                              // required; non-empty
    agent    <agentName>
    workflow <workflowName>
    view     <viewName>
    database <databaseName> { access read }              // access is optional, defaults to read
  }

  brand {                                               // optional
    accent "<hex color, quoted string>"
    logo   "<url, quoted string>"
  }
}
```

### Required vs optional fields

Block-level:

| Field | Required | Notes |
|-------|----------|-------|
| `description` | yes | Quoted string, space-separated (no colon). The generation prompt: tells Claude what the app is for and who uses it. |
| `expose` | yes | Non-empty `expose { }` block. The authority boundary: anything not listed is invisible to the app. |
| `brand` | no | Optional `brand { }` block of presentation hints. |

Per `expose { }` member:

| Kind | Value | Modifiers |
|------|-------|-----------|
| `agent` | name of a top-level `agent` block | none |
| `workflow` | name of a top-level `workflow` block | none |
| `view` | name of a top-level `view` block | none |
| `database` | name of a top-level `database` block | optional `{ access read }`; `read` is the only accepted value in Phase 0 and is the default when the modifier block is omitted |

There are exactly four expose kinds. No other primitive (`stream`, `disk`, `postgres`, `channel`, `connection`, `secret`, etc.) can appear inside `expose { }`.

Per `brand { }` field (both optional, both quoted strings, both space-separated):

| Field | Notes |
|-------|-------|
| `accent` | Hex color or CSS color string. |
| `logo` | URL to a logo image. |

### Reserved fields

`domain` and `audience` parse at the top level of an `app` block but are rejected by the validator:

```
`domain` is reserved for hosted apps (RFC 0016) and not yet supported
`audience` is reserved for hosted apps (RFC 0016) and not yet supported
```

They exist in the grammar so files written against later RFCs (hosting, custom domains) fail loudly with a clear diagnostic instead of a generic parse error. There is no date attached to when they activate. Do not use them.

### The `access` modifier is not the removed `access` primitive

A `database` expose entry can carry `{ access read }`. This is a field scoped to that single entry inside `app`, unrelated to the top-level `access { }` primitive that was removed from the DSL entirely (see `resource-access-control`). The two share a name and nothing else: one was a removed block-level authorization primitive, the other is a per-entry attenuation on what an app can do with an exposed database.

### Complete example

```swirls
agent triage {
  label: "Triage"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

workflow refund_request {
  label: "Refund"
  root {
    type: code
    code: @ts { return { ok: true } }
  }
}

stream ticket_rows {
  label: "Ticket rows"
  workflow: refund_request
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return context.output }
    }
  }
}

view open_tickets {
  label: "Open tickets"
  streams: [ticket_rows]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}

database tickets {
  schema: @prisma {
    model Ticket {
      id String @id
    }
  }
}

app "client-portal" {
  description "Support portal for Acme's customers: chat with the
    triage agent, see open tickets, kick off a refund."

  expose {
    agent    triage
    workflow refund_request
    view     open_tickets
    database tickets { access read }
  }

  brand {
    accent "#B33A2B"
    logo   "https://example.com/logo.png"
  }
}
```

### Cross-reference validation

Each `expose` member is checked against the merged project at compile time, the same way `view` stream references are: a name that doesn't resolve to a declared `agent`/`workflow`/`view`/`database` (in the same file or elsewhere in the workspace) is an error, not a warning.

### Validation diagnostics

- `App requires a name`: the app's name is empty.
- `Duplicate app name "<n>"`: two `app` blocks share a name.
- `App "<n>" requires a "description" (the generation prompt)`: `description` is missing or blank.
- `App "<n>" requires "expose" with at least one member (agent, workflow, view, or database)`: `expose { }` is empty or absent.
- `App "<n>" exposes <kind> "<m>" more than once`: the same `kind:name` pair appears twice in `expose { }`.
- `App "<n>" exposes <kind> "<m>" which is not defined`: the referenced agent/workflow/view/database doesn't exist anywhere in the workspace.
- `` `domain` is reserved for hosted apps (RFC 0016) and not yet supported `` / `` `audience` is reserved for hosted apps (RFC 0016) and not yet supported ``: either reserved field was set.

Parser-level (all indicate a colon, missing brace, or unknown key rather than a semantic problem):

- `Expected app name as a quoted string`: the token after `app` isn't a quoted string.
- `Expected {`: missing opening brace after the app name.
- `Expected { after expose`: `expose` wasn't followed by `{`.
- `Expected expose member (agent, workflow, view, or database)`: a token inside `expose { }` isn't one of the four kinds.
- `Unknown expose member "<k>" — only agent, workflow, view, and database`: an expose kind outside the four valid ones.
- `Expected a name after <kind>`: an expose member has no name following it.
- `Expected { after database expose entry`: a `database` entry's `{ access read }` block is malformed.
- `` Expected `read` after `access` ``: the `access` modifier's value isn't `read`.
- `Unknown database expose modifier "<k>" — only access read`: anything other than `access` inside a database entry's modifier block.
- `Expected { after brand`: `brand` wasn't followed by `{`.
- `brand accent must be a quoted string` / `brand logo must be a quoted string`: a non-string value for either field.
- `Unknown brand property "<k>" — only accent and logo`: a field other than `accent`/`logo` inside `brand { }`.
- `app description must be a quoted string`: `description`'s value isn't a quoted string. This is the common mistake of writing `description: "..."` with a colon, which is never consumed as the value.
- `Unknown app property "<k>"`: a top-level key inside `app` other than `description`, `expose`, `brand`, `domain`, or `audience`.

### App as a top-level keyword

The lexer treats `app` as a keyword. At the top level, `app "<name>" { }` declares an app block. There is no `app` node type and no `app:` config field. An app is never referenced from inside a workflow; it only reads from the primitives it exposes.
