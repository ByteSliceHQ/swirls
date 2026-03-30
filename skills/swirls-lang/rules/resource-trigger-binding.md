---
title: Trigger Bindings
impact: HIGH
tags: resource, trigger, binding, form, webhook, schedule, agent
---

## Trigger Bindings

Triggers connect resources (forms, webhooks, schedules, agents) to graphs. When the resource fires, the graph executes with the resource payload as `context.nodes.root.input`.

**Incorrect (wrong syntax):**

```swirls
trigger my_trigger {
  form: contact_form
  graph: process_form
}
```

**Correct (binding syntax: resourceType:name -> graphName):**

```swirls
trigger on_contact {
  form:contact_form -> process_form
  enabled: true
}
```

**Correct (multiple triggers for one graph):**

```swirls
trigger webhook_trigger {
  webhook:inbound -> handle_event
  enabled: true
}

trigger schedule_trigger {
  schedule:daily -> handle_event
  enabled: true
}
```

**Correct (agent trigger):**

```swirls
trigger agent_trigger {
  agent:my_agent -> my_graph
}
```

Trigger binding syntax: `resourceType:resourceName -> graphName`

Valid resource types: `form`, `webhook`, `schedule`, `agent`

Validation rules:
- The resource and graph must be defined in the same file (except `agent` type)
- Trigger names must be unique
- A graph can have multiple triggers from different resources
- `swirls doctor` validates that referenced resources and graphs exist
