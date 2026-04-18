---
title: Bucket Nodes
impact: LOW
tags: node, bucket, s3, file, upload, download
---

## Bucket Nodes

Bucket nodes perform object-storage operations on Swirls-managed buckets.

**Required fields:** `operation`.

**Valid operations:** `upload`, `download`. (No `delete` in the current runtime; the validator errors on any other value.)

### Correct

```swirls
node store_file {
  type: bucket
  label: "Store file"
  operation: upload
  path: @ts { return "files/data.json" }
}

node load_file {
  type: bucket
  label: "Load file"
  operation: download
  path: @ts { return "files/data.json" }
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `operation` | yes | `upload` or `download` | Bare identifier; no other values. |
| `path` | no | `@ts` block or string | Target path within the bucket. |
