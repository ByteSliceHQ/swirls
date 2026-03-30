---
title: Code Node Sandbox Limits
impact: CRITICAL
tags: ts, sandbox, imports, fetch, network, filesystem
---

## Code Node Sandbox Limits

`@ts` blocks in `code` nodes run in an isolated sandbox with no access to the outside world. They cannot import modules, make network requests, access the filesystem, or use environment variables directly.

**Incorrect (trying to import modules):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    import crypto from "crypto"
    return { hash: crypto.randomUUID() }
  }
}
```

**Incorrect (trying to use fetch):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const res = await fetch("https://api.example.com")
    return await res.json()
  }
}
```

**Incorrect (trying to read env vars):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const key = process.env.API_KEY
    return { key }
  }
}
```

**Correct (pure data transformation only):**

```swirls
node process {
  type: code
  label: "Process"
  code: @ts {
    const { name, email } = context.nodes.root.output
    return {
      name: name.trim(),
      email: email.trim().toLowerCase(),
    }
  }
}
```

**Correct (use the right node type for I/O):**

| Need | Use |
|------|-----|
| HTTP requests | `http` node |
| AI model calls | `ai` node |
| Send email | `email` node |
| Scrape web pages | `scrape` node |
| Read persisted data | `stream` node |
| Access secrets | `context.secrets.KEY_NAME` in @ts block |

Code nodes are strictly for reshaping inputs, normalizing strings, computing derived values, and structuring outputs. Break your workflow into multiple nodes with the right types.
