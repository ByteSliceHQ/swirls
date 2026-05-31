---
title: Email Nodes
impact: HIGH
tags: node, email, resend, from, to, subject
---

## Email Nodes

Email nodes send transactional email. The DSL type name is `email`. Resend is the underlying vendor (`RESEND_API_KEY`). Every email node requires `from`, `to`, and `subject`.

**Required fields:** `from`, `to`, `subject`.

**Vendor-managed output:** Do not set `schema:` on an email node. The validator errors: `"email" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`

### Incorrect (wrong type name)

```swirls
node notify {
  type: resend
  label: "Notify"
  from: @ts { return "noreply@example.com" }
  to: @ts { return "team@example.com" }
  subject: @ts { return "Alert" }
}
```

`resend` is not a valid node type. Resend is the underlying vendor; the DSL type name is `email`. The validator errors: `Invalid node type "resend". Must be one of: ai, agent, bucket, code, disk, email, workflow, http, map, parallel, postgres, scrape, stream, switch, wait, while`.

### Correct (complete email node)

```swirls
node notify {
  type: email
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
  type: email
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
