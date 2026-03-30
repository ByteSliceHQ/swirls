---
title: Email Nodes
impact: HIGH
tags: node, email, from, to, subject, resend
---

## Email Nodes

Email nodes send email via Resend. Every email node requires `from`, `to`, and `subject`.

**Required fields:** `from`, `to`, `subject`

**Incorrect (missing from field):**

```swirls
node notify {
  type: email
  label: "Notify"
  to: @ts { return "team@example.com" }
  subject: @ts { return "Alert" }
  text: @ts { return "Something happened" }
}
```

Error: "Node type 'email' requires 'from'"

**Correct (complete email node):**

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

**Correct (with HTML body):**

```swirls
node notify {
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

Email node fields:
| Field | Required | Type |
|-------|----------|------|
| `from` | yes | `@ts` block or string |
| `to` | yes | `@ts` block or string |
| `subject` | yes | `@ts` block or string |
| `text` | no | `@ts` block or string |
| `html` | no | `@ts` block or string |
| `replyTo` | no | `@ts` block or string |

Email nodes infer `RESEND_API_KEY` as a secret. You do not need to declare it.
