---
title: Webhook Declarations
impact: HIGH
tags: resource, webhook, http, endpoint, external
---

## Webhook Declarations

Webhooks create HTTP endpoints for receiving external payloads. They accept any HTTP POST and deliver the body to the connected graph.

**Correct (webhook with schema):**

```swirls
webhook inbound {
  label: "Inbound Webhook"
  enabled: true
  schema: @json {
    {
      "type": "object",
      "properties": {
        "event": { "type": "string" },
        "payload": { "type": "object" }
      },
      "additionalProperties": true
    }
  }
}
```

Webhook fields:
| Field | Required | Type |
|-------|----------|------|
| `label` | yes | String |
| `description` | no | String |
| `enabled` | no | Boolean (default: true) |
| `schema` | no | `@json` block |

Webhooks use the same name rules as forms: `[a-zA-Z_][a-zA-Z0-9_]*`.
