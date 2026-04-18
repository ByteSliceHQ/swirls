---
title: Resend (Email) Nodes
impact: HIGH
tags: node, email, resend, from, to, subject
---

## Resend (Email) Nodes

Email nodes send email via Resend. The type name is `resend`, not `email`. Every resend node requires `from`, `to`, and `subject`.

**Required fields:** `from`, `to`, `subject`.

**Vendor-managed output:** Do not set `schema:` on a resend node. The validator errors: `"resend" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

### Incorrect (wrong type name)

```swirls
node notify {
  type: email
  label: "Notify"
  from: @ts { return "noreply@example.com" }
  to: @ts { return "team@example.com" }
  subject: @ts { return "Alert" }
}
```

`email` is not a valid node type. The validator errors: `Invalid node type "email". Must be one of: ai, bucket, code, document, firecrawl, graph, http, parallel, postgres, resend, stream, switch, wait`.

### Correct (complete resend node)

```swirls
node notify {
  type: resend
  label: "Send notification"
  from: @ts { return "noreply@example.com" }
  to: @ts { return context.nodes.root.output.email }
  subject: @ts { return "We received your message" }
  text: @ts {
    const summary = context.nodes.summarize.output.text ?? ""
    return "Thanks for reaching out. Summary: " + summary
  }
}
```

### Correct (HTML body)

```swirls
node welcome {
  type: resend
  label: "Send HTML email"
  from: @ts { return "noreply@example.com" }
  to: @ts { return context.nodes.root.output.email }
  subject: @ts { return "Welcome" }
  html: @ts {
    const name = context.nodes.root.output.name
    return "<h1>Welcome, " + name + "!</h1><p>Thanks for signing up.</p>"
  }
}
```

### Fields

| Field | Required | Type |
|-------|----------|------|
| `from` | yes | `@ts` block or string |
| `to` | yes | `@ts` block or string |
| `subject` | yes | `@ts` block or string |
| `text` | no | `@ts` block or string |
| `html` | no | `@ts` block or string |
| `replyTo` | no | `@ts` block or string |
| `schema` | **not allowed** | Vendor-managed; omit entirely. |

### API key

`RESEND_API_KEY` is resolved by the runtime; do not declare it in a `secrets:` map.
