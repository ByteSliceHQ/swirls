---
title: Disk Nodes
impact: HIGH
tags: node, disk, archil, exec, command, filesystem
---

## Disk Nodes

Disk nodes execute bash commands on a remote disk mounted via a top-level `disk` block. Archil is the underlying vendor (`ARCHIL_API_KEY`). Every disk node binds to a `disk` block by bare identifier and runs one shell command.

**Required fields:** `disk` (bare identifier naming a top-level `disk <name> { }` block), `command` (string literal or `@ts` returning a shell command).

### Incorrect (missing required fields)

```swirls
node run_ls {
  type: disk
}
```

The validator errors: `Node type "disk" requires "disk"` and `Node type "disk" requires "command"`.

### Correct (literal command)

```swirls
secret disk_creds {
  vars: [ARCHIL_API_KEY]
}

disk proj {
  label: "Project disk"
  id: "dsk-0123456789abcdef"
  region: "aws-us-east-1"
  secrets: disk_creds
}

workflow audit {
  label: "Audit disk contents"
  root {
    type: disk
    label: "List mount"
    disk: proj
    command: "ls -la /mnt/proj"
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
    return "cat /mnt/proj/reports/" + id + ".md"
  }
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `disk` | yes | Bare identifier | Names a top-level `disk <name> { }` block. |
| `command` | yes | String or `@ts` block | Single shell command to execute on the disk. |
| `schema` | no | `@json` block, object literal, or bare schema name | Types the command output for downstream `@ts` code. |

Standard shared fields (`label`, `description`, `secrets`, `review`, `failurePolicy`) also apply.

### API key

`ARCHIL_API_KEY` is resolved by the runtime via the referenced `disk` block's `secrets:` reference. See `resource-disk`.
