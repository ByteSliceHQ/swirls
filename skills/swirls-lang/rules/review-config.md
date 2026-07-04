---
title: Review Block Configuration
impact: MEDIUM
tags: review, human, approval, schema, actions, hitl
---

## Review Block Configuration

Review blocks turn a node into a human gate. A review-enabled node does not run its own work (its `code:`, `prompt:`, or other type config is never executed): the run pauses at the node, the reviewer fills in the form defined by the review schema and picks an action, and on an `approve` outcome the reviewer's submitted form data becomes the node's output. A `reject` outcome fails the run. A pending review times out (default 7 days) and fails the run.

Any node type can carry a review block, but since the node's own work never runs, prefer a `code` node whose declared output shape matches the review schema so downstream nodes consume the form data.

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
| `approvedOutput` | no | String | Parses, but the engine does not consume it. Do not rely on it. |
| `rejectedOutput` | no | String | Parses, but the engine does not consume it. Do not rely on it. |

### Action object shape

| Key | Required | Type | Pattern |
|-----|----------|------|---------|
| `id` | yes | String | `^[a-zA-Z0-9_]+$` |
| `label` | yes | String | Non-empty display label. |
| `outcome` | yes | String | Exactly `"approve"` or `"reject"`. |

Invalid action objects cause the validator to emit: `review: <path> — <message>`.

### Accessing review data downstream

Review results are available in downstream nodes via `context.reviews.<node_name>`. See `review-access-downstream` and `context-reviews`.
