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

#### Correct (literal command)

Plain quoted strings run directly as shell — no sandbox. Use this for static commands.

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

#### Correct (dynamic command via @ts)

Use `@ts` when the command depends on upstream outputs or `context`.

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
| `command` | yes | String or `@ts` block | Shell command. Plain strings run as-is; `@ts` runs in the sandbox and must return a command string. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply. Do not set `schema:` — disk nodes have a vendor-managed output envelope (`stdout`, `stderr`, `exitCode`, `timing`).

### Platform credentials

`ARCHIL_API_KEY` is resolved by the platform at runtime — do not declare it in DSL `secrets:` on disk blocks. See `resource-disk`.
