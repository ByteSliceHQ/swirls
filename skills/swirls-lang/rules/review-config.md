---
title: Review Block Configuration
impact: MEDIUM
tags: review, human, approval, schema, actions, hitl
---

## Review Block Configuration

Review blocks pause graph execution at a node and wait for human input. The reviewer sees the node's output and fills in a form defined by the review schema, then picks an action with an outcome of `approve` or `reject`.

Any node type can have a review block. Execution pauses after the node runs and before downstream nodes execute.

### Shorthand form

```swirls
node gate {
  type: code
  label: "Gate"
  code: @ts { return context.nodes.root.output }
  review: true
}
```

`review: true` is sugar for `review: { enabled: true }`.

### Full form

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts { return { title: context.nodes.root.output.title } }
  review: {
    enabled: true
    title: "Review draft"
    description: "Approve, request changes, or reject"
    content: "Please review the generated draft and choose an action."
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
    actions: [
      { id: "approve", label: "Approve", outcome: "approve" },
      { id: "reject",  label: "Reject",  outcome: "reject" }
    ]
    approvedOutput: "approved"
    rejectedOutput: "rejected"
  }
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `enabled` | implicit `true` when review is present | Boolean | Defaults to `true` if omitted. |
| `title` | no | String | Displayed above the review form. |
| `description` | no | String | Shown under the title. |
| `content` | no | String | Rich text body for the reviewer. |
| `schema` | no | `@json` block | JSON Schema for the form the reviewer fills out. Can be `null`. |
| `actions` | no | Array of action objects | Buttons shown to the reviewer. |
| `approvedOutput` | no | String | Optional static output passed downstream when the action outcome is `approve`. |
| `rejectedOutput` | no | String | Optional static output passed downstream when the action outcome is `reject`. |

### Action object shape

| Key | Required | Type | Pattern |
|-----|----------|------|---------|
| `id` | yes | String | `^[a-zA-Z0-9_]+$` |
| `label` | yes | String | Non-empty display label. |
| `outcome` | yes | String | Exactly `"approve"` or `"reject"`. |

Invalid action objects cause the validator to emit: `review: <path> — <message>`.

### Accessing review data downstream

Review results are available in downstream nodes via `context.reviews.<node_name>`. See `review-access-downstream` and `context-reviews`.
