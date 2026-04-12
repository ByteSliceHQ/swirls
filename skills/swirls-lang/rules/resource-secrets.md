---
title: Secret Block Declaration
impact: HIGH
tags: resource, secret, vars, credentials, top-level
---

## Secret Block Declaration

Groups secret key names for use by `auth` blocks and optional node-level `secrets: <blockName>` references.

## Correct

```swirls
secret github_secrets {
  label: "GitHub credentials"
  description: "Optional human-readable notes for tooling"
  vars: [GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET]
}
```

- Block name: `[a-zA-Z_][a-zA-Z0-9_]*` (same as other resources).
- Optional `label` and `description` (strings), like forms and graphs.
- `vars` is a list of identifiers (or quoted strings); each must match `[a-zA-Z0-9_]+`.

## Incorrect

```swirls
secret bad-name {
  vars: [KEY]
}
```

Hyphenated block names fail resource name validation.

Nodes can reference a block with `secrets: github_secrets` (identifier) or list keys inline with `secrets: [KEY1, KEY2]`.
