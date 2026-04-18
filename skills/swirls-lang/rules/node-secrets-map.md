---
title: Node `secrets:` Map Syntax
impact: HIGH
tags: node, secrets, map, object, block
---

## Node `secrets:` Map Syntax

Every node can declare which secret vars it is allowed to read using a `secrets:` field. The value is **always an object literal** mapping a declared secret block name to an array of var names from that block. It is never a bare identifier, never a string, never a flat array.

### Shape

```swirls
secrets: {
  <block_name>: [<VAR1>, <VAR2>],
  <other_block>: [<VAR3>]
}
```

### Parser behavior

If `secrets:` is not followed by `{`, the parser errors: `Expected { after secrets:`.

### Incorrect (flat array)

```swirls
node call {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: [API_KEY]
}
```

### Incorrect (bare identifier)

```swirls
node call {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: my_creds
}
```

### Incorrect (string)

```swirls
node call {
  type: http
  url: @ts { return "https://api.example.com" }
  secrets: "my_creds"
}
```

### Correct

```swirls
secret my_creds {
  vars: [API_KEY, API_SECRET]
}

node call {
  type: http
  label: "Call API"
  url: @ts { return "https://api.example.com" }
  headers: @ts {
    return {
      "x-api-key": context.secrets.my_creds.API_KEY
    }
  }
  secrets: {
    my_creds: [API_KEY]
  }
}
```

### Validation rules

- Block names must match `^[a-zA-Z0-9_]+$`. Invalid names error: `Invalid secret block key "<name>" in secrets map`.
- Each block name must match a top-level `secret` block. Missing blocks error: `Node references undefined secret block "<block>" in secrets map`.
- Each var must be declared in that block's `vars` list. Missing vars error: `Secret block "<block>" has no var "<VAR>" (declared vars: …)`.
- Multiple entries are allowed — a node can pull from several secret blocks at once.

### Runtime access

In `@ts` code, read values as `context.secrets.<block_name>.<VAR>`:

```ts
const key = context.secrets.my_creds.API_KEY
```

The node cannot access vars it did not declare in its `secrets:` map, even if they exist in the secret block.

### Auth / postgres blocks are different

Top-level `auth { secrets: <block_name> }` and `postgres { secrets: <block_name> }` use a **bare identifier** to reference a single secret block — those are not maps. Only the per-node `secrets:` field takes a map.
