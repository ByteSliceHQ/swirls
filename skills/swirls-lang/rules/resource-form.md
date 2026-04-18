---
title: Form Declarations
impact: HIGH
tags: resource, form, schema, label, ui, api
---

## Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields.

```swirls
form contact_form {
  label: "Contact Form"
  description: "Public contact form: name, email, and message."
  enabled: true
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
| `label` | yes | String | Display name in the Portal. |
| `description` | no | String | Longer description. |
| `enabled` | no | Boolean | Default: enabled. Set to `false` to keep the declaration but pause submissions. |
| `schema` | no | `@json` block | JSON Schema for the form payload. The LSP types `context.nodes.root.input` from this schema when a trigger references the form. |

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

### Binding a form to a graph

Forms don't execute on their own. Declare a `trigger` to send submissions to a graph:

```swirls
trigger on_contact {
  form:contact_form -> process_contact
  enabled: true
}
```

See `resource-trigger-binding`.
