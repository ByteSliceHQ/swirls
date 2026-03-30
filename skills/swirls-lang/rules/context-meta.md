---
title: context.meta - Execution Metadata
impact: LOW
tags: context, meta, trigger, execution
---

## context.meta - Execution Metadata

`context.meta` provides metadata about the current execution.

**Correct (accessing execution metadata):**

```swirls
root {
  type: code
  label: "Entry"
  code: @ts {
    const triggerId = context.meta.triggerId
    const triggerType = context.meta.triggerType
    return {
      triggerId: triggerId ?? "unknown",
      triggerType: triggerType ?? "unknown",
    }
  }
}
```

Available fields:
- `context.meta.triggerId` - String or null. The trigger that started this execution.
- `context.meta.triggerType` - "form", "webhook", "schedule", "agent", or null.
