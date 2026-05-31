---
title: Trigger Bindings
impact: HIGH
tags: resource, trigger, binding, form, webhook, schedule
---

## Trigger Bindings

Triggers connect a resource (form, webhook, or schedule) to a workflow. When the resource fires, the workflow executes with the resource's payload available as `context.nodes.root.input`.

**Only three resource types are valid in triggers:** `form`, `webhook`, `schedule`. There is no `agent:`, `stream:`, or `trigger:` type.

### Syntax

```swirls
trigger <name> {
  form:<form_name> -> <workflow_name>
  enabled: <boolean>
}

trigger <name> {
  webhook:<webhook_name> -> <workflow_name>
  enabled: <boolean>
}

trigger <name> {
  schedule:<schedule_name> -> <workflow_name>
  enabled: <boolean>
}
```

The binding is a single syntactic line `<type>:<name> -> <workflowName>`. There are no separate `resource:` / `graph:` fields. `enabled:` is the only other field; everything else is ignored.

### Incorrect (wrong syntax)

```swirls
trigger my_trigger {
  form: contact_form
  workflow: process_form
}
```

Missing the `-> workflowName` arrow. The trigger silently parses with empty `resourceName` and `workflowName`, and the validator then complains about undefined references.

### Incorrect (agent type)

```swirls
trigger agent_trigger {
  agent:my_agent -> my_graph
}
```

`agent` is not a valid resource type. Only `form`, `webhook`, `schedule`.

### Correct examples

```swirls
trigger on_contact {
  form:contact_form -> process_form
  enabled: true
}

trigger webhook_trigger {
  webhook:inbound -> handle_event
  enabled: true
}

trigger daily_schedule {
  schedule:daily -> handle_event
  enabled: true
}
```

Multiple triggers can target the same workflow from different sources.

### Validation rules

- Trigger names must match `^[a-zA-Z0-9_]+$` and be unique in the file.
- The referenced `form` / `webhook` / `schedule` must be declared in the same file, else: `Trigger references <type> "<name>" which is not defined`.
- The referenced workflow must be declared in the same file, else: `Trigger references workflow "<name>" which is not defined`.

### `enabled`

`enabled: false` parses fine but the runtime skips the trigger. Omit the field to default to enabled.
