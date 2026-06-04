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
  id: "dsk-..."             // required; Archil disk id (dsk- + 16 hex chars)
  secrets: <secret_block>   // required; the block must declare ARCHIL_API_KEY
}
```

### Required vs optional fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Quoted string literal. Archil-issued disk identifier matching `^dsk-[0-9a-f]{16}$` exactly. |
| `secrets` | yes | Bare identifier naming a top-level `secret` block that declares `ARCHIL_API_KEY` in its `vars`. |
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

workflow backup {
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

- Disk names must match `^[a-zA-Z0-9_]+$`. Duplicate names error: `Duplicate disk block name "<n>"`.
- `id:` is required (`Disk block requires an id field (provider disk id)`) and must match `dsk-` + 16 hex characters (`Disk id must match pattern dsk- followed by 16 hex characters`).
- `secrets:` is required: `Disk block requires secrets: pointing to a secret block that declares ARCHIL_API_KEY`. The referenced block must exist (`Disk "<n>" references undefined secret block "<s>"`) and must declare the var (`Secret block "<s>" must declare var "ARCHIL_API_KEY" for disk runtime API access`).
- The `disk` node's `disk:` field must match a declared disk block by bare identifier (file-local or workspace).

See `node-disk` for the read/exec side.
