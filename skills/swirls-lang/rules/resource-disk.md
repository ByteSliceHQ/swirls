---
title: Disk Block Declaration
impact: HIGH
tags: resource, disk, archil, top-level, mount, shared
---

## Disk Block Declaration

Top-level `disk <name> { }` blocks declare a **platform-managed shared disk**. Swirls provisions the Archil backing store at deploy time — authors do not set provider disk ids or `ARCHIL_API_KEY` in DSL.

**There is no `type:` field on a disk block** — the keyword `disk` identifies the block.

### Syntax

```swirls
disk <name> {
  label: "<optional label>"
  region: "<optional region>"
}
```

Empty blocks are valid: `disk shared_a { }`.

### Fields

| Field | Required | Notes |
|-------|----------|-------|
| `label` | no | Display string. Defaults to the disk's name. |
| `region` | no | Quoted string (e.g. `"aws-us-east-1"`). Optional Archil region hint at provision time. |

### Removed fields (breaking)

`id:` and `secrets:` are **no longer valid**. The parser errors:

```
Disk block no longer accepts "id:" — the platform provisions Archil disks at deploy time
Disk block no longer accepts "secrets:" — the platform provisions Archil disks at deploy time
```

### Complete example

```swirls
disk proj {
  label: "Project shared disk"
  region: "aws-us-east-1"
}

workflow backup {
  label: "Backup logs"
  root {
    type: disk
    label: "Tar logs"
    disk: proj
    command: @ts {
      const date = new Date().toISOString().slice(0, 10)
      return "tar czf /tmp/backups/logs-" + date + ".tar.gz /data"
    }
  }
}
```

### Agent shared disks

Mount a shared disk into an agent sandbox with `disks:` on the agent block:

```swirls
disk kb {}

agent helper {
  secrets: ai_creds
  model: "gpt-4o"
  disks: [ kb ]
}
```

Every deployed agent also receives a **dedicated** platform-managed disk (not declared as a `disk` block). In sandboxes it mounts at `/mnt/agent`; shared disks mount at `/mnt/disks/<diskName>`.

### Validation rules

- Disk names must match `^[a-zA-Z0-9_]+$`. Duplicate names error: `Duplicate disk block name "<n>"`.
- The `disk` node's `disk:` field must match a declared disk block by bare identifier (file-local or workspace).
- Agent `disks:` entries must reference declared `disk` blocks; duplicates error.

See `node-disk` for the workflow exec side and `resource-agent` for agent mounting.
