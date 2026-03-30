---
title: Bucket Nodes
impact: LOW
tags: node, bucket, s3, file, upload, download, delete
---

## Bucket Nodes

Bucket nodes perform S3-like file operations: upload, download, and delete.

**Required fields:** `operation`

**Correct (upload a file):**

```swirls
node store_file {
  type: bucket
  label: "Store file"
  operation: "upload"
  path: @ts { return "files/data.json" }
}
```

Bucket node fields:
| Field | Required | Type |
|-------|----------|------|
| `operation` | yes | "upload", "download", "delete" |
| `path` | no | `@ts` block or string |
| `bucket` | no | String |
