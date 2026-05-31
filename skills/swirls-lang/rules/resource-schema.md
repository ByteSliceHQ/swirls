---
title: Top-Level `schema` Blocks
impact: HIGH
tags: resource, schema, top-level, reusable, json-schema, named, reference, identifier
---

## Top-Level `schema` Blocks

A top-level `schema <name> { }` block declares a reusable JSON Schema that can be referenced by bare identifier from forms, webhooks, root `inputSchema`/`outputSchema`, and node `schema` (or `outputSchema` on root). Same shape, declared once.

### Syntax

```swirls
schema <name> {
  label: "<optional label>"
  description: "<optional>"

  schema: @json {
    { ... JSON Schema ... }
  }
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | recommended | String | Display name. |
| `description` | no | String | Longer description. |
| `schema` | yes | `@json { }` block, or object literal, or bare name | The JSON Schema body. Bare-name form (`schema: other_name`) chains another schema block. |

### Example: declare once, reference everywhere

```swirls
schema contact_payload {
  label: "Contact payload"
  description: "Shared JSON Schema for the contact form and process_form workflow"
  schema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":  { "type": "string" },
        "email": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
}

form contact {
  label: "Contact"
  schema: contact_payload
}

workflow handle_contact {
  label: "Handle contact"

  root {
    type: code
    label: "Entry"
    inputSchema: contact_payload
    outputSchema: contact_payload
    code: @ts {
      const { name, email } = context.nodes.root.input
      return { name: name.trim(), email: email.trim().toLowerCase() }
    }
  }

  node summarize {
    type: code
    label: "Summarize"
    schema: contact_payload
    code: @ts { return context.nodes.root.output }
  }

  flow { root -> summarize }
}

trigger on_contact {
  form:contact -> handle_contact
  enabled: true
}
```

### Where bare schema names work

Any of these fields accept a bare schema identifier (no quotes, no `@json`):

- Form / webhook `schema:` — `schema: contact_payload`
- Root `inputSchema:` — `inputSchema: contact_payload`
- Root `outputSchema:` — `outputSchema: contact_payload`
- Non-root node `schema:` — `schema: contact_payload`
- Review block `schema:` — `review: { schema: contact_payload, ... }`
- Top-level `schema` block `schema:` (chaining) — `schema: contact_payload`

Inline `@json { }` and inline object literals still work. Use the bare name to avoid duplicating the same schema across multiple sites.

### Name pattern

Schema names must match `^[a-zA-Z0-9_]+$`. Hyphens, dots, and spaces are not allowed.

### Workspace resolution

Schema names resolve across all `.swirls` files in the workspace, the same way workflows and streams do. `swirls doctor` and deploy bundle the union of all schema declarations under the scanned working directory. The LSP single-file open may report a missing schema until the workspace is considered.

### Validation rules

- The validator runs `validateSchemaFieldRefs` over the AST. Each bare-identifier reference (`inputSchema: <name>`, `outputSchema: <name>`, `schema: <name>` on form/webhook/node, `review: { schema: <name> }`) must resolve to a top-level `schema` block in the workspace.
- Duplicate `schema` block names in one file are errors.
- A `schema` block whose body is an empty object literal is allowed but unhelpful — fill in `type`/`properties`/etc.
