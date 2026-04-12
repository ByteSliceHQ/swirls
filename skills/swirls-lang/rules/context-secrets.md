---
title: context.secrets - Accessing Secrets
impact: HIGH
tags: context, secrets, environment, keys, declaration
---

## context.secrets - Accessing Secrets

Secrets are accessed via `context.secrets.<secret_block_name>.<VAR_NAME>` in `@ts` blocks. Declare which vars from which top-level `secret` blocks the node may read using `secrets: { blockName: [VAR1, VAR2] }`. Some node types resolve vendor API keys internally (not via `context.secrets`).

**Incorrect (flat access without block):**

```swirls
code: @ts {
  const key = context.secrets.MY_TOKEN
}
```

Use the block-qualified path that matches your `secrets:` map.

**Incorrect (using process.env):**

```swirls
code: @ts {
  const key = process.env.API_KEY
}
```

Code nodes have no access to `process.env`.

**Correct (secret block + map + nested access):**

```swirls
secret creds {
  vars: [MY_SERVICE_TOKEN, ANOTHER_KEY]
}

graph g {
  root {
    type: code
    label: "Entry"
    secrets: {
      creds: [MY_SERVICE_TOKEN, ANOTHER_KEY]
    }
    code: @ts {
      const token = context.secrets.creds.MY_SERVICE_TOKEN
      return { hasToken: Boolean(token) }
    }
  }
}
```

Var names in the `secret` block and in each node's `secrets:` map must match `[a-zA-Z0-9_]+`. The validator ensures block names exist and each listed var is declared in that block's `vars`.

**Inferred vendor keys (ai / resend / firecrawl):**

These are resolved by the runtime for those node types (e.g. `OPENROUTER_API_KEY` for `ai`). They are not exposed on `context.secrets` for user `@ts` code; declare your own keys in a `secret` block if you need them in code.

Set secret values via `bunx swirls env set VAR_NAME` or the dashboard (vault keys remain flat by var name).
