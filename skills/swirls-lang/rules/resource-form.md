---
title: Form Declarations
impact: HIGH
tags: resource, form, schema, label, ui, api
---

## Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields.

**Correct (form with schema):**

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
        "name": { "type": "string", "title": "Name" },
        "email": { "type": "string", "title": "Email" },
        "message": { "type": "string", "title": "Message" }
      },
      "additionalProperties": false
    }
  }
}
```

Form fields:
| Field | Required | Type |
|-------|----------|------|
| `label` | yes | String |
| `description` | no | String |
| `enabled` | no | Boolean (default: true) |
| `schema` | no | `@json` block |

The `title` property in schema fields is used as the form field label in the Portal UI.

Form names must match `[a-zA-Z_][a-zA-Z0-9_]*` (letters, digits, underscores, starting with a letter or underscore).
