---
title: Top-Level Declarations
impact: HIGH
tags: file, structure, declarations, form, webhook, schedule, graph, trigger
---

## Top-Level Declarations

A `.swirls` file contains five kinds of top-level declarations in any order. There are no imports, exports, or module syntax.

**Incorrect (using unsupported syntax):**

```swirls
import { helper } from "./utils.swirls"

export graph my_graph {
  // ...
}
```

**Correct (valid top-level declarations):**

```swirls
version: 1

form contact {
  label: "Contact"
  enabled: true
  schema: @json { { "type": "object", "properties": { "email": { "type": "string" } } } }
}

webhook inbound {
  label: "Inbound"
  enabled: true
}

schedule daily {
  label: "Daily"
  cron: "0 9 * * *"
}

graph process {
  label: "Process"
  root {
    type: code
    label: "Entry"
    code: @ts { return {} }
  }
}

trigger on_contact {
  form:contact -> process
  enabled: true
}
```

The five valid top-level blocks are:
- `form <name> { }` - UI forms and API endpoints
- `webhook <name> { }` - HTTP endpoints for external payloads
- `schedule <name> { }` - Cron-based triggers
- `graph <name> { }` - Workflow DAGs
- `trigger <name> { }` - Binds resources to graphs

`version: <number>` is optional and can appear once at the top.
