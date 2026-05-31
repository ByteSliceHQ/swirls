---
title: Webhook Declarations
impact: HIGH
tags: resource, webhook, http, endpoint, external, secret, header, authentication
---

## Webhook Declarations

Webhooks create HTTP endpoints for receiving external payloads. They accept any HTTP POST and deliver the body to the connected workflow.

Use `secret:` + `header:` to require shared-secret verification on every inbound request. Both fields must be set together (or neither). The validator warns when both are missing because the endpoint will accept any POST without verification.

```swirls
secret stripe_creds {
  vars: [STRIPE_WEBHOOK_SECRET]
}

webhook stripe_events {
  label: "Stripe Events"
  description: "Stripe sends payment lifecycle events here."
  enabled: true

  schema: @json {
    {
      "type": "object",
      "properties": {
        "id":   { "type": "string" },
        "type": { "type": "string" },
        "data": { "type": "object" }
      },
      "additionalProperties": true
    }
  }

  secret: stripe_creds.STRIPE_WEBHOOK_SECRET
  header: "Stripe-Signature"
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | recommended | String | Display name in the Portal. |
| `description` | no | String | Longer description. |
| `enabled` | no | Boolean | Default: enabled. |
| `schema` | no | `@json` block, object literal, or bare schema name | Shape of the webhook body. Drives `context.nodes.root.input` typing. |
| `secret` | paired with `header` | `<secretBlockName>.<VAR>` | Bare dotted reference to a top-level `secret` block var. The runtime compares the incoming header value against this secret. |
| `header` | paired with `secret` | Quoted string | Inbound HTTP header that carries the shared-secret value. Custom names only — reserved headers are rejected. |

### `secret:` syntax

`secret:` uses dot notation between the secret block name and the variable name. **No quotes.** No object literal.

```swirls
secret: stripe_creds.STRIPE_WEBHOOK_SECRET
```

The validator errors:

- `Webhook "<name>" references undefined secret block "<block>"` if the secret block does not exist.
- `Webhook "<name>" references var "<VAR>" not declared in secret block "<block>"` if `VAR` is not in that block's `vars:` list.

### `header:` syntax

`header:` is a quoted string naming the inbound HTTP header that carries the secret value.

```swirls
header: "X-Webhook-Signature"
```

Reserved headers are rejected at validation time. The hard-deny list (case-insensitive) covers RFC 7230 hop-by-hop headers, security/protocol headers, ingress-managed headers, and headers clients set automatically:

```
connection, keep-alive, proxy-authenticate, proxy-authorization, te,
trailers, transfer-encoding, upgrade, cookie, set-cookie, host,
content-length, x-forwarded-for, x-forwarded-proto, x-forwarded-host,
x-forwarded-port, x-real-ip, x-request-id, user-agent, accept,
content-type, origin, referer, from
```

Use a custom name like `X-Stripe-Signature`, `X-Webhook-Signature`, `X-Hub-Signature-256`, etc.

### Both required, or neither

| `secret:` | `header:` | Result |
|-----------|-----------|--------|
| set | set | Verified webhook (correct). |
| set | missing | Validator error: `Webhook "<n>" has "secret" but is missing "header".` |
| missing | set | Validator error: `Webhook "<n>" has "header" but is missing "secret".` |
| missing | missing | Validator warning: `Webhook "<n>" has no "secret" or "header" set and will accept any POST without verification.` |

The "neither" path is a warning, not an error, so explicitly unauthenticated webhooks remain possible — but the validator surfaces them so you can audit the choice.

### Name pattern

Webhook names must match `^[a-zA-Z0-9_]+$` (letters, digits, underscores; can start with a digit). Hyphens, dots, and spaces are not allowed.

### Schema reference (bare identifier)

```swirls
schema event_payload {
  label: "Event payload"
  schema: @json {
    { "type": "object", "properties": { "type": { "type": "string" } } }
  }
}

webhook inbound {
  label: "Inbound"
  schema: event_payload
}
```

See `resource-schema`.

### Binding

A webhook on its own does not execute a workflow. Declare a trigger:

```swirls
trigger on_inbound {
  webhook:inbound -> handle_event
  enabled: true
}
```
