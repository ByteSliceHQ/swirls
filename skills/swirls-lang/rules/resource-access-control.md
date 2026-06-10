---
title: Role and Policy Blocks
impact: HIGH
tags: resource, role, policy, rbac, allow, deny, match, claims, top-level
---

## Role and Policy Blocks

Two top-level blocks define identity-scoped access control for agents: `role <name> { }` (derive a named role from verified principal attributes) and `policy { }` (grant or deny roles access to agents and their workflows/tools). There is no separate enforcement switch: **declaring a `policy` with at least one grant flips the project to deny-by-default**. A project with roles but no policy grants stays open within the organization.

There is no `access { }` block. It was removed; writing one is a parse error.

### `role <name> { }` — claim matching

Derives a named role from verified principal attributes. Conditions inside `match { }` AND together.

```swirls
role admins {
  description: "Org admins"
  match {
    org_role: admin
  }
}

role engineers {
  match {
    department: ["engineering", "platform"]   // list value = membership ("in")
    employment: fulltime                       // scalar value = equality ("eq")
  }
}
```

- `match { <claim>: <value> }` — a scalar value (bare identifier, string, number, or boolean) is an equality test; an array value is a membership test.
- Role names must match `^[a-zA-Z0-9_]+$`. Duplicate role names error: `Duplicate role name "<n>"`.
- An empty `match { }` warns: `Role "<n>" has an empty match { } and will match no principal`.
- `description:` is optional.

### `policy { }` — grants

A nameless block containing one or more grant lines of the form `allow|deny <role> -> agent <name>|*`, each with an optional body narrowing the grant.

```swirls
policy {
  allow admins -> agent *

  allow engineers -> agent concierge {
    workflows: [search_kb, escalate]
    tools: [search_kb]
  }

  deny contractors -> agent billing_bot
}
```

- `<role>` is a bare identifier naming a `role` block.
- The target is `agent <name>` (a declared `agent` block) or `agent *` (every agent).
- An omitted body grants all of the agent's workflows and tools. `workflows: [ … ]` and `tools: [ … ]` are bare-identifier arrays that narrow the grant.
- A grant flips the project to deny-by-default: principals matching no granting role are denied. `deny` wins over `allow` for the same agent; a principal matching multiple roles gets the union of their grants. An empty `policy { }` (no grants) enforces nothing.
- Parse errors: `Expected role name after `allow``, `Expected `->` after role name`, `Expected `agent` after `->``, `Expected an agent name or `*``, `Expected `allow` or `deny` in policy block`.

### Notes

- `role`, `match`, `policy`, `allow`, and `deny` are lexer keywords. `access` is not a keyword.
- `policy` blocks take no name; `role` blocks are named.
- The arrow in a grant is the same `->` token used by flow edges and trigger bindings.
- Top-level `role` (who may invoke an agent) is distinct from the agent-nested `profile` (what the agent may do when it runs).
