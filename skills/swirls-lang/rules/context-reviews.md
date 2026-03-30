---
title: context.reviews - Accessing Review Responses
impact: MEDIUM
tags: context, reviews, human, approval, feedback
---

## context.reviews - Accessing Review Responses

When a node has a `review` block with a `schema`, downstream nodes can access the reviewer's response via `context.reviews.<nodeName>`.

**Correct (accessing review data):**

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
    schema: @json {
      {
        "type": "object",
        "required": ["approved"],
        "properties": {
          "approved": { "type": "boolean" },
          "feedback": { "type": "string" }
        }
      }
    }
  }
}

node publish {
  type: code
  label: "Publish"
  code: @ts {
    const { approved, feedback } = context.reviews.draft
    if (!approved) {
      return { published: false, message: "Rejected: " + (feedback ?? "none") }
    }
    return { published: true, message: "Published" }
  }
}

flow {
  root -> draft
  draft -> publish
}
```

The review response shape is determined by the `schema` in the review block. The LSP provides autocomplete for review fields based on this schema.

A node can also access its own review via `context.reviews.<itsOwnName>`.
