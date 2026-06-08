---
title: Auth Block Declaration
impact: HIGH
tags: resource, auth, oauth, api_key, basic, bearer, top-level, http
---

## Auth Block Declaration

Declares named authentication configuration. Each type is linked to a top-level `secret` block via `secrets: <block_name>`, with identifier fields (`client_id`, `token`, etc.) that name vars declared in that block's `vars` list. `auth:` can only be referenced from `http` nodes.

Use `auth` for credentials you bring yourself. For a Swirls-brokered OAuth grant (Slack, Linear, ...), declare a top-level `connection` block instead and reference it via `connection:` on the http node. See `resource-connection`.

### Supported `type` values

```
oauth, api_key, basic, bearer
```

Any other value triggers: `Auth block "<name>" requires type: oauth, api_key, basic, or bearer`. (The `cloud` type has been removed; use a `connection` block.)

### oauth

**Required fields:** `type`, `grant_type`, `client_id`, `client_secret`, `token_url`, and `secrets` referencing a block that declares the `client_id` / `client_secret` vars.

```swirls
auth github {
  label: "GitHub API"
  type: oauth
  secrets: github_secrets
  grant_type: client_credentials
  client_id: GITHUB_CLIENT_ID
  client_secret: GITHUB_CLIENT_SECRET
  token_url: "https://github.com/login/oauth/access_token"
}
```

### api_key

**Required fields:** `type`, `key`, and exactly one of `header:` or `query_param:`.

```swirls
auth stripe {
  type: api_key
  secrets: stripe_secrets
  key: STRIPE_API_KEY
  header: "Authorization"
}
```

### basic

**Required fields:** `type`, `username`, `password`.

```swirls
auth internal_api {
  type: basic
  secrets: internal_secrets
  username: INTERNAL_USER
  password: INTERNAL_PASS
}
```

### bearer

**Required fields:** `type`, `token`.

```swirls
auth my_bearer {
  type: bearer
  secrets: bearer_secrets
  token: API_BEARER_TOKEN
}
```

### Referencing an auth block

`auth:` is only valid on `http` nodes. The validator errors otherwise: `"auth" is only valid on http nodes`.

```swirls
node call_api {
  type: http
  url: @ts { return "https://api.github.com/user" }
  auth: github
}
```

The value is a bare identifier naming the auth block. Referencing an undefined auth block errors: `HTTP node references undefined auth block "<name>"`.

### Validation rules

- Auth block names match `^[a-zA-Z0-9_]+$`.
- Duplicate block names error.
- `type:` is required and must be one of the four values above.
- Identifier fields (`client_id`, `client_secret`, `key`, `username`, `password`, `token`) must each name a var declared in the referenced secret block. Otherwise the validator errors: `Auth "<name>" field "<field>" must reference a var from secret block "<secrets>"`.
- Forms can also reference an auth block via `auth: <name>`, but only `type: basic` blocks are accepted there. See `resource-form`.

Runtime token exchange and header injection are platform concerns; the DSL validates references and required fields.
