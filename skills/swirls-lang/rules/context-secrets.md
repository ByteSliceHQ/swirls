---
title: context.secrets - Accessing Secrets
impact: HIGH
tags: context, secrets, environment, keys, declaration
---

## context.secrets - Accessing Secrets

Secrets are accessed via `context.secrets.KEY_NAME` in `@ts` blocks. Custom secrets must be declared on the node with `secrets: [KEY_NAME]`. Some node types have inferred default secrets that do not need declaration.

**Incorrect (declaring secrets as a string array):**

```swirls
node process {
  type: code
  label: "Process"
  secrets: ["MY_TOKEN"]
  code: @ts { return { token: context.secrets.MY_TOKEN } }
}
```

Error: "Unexpected token: expected form, webhook, schedule, graph, or trigger"

**Incorrect (using process.env):**

```swirls
code: @ts {
  const key = process.env.API_KEY
}
```

Code nodes have no access to `process.env`.

**Correct (declaring secrets as identifiers):**

```swirls
root {
  type: code
  label: "Entry"
  secrets: [MY_SERVICE_TOKEN, ANOTHER_KEY]
  code: @ts {
    const token = context.secrets.MY_SERVICE_TOKEN
    return { hasToken: Boolean(token) }
  }
}
```

Secret keys are unquoted identifiers, not strings. They must match `[a-zA-Z0-9_]+`.

**Inferred secrets (no declaration needed):**

| Node Type | Inferred Secret |
|-----------|----------------|
| `ai` | `OPENROUTER_API_KEY` |
| `email` | `RESEND_API_KEY` |
| `scrape` | `FIRECRAWL_API_KEY` |

Set secret values via `bunx swirls env set KEY_NAME` or the dashboard.
