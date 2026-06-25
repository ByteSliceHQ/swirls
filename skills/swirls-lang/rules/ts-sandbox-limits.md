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
| Access secrets | `context.secrets.<block>.<VAR>` in @ts block |

Code nodes are strictly for reshaping inputs, normalizing strings, computing derived values, and structuring outputs. Break your workflow into multiple nodes with the right types.

### What actually happens (the silent trap)

The sandbox denies I/O by capability — it does not hard-block these APIs, so they fail **quietly** instead of throwing:

- `require(...)` and Node built-ins resolve to **sandbox stubs**, not the real modules. `require("fs")` returns a working-looking `fs` over a **throwaway virtual filesystem**: a write succeeds and then vanishes, and reads never see what you wrote. Nothing throws — the data just disappears.
- `process.env` is an **empty object** (`{}`), not undefined. `process.env.API_KEY` returns `undefined` with no error. Read secrets via `context.secrets.<block>.<VAR>`.
- Network is genuinely unavailable.

So if `fs.writeFileSync` or a `require`-d module appears to "work" but nothing persists, that is expected. Move the work to the right node type (`http`, `stream`, `bucket`, `disk`). Pure-compute globals (`Date`, `Math`, `JSON`, `URL`, `RegExp`, `structuredClone`, etc.) are fully available — do not avoid them.
