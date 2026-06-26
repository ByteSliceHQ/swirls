---
title: Skill Block Declaration
impact: HIGH
tags: resource, skill, agent, knowledge, top-level
---

## Skill Block Declaration

Top-level `skill <name> { }` blocks declare a **local knowledge skill** resolved from `.agents/skills/<name>/` in the project repo at deploy time. Referenced skills are listed on an `agent` block via `skills:` (bare identifiers). At runtime the host serves skill bodies through a system-prompt catalog and `open_skill` / `read_skill_file` tools — **no sandbox VM**.

**There is no `type:` field on a skill block** — the keyword `skill` identifies the block.

### Syntax

```swirls
skill <blockName> {
  name: "<directory-slug>"   // required; folder under .agents/skills/
}
```

`name:` is a quoted string naming the on-disk directory slug (not the block name). The block name (`<blockName>`) is how agents reference the skill in `skills: [blockName]`.

### Fields

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Quoted string. Must match `^[a-zA-Z0-9_-]+$` style directory names under `.agents/skills/`. |

### Referencing from an agent

```swirls
skill swirls_lang {
  name: "swirls-lang"
}

agent helper {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  skills: [swirls_lang]
}
```

`skills:` is a bare-identifier array, same style as `tools:` and `disks:`. Each entry must match a top-level `skill` block in the workspace.

### Profile narrowing

Profiles may narrow `skills:` to a subset of the agent block's list (same rule as `tools:`):

```swirls
agent helper {
  secrets: vendor_keys
  model: "openai/gpt-4o-mini"
  skills: [swirls_lang, other_skill]

  profile support {
    skills: [swirls_lang]
  }
}
```

Profile `skills:` must be a **subset** of the agent's top-level `skills:`.

### Authoring on disk

Install or author skills under:

```
.agents/skills/<name>/SKILL.md
```

`swirls doctor` resolves each declared skill, enforces size/symlink caps, classifies the bundle as knowledge-only, and warns when `SKILL.md` frontmatter `name` does not match the directory slug.

Executable content (scripts, shebangs, `scripts/` paths) is rejected at doctor and deploy.

### Deploy behavior

- CLI `swirls deploy` collects referenced skill trees into a `skillFiles` payload.
- API re-classifies, checksums, uploads to R2 at `orgs/<org>/projects/<project>/skills/<checksum>/<path>` (deduped per checksum).
- Resolved skill references (checksum, description, file manifest) are stamped onto agent blocks in the deployment definition.

### Runtime behavior

- **Level 0:** skill names + descriptions append to the system prompt.
- **Level 1:** `open_skill(name)` returns the `SKILL.md` body.
- **Level 2:** `read_skill_file(name, path)` returns bundled text files.

All reads are host-side from R2. Chat-only turns that never call sandbox tools still work with skills.

### Validation rules

- Skill block names must match `^[a-zA-Z0-9_]+$`. Duplicate names error.
- `name:` must be non-empty after trim.
- `agent.skills` entries must reference declared `skill` blocks in the workspace.
- Profile `skills:` must be a subset of the parent agent's `skills:`.

See `resource-agent` for the agent block's `skills:` field.
