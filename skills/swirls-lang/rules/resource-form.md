---
title: Form Declarations
impact: HIGH
tags: resource, form, schema, label, ui, api, visibility, public, internal
---

## Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields. The `visibility` keyword controls whether the form is reachable through the Triggers service.

```swirls
form contact_form {
  label: "Contact Form"
  description: "Public contact form: name, email, and message."
  enabled: true
  visibility public
  schema: @json {
    {
      "type": "object",
      "required": ["name", "email", "message"],
      "properties": {
        "name":    { "type": "string", "title": "Name" },
        "email":   { "type": "string", "title": "Email" },
        "message": { "type": "string", "title": "Message" }
      },
      "additionalProperties": false
    }
  }
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | recommended | String | Display name in the Portal. Defaults to empty when omitted. |
| `description` | no | String | Longer description. |
| `enabled` | no | Boolean | Default: enabled. Set to `false` to keep the declaration but pause submissions. |
| `visibility` | no | bare keyword (no colon) | `public` or `internal`. Default: `internal`. |
| `schema` | no | `@json` block, object literal, or bare schema name | JSON Schema for the form payload. The LSP types `context.nodes.root.input` from this schema when a trigger references the form. |

### `visibility` keyword

`visibility` is a bare keyword (no colon) with one of two values:

- **`visibility public`** — The form is served by Triggers at `/triggers/forms/:projectId/:formName`. External users can fetch the schema and submit payloads.
- **`visibility internal`** (default) — Triggers refuses to render or accept submissions and returns 404 with the same body as form-not-found (no existence leak). The web/cloud dashboard can still read and edit the form. The trigger binding still fires when the dashboard submits.

The default is `internal` (secure default). Specify `visibility public` only on forms intended for external traffic.

**Incorrect (colon and quoted string):**

```swirls
form contact {
  label: "Contact"
  visibility: "public"
}
```

The parser errors: `Expected \`public\` or \`internal\` after \`visibility\``.

**Correct:**

```swirls
form contact {
  label: "Contact"
  visibility public
}
```

### Name pattern

Form names must match `^[a-zA-Z0-9_]+$`. Hyphens, dots, and spaces are not allowed. Names can start with a digit.

```swirls
form contact-form { ... }  // ERROR: hyphen
form contact_form { ... }  // OK
form 2024_signup  { ... }  // OK
```

The validator errors: `Form name: Name must contain only letters, numbers, and underscores`.

### Schema tips

- Use `"title"` on each property to set the Portal form field label.
- Use `"additionalProperties": false` on forms unless you want to accept arbitrary extra fields.
- The same JSON Schema also validates incoming API submissions.
- If you omit `schema:`, the form still works but inputs are untyped and the LSP cannot help.

### Schema reference (bare identifier)

You can declare a top-level `schema <name> { }` block once and reference it from the form by bare identifier. The same name can also be used as `inputSchema:` on the graph root the trigger fires.

```swirls
schema contact_payload {
  label: "Contact payload"
  schema: @json {
    { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } }
  }
}

form contact {
  label: "Contact"
  schema: contact_payload
}
```

See `resource-schema`.

### Binding a form to a graph

Forms don't execute on their own. Declare a `trigger` to send submissions to a graph:

```swirls
trigger on_contact {
  form:contact_form -> process_contact
  enabled: true
}
```

See `resource-trigger-binding`.
