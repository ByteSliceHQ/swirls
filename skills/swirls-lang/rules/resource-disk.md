---
title: Disk Block Declaration
impact: HIGH
tags: resource, disk, archil, top-level, mount, secrets, region
---

## Disk Block Declaration

Top-level `disk <name> { }` blocks declare an Archil-backed remote disk that `type: disk` nodes mount and exec on. Each block carries the provider disk id, an optional region, and a reference to a `secret` block holding `ARCHIL_API_KEY`.

**There is no `type:` field on a disk block** — the keyword `disk` identifies the block.

### Syntax

```swirls
disk <name> {
  label: "<optional label>"
  region: "<optional region>"
  id: "dsk-..."             // required; Archil disk id
  secrets: <secret_block>   // optional reference to a top-level secret block
}
```

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Quoted string literal. Archil-issued disk identifier (typically `dsk-` + hex). |
| `secrets` | no | Bare identifier naming a top-level `secret` block (e.g. one declaring `ARCHIL_API_KEY`). |
| `label` | no | Display string. Defaults to the disk's name. |
| `region` | no | Quoted string (e.g. `"aws-us-east-1"`). |

### Complete example

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

graph backup {
  label: "Backup logs"
  root {
    type: disk
    label: "Tar logs"
    disk: proj
    command: @ts {
      const date = new Date().toISOString().slice(0, 10)
      return "tar czf /mnt/proj/backups/logs-" + date + ".tar.gz /mnt/proj/logs"
    }
  }
}
```

### Validation rules

- Disk names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `id:` must be a non-empty quoted string.
- `secrets:` (if present) must reference an existing top-level `secret` block.
- The `disk` node's `disk:` field must match a declared disk block by bare identifier.

See `node-disk` for the read/exec side.
