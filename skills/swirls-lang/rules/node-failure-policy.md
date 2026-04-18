---
title: Node Failure Policy
impact: MEDIUM
tags: node, failurePolicy, retry, fallback, skip, fail, durable
---

## Node Failure Policy

Any node can declare a `failurePolicy:` to control what the durable DAG engine does when that node's execution throws. Without a policy, the default is `fail` (the whole graph execution errors).

### Shape

```swirls
failurePolicy: {
  strategy: "fail" | "retry" | "skip" | "fallback"
  maxRetries: <number>        // used by "retry"
  backoffMs: <number>         // used by "retry"
  fallbackValue: <any>        // used by "fallback"
}
```

### Strategies

| Strategy | Meaning |
|----------|---------|
| `fail` | Node failure errors the whole graph execution (default). |
| `retry` | Re-run the node up to `maxRetries` times, with `backoffMs` between attempts. If still failing, the graph errors. |
| `skip` | Mark the node as skipped and continue; downstream nodes run without this node's output. |
| `fallback` | Replace the node's output with `fallbackValue` and continue. |

### Example

```swirls
node external_api {
  type: http
  url: @ts { return "https://flaky.example.com/data" }
  failurePolicy: {
    strategy: "retry"
    maxRetries: 3
    backoffMs: 1000
  }
}

node enrich {
  type: http
  url: @ts { return "https://enrichment.example.com" }
  failurePolicy: {
    strategy: "fallback"
    fallbackValue: { enriched: false }
  }
}

node optional_step {
  type: http
  url: @ts { return "https://optional.example.com" }
  failurePolicy: {
    strategy: "skip"
  }
}
```

### Notes

- The policy lives alongside other config fields on a node; it is not a separate block.
- Downstream nodes still see `context.nodes.<name>.output` for skipped/fallback cases; `skip` sets it to `undefined` (or absent), `fallback` sets it to `fallbackValue`.
- `failurePolicy` is optional and can be omitted on any node.
