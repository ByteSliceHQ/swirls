---
title: Accessing Review Data Downstream
impact: MEDIUM
tags: review, context, downstream, routing, switch
---

## Accessing Review Data Downstream

Review responses are available in downstream nodes via `context.reviews.<nodeName>`. A common pattern is to route execution based on the review response using a switch node.

Remember the gate model: a review-enabled node never runs its own work, and its `output` is the reviewer's submitted form data. Do not read `context.nodes.<gateNode>.output` expecting the node's own code result. Routing on a form field (like `approved: false` below) requires the reviewer to submit with an `approve`-outcome action; a `reject` outcome fails the run and nothing downstream executes.

**Correct (route based on review approval):**

```swirls
node draft {
  type: code
  label: "Draft"
  code: @ts {
    return { text: "Draft content here" }
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

node route {
  type: switch
  label: "Route"
  cases: ["publish", "revise"]
  router: @ts {
    const approved = context.reviews.draft?.approved
    return approved ? "publish" : "revise"
  }
}

node publish {
  type: code
  label: "Publish"
  code: @ts {
    return { published: true, text: context.nodes.root.output.text }
  }
}

node revise {
  type: code
  label: "Revise"
  code: @ts {
    const feedback = context.reviews.draft?.feedback ?? "No feedback"
    return { published: false, feedback }
  }
}

flow {
  root -> draft
  draft -> route
  route -["publish"]-> publish
  route -["revise"]-> revise
}
```

The review schema determines the shape of `context.reviews.<nodeName>`. The LSP provides autocomplete based on the review schema fields.
