---
title: Code Nodes
impact: CRITICAL
tags: node, code, typescript, sandbox, transformation
---

## Code Nodes

Code nodes execute TypeScript in an isolated sandbox. They are for data transformation only: reshaping inputs, normalizing strings, computing derived values, and structuring outputs. They cannot make network requests, import modules, or access the filesystem.

**Required fields:** `code`

**Incorrect (trying to use fetch or imports in a code node):**

```swirls
node fetch_data {
  type: code
  label: "Fetch data"
  code: @ts {
    const res = await fetch("https://api.example.com/data")
    return await res.json()
  }
}
```

This fails silently at runtime. Code nodes have no access to `fetch`, `require`, or any I/O.

**Correct (pure data transformation):**

```swirls
node normalize {
  type: code
  label: "Normalize"
  schema: @json {
    {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
  code: @ts {
    const { name, email } = context.nodes.root.output
    return {
      name: name.trim(),
      email: email.trim().toLowerCase(),
    }
  }
}
```

**Correct (referencing external TypeScript file):**

```swirls
node normalize {
  type: code
  label: "Normalize"
  code: @ts "./handlers/normalize.ts.swirls"
}
```

If you need network access, use an `http` node. If you need AI, use an `ai` node. If you need to send email, use an `email` node. Break your graph into multiple nodes with the right types.

Code node fields:
| Field | Required | Type |
|-------|----------|------|
| `code` | yes | `@ts` block or `@ts "file.ts.swirls"` |
| `schema` | no | `@json` block (use `outputSchema` only on root nodes) |
| `inputSchema` | no | `@json` block (usually only on root) |
| `review` | no | Review config block |
| `secrets` | no | Array of secret key identifiers |
