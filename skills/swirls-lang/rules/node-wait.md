---
title: Wait Nodes
impact: LOW
tags: node, wait, delay, pause, duration
---

## Wait Nodes

Wait nodes pause graph execution for a specified duration.

**Correct (static wait):**

```swirls
node delay {
  type: wait
  label: "Wait 5 minutes"
  amount: 5
  unit: "minutes"
}
```

Wait node fields:
| Field | Required | Type |
|-------|----------|------|
| `amount` | no | Number |
| `unit` | no | "seconds", "minutes", "hours", "days" |
