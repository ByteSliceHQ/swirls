---
title: Disk Nodes
impact: HIGH
tags: node, disk, archil, exec, command, filesystem
---

## Disk Nodes

Disk nodes execute bash commands on a platform-managed Archil disk. Every disk node binds to a top-level `disk <name> { }` block by bare identifier and runs one shell command.

**Required fields:** `disk`, `command`.

### Incorrect (missing required fields)

```swirls
node run_ls {
  type: disk
}
```

The validator errors: `Node type "disk" requires "disk"` and `Node type "disk" requires "command"`.

### Correct (literal command)

```swirls
disk proj {
  label: "Project disk"
}

workflow audit {
  label: "Audit disk contents"
  root {
    type: disk
    label: "List root"
    disk: proj
    command: "ls -la"
  }
}
```

### Correct (dynamic command via @ts)

```swirls
node fetch_report {
  type: disk
  label: "Cat report"
  disk: proj
  command: @ts {
    const id = context.nodes.root.output.reportId
    return "cat reports/" + id + ".md"
  }
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `disk` | yes | Bare identifier | Names a top-level `disk <name> { }` block. |
| `command` | yes | String or `@ts` block | Single shell command executed via Archil `disk.exec`. |
| `schema` | no | `@json` block, object literal, or bare schema name | Types the command output for downstream `@ts` code. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply.

### Platform credentials

`ARCHIL_API_KEY` is resolved by the platform at runtime — do not declare it in DSL `secrets:` on disk blocks. See `resource-disk`.
