---
title: Auth Block Declaration
impact: HIGH
tags: resource, auth, oauth, api_key, basic, bearer, cloud, top-level, http
---

## Auth Block Declaration

Declares named authentication configuration. Most types are linked to a top-level `secret` block via `secrets: <block_name>`, with identifier fields (`client_id`, `token`, etc.) that name vars declared in that block's `vars` list. `auth:` can only be referenced from `http` nodes.

### Supported `type` values

```
oauth, api_key, basic, bearer, cloud
```

Any other value triggers: `Auth block "<name>" requires type: oauth, api_key, basic, bearer, or cloud`.

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

### cloud

**Required fields:** `type`, `provider`, `connection_id`. **Does not use** `secrets:` — the validator warns if it sees one.

```swirls
auth aws_connection {
  type: cloud
  provider: "aws"
  connection_id: "prod-account-us-east-1"
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
- `type:` is required and must be one of the five values above.
- Identifier fields (`client_id`, `client_secret`, `key`, `username`, `password`, `token`) must each name a var declared in the referenced secret block. Otherwise the validator errors: `Auth "<name>" references undefined var "<VAR>" not declared in secret block "<secrets>"`.
- `cloud` type should not reference `secrets`.

Runtime token exchange and header injection are platform concerns; the DSL validates references and required fields.
