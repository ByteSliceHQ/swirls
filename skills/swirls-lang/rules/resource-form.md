---
title: Form Declarations
impact: HIGH
tags: resource, form, schema, label, ui, api, visibility, public, internal
---

## Form Declarations

Forms generate a UI in the Portal and an API endpoint. The schema defines the form fields. The `visibility` field controls whether the form is reachable through the Triggers service, and an optional `auth` field gates public forms behind HTTP Basic credentials.

```swirls
form contact_form {
  label: "Contact Form"
  description: "Public contact form: name, email, and message."
  enabled: true
  visibility: public
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
| `visibility` | no | bare identifier value | `public` or `internal` (unquoted). Default: `internal`. |
| `auth` | no | bare identifier | Names a top-level `auth` block with `type: basic`. Triggers enforces HTTP Basic on the public form. |
| `schema` | no | `@json` block, object literal, or bare schema name | JSON Schema for the form payload. The LSP types `context.nodes.root.input` from this schema when a trigger references the form. |

### `visibility` field

`visibility:` is a key:value field whose value is a **bare identifier** — one of two values:

- **`visibility: public`** — The form is served by Triggers at `/triggers/forms/:projectId/:formName`. External users can fetch the schema and submit payloads.
- **`visibility: internal`** (default) — Triggers refuses to render or accept submissions and returns 404 with the same body as form-not-found (no existence leak). The web/cloud dashboard can still read and edit the form. The trigger binding still fires when the dashboard submits.

The default is `internal` (secure default). Specify `visibility: public` only on forms intended for external traffic.

**Incorrect (quoted string):**

```swirls
form contact {
  label: "Contact"
  visibility: "public"
}
```

The parser errors: `Expected \`public\` or \`internal\` after \`visibility:\``. Any value other than the two identifiers errors: `Invalid visibility "<x>"; expected \`public\` or \`internal\``.

**Incorrect (missing colon):**

```swirls
form contact {
  label: "Contact"
  visibility public
}
```

The parser errors: `Expected \`:\` after \`visibility\``.

**Correct:**

```swirls
form contact {
  label: "Contact"
  visibility: public
}
```

### `auth` field (HTTP Basic gate)

`auth: <name>` references a top-level `auth` block by bare identifier. The referenced block must have `type: basic` and supply `username` / `password` vars from a secret block. The Triggers form GET and POST handlers then require an `Authorization: Basic` header whose decoded `user:pass` matches the decrypted secret values (401 with `WWW-Authenticate: Basic realm="<label>"` on miss).

```swirls
secret portal_creds {
  vars: [PORTAL_USER, PORTAL_PASS]
}

auth portal {
  type: basic
  secrets: portal_creds
  username: PORTAL_USER
  password: PORTAL_PASS
}

form gated {
  label: "Gated form"
  visibility: public
  auth: portal
}
```

Validator diagnostics:

- `Form "<n>" references undefined auth block "<a>"` — the name does not match a declared `auth` block.
- `Form "<n>" auth block "<a>" must have type \`basic\` (found \`<type>\`)` — only `type: basic` auth blocks can gate forms.

Visibility is enforced before auth, so `auth:` on an internal form is dead config (the form 404s before any auth check runs).

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

You can declare a top-level `schema <name> { }` block once and reference it from the form by bare identifier. The same name can also be used as `inputSchema:` on the workflow root the trigger fires.

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

### Binding a form to a workflow

Forms don't execute on their own. Declare a `trigger` to send submissions to a workflow:

```swirls
trigger on_contact {
  form:contact_form -> process_contact
  enabled: true
}
```

See `resource-trigger-binding`.
