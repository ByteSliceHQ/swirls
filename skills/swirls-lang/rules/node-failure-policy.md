---
title: Node Failure Policy
impact: MEDIUM
tags: node, failurePolicy, retry, fallback, skip, fail, durable
---

## Node Failure Policy

Any node can declare a `failurePolicy:` to control what the durable DAG engine does when that node's execution throws. Without a policy, the default is `fail` (the whole workflow execution errors).

### Shape

```swirls
failurePolicy: {
  strategy: "fail" | "retry" | "skip" | "fallback"
  maxRetries: <number>        // parses; not honored by the engine
  backoffMs: <number>         // parses; not honored by the engine
  fallbackValue: <any>        // used by "fallback"
}
```

### Strategies

| Strategy | Meaning |
|----------|---------|
| `fail` | Node failure errors the whole workflow execution (default). |
| `retry` | Opt the node into the platform's retry handling. `maxRetries`/`backoffMs` parse but are not honored: the engine applies its fixed retry policy (up to 3 attempts for standard nodes, 5 for agent nodes; definition-caused errors are never retried). If still failing, the workflow errors. |
| `skip` | Mark the node as skipped and continue; downstream nodes run without this node's output. |
| `fallback` | Replace the node's output with `fallbackValue` and continue. |

### Example

```swirls
node external_api {
  type: http
  url: @ts { return "https://flaky.example.com/data" }
  failurePolicy: {
    strategy: "retry"
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
