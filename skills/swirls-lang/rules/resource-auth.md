---
title: Auth Block Declaration
impact: HIGH
tags: resource, auth, oauth, api_key, basic, bearer, top-level
---

## Auth Block Declaration

Declares named authentication configuration, usually linked to a top-level `secret` block via `secrets: <block_name>`. Identifier fields (e.g. `client_id`, `token`) must name vars declared in that block's `vars`.

Supported `type` values: `oauth`, `api_key`, `basic`, `bearer`.

## oauth

Requires: `grant_type`, `client_id`, `client_secret`, `token_url` (plus `type` and `secrets`).

## api_key

Requires: `key`, and either `header` or `query_param`.

## basic

Requires: `username`, `password`.

## bearer

Requires: `token`.

## HTTP node

Only `http` nodes may set `auth: <auth_block_name>`.

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

node call_api {
  type: http
  auth: github
  url: @ts { return "https://api.github.com/user" }
}
```

Runtime token exchange and header injection are platform/engine concerns; the DSL validates references and required fields only.
