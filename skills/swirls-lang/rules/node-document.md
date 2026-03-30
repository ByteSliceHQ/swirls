---
title: Document Nodes
impact: LOW
tags: node, document, processing
---

## Document Nodes

Document nodes handle document processing tasks.

**Correct (basic document node):**

```swirls
node process_doc {
  type: document
  label: "Process document"
  documentId: "uuid-here"
}
```

Document node fields:
| Field | Required | Type |
|-------|----------|------|
| `documentId` | no | String (UUID) |
