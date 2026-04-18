---
title: Secret Block Declaration
impact: HIGH
tags: resource, secret, vars, credentials, top-level
---

## Secret Block Declaration

Top-level `secret <name> { }` blocks declare groups of secret variable names for use by `auth` blocks, `postgres` connection references, and node-level `secrets:` maps.

```swirls
secret github_secrets {
  label: "GitHub credentials"
  description: "Optional human-readable notes for tooling"
  vars: [GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET]
}
```

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `label` | no | String | Optional display name. |
| `description` | no | String | Optional longer description. |
| `vars` | yes | Array of identifiers | The var names available in this block. |

### Name patterns

- **Block name:** `^[a-zA-Z0-9_]+$`.
- **Var names:** `^[a-zA-Z0-9_]+$`.

Hyphens, dots, and other special characters are invalid and the validator errors.

```swirls
secret bad-name { vars: [KEY] }   // ERROR: invalid block name
secret good_block { vars: [MY-KEY] }  // ERROR: invalid var name
```

### Duplicate vars

Repeating the same var in one block is a validator error: `Duplicate var "<VAR>" in secret block "<name>"`.

```swirls
secret creds {
  vars: [API_KEY, API_KEY]  // ERROR
}
```

### Consuming secrets on a node

The `secrets:` field on a node is an **object literal** mapping secret block names to arrays of var names:

```swirls
secret creds {
  vars: [MY_TOKEN, ANOTHER_KEY]
}

graph g {
  root {
    type: code
    label: "Entry"
    secrets: {
      creds: [MY_TOKEN, ANOTHER_KEY]
    }
    code: @ts {
      const token = context.secrets.creds.MY_TOKEN
      return { hasToken: Boolean(token) }
    }
  }
}
```

The validator checks that every block name is declared and every listed var appears in that block's `vars`.

### Setting values

Values are set out-of-band (not in `.swirls` files):

- CLI: `bunx swirls env set MY_TOKEN`
- Portal: the secrets vault UI.

Vault keys are flat by var name; the block is a logical grouping for reference and validation, not a namespace at the storage layer.

### Inferred vendor keys

Some node types auto-resolve their API keys without appearing in `secrets:`:

- `ai` → `OPENROUTER_API_KEY`
- `resend` → `RESEND_API_KEY`
- `firecrawl` → `FIRECRAWL_API_KEY`
- `parallel` → `PARALLEL_API_KEY`

Do not list these in a `secret` block unless you also want them accessible from `@ts` code.
