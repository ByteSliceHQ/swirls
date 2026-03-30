---
title: Review Block Configuration
impact: MEDIUM
tags: review, human, approval, schema, actions
---

## Review Block Configuration

Review blocks pause graph execution at a node and wait for human input. The reviewer sees the node's output and can fill in a form defined by the review schema.

**Correct (basic review with schema):**

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts {
    return { title: context.nodes.root.output.title }
  }
  review: {
    enabled: true
    title: "Review draft"
    description: "Approve or request changes"
    schema: @json {
      {
        "type": "object",
        "required": ["approved"],
        "properties": {
          "approved": { "type": "boolean", "title": "Approved" },
          "feedback": { "type": "string", "title": "Feedback" }
        },
        "additionalProperties": false
      }
    }
  }
}
```

**Correct (review with custom actions):**

```swirls
review: {
  enabled: true
  title: "Approve content"
  actions: [
    { id: "approve", label: "Approve", outcome: "approve" },
    { id: "reject", label: "Reject", outcome: "reject" }
  ]
}
```

Review block fields:
| Field | Required | Type |
|-------|----------|------|
| `enabled` | yes | Boolean |
| `title` | no | String |
| `description` | no | String |
| `content` | no | String |
| `schema` | no | `@json` block (defines review form) |
| `approvedOutput` | no | String |
| `rejectedOutput` | no | String |
| `actions` | no | Array of action objects |

Action object fields: `id` (string), `label` (string), `outcome` ("approve" or "reject")

Any node type can have a review block. The review pauses execution after the node runs but before downstream nodes execute.
