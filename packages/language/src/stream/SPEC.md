# Stream blocks — Language specification

> Normative rules for top-level **`stream`** blocks and **`type: stream`** graph nodes: syntax, static validation, evaluation order, and the **`FunctionContext`** available to their `@ts` bodies. This document does not define storage backends, network APIs, or bundling wire formats.

**Status:** Draft  
**Version:** 0.5.0

---

## 1. Overview

A **`stream`** block names a **persisted row type** tied to exactly one **`graph`**. After that graph completes, a conforming implementation evaluates **per-active-version** **`condition`** (if any) and **`prepare`** for the deployment’s **`version`** pointer and may store one record per execution.

A **`type: stream`** node reads stored rows from a **`stream`** block selected by name, pinned to an explicit **`version`**, using a **`filter`** value to constrain rows.

**Merged workspace:** References to another top-level name (the `graph:` field on a `stream` block, the `stream:` field on a `type: stream` node) are resolved against the **union** of top-level declarations from all `.swirls` sources in the validation or execution scope, the same way other cross-file references in Swirls work.

---

## 2. `stream` block

There is **no** `type:` field — the keyword **`stream`** introduces the block.

### 2.1. Surface syntax

```swirls
stream <name> {
  enabled: <boolean>           // optional
  label: "<optional label>"    // defaults to <name> if omitted (see §5)
  description: "<optional>"
  graph: <graph_name>          // required
  version: <version_id>        // required — writer pointer; must exist in versions:

  versions: {
    <version_id> {
      schema: @json {
        { ... JSON Schema for one persisted record ... }
      }
      // or:  schema: <schema_block_name>

      condition: @ts {          // optional — boolean
        return <boolean expression>
      }
      prepare: @ts {             // required — value matching this version’s schema
        return { ... }
      }
    }
    ...
  }
}
```

`<version_id>` MUST match **`^v[1-9][0-9]*$`** (e.g. `v1`, `v12`). **`schema`**, **`condition`**, and **`prepare`** MUST appear only inside each **`versions:`** entry, not at the top level (a hard grammar/validation migration from earlier drafts).

### 2.2. Fields (normative)

| Field         | Required | Meaning                                                                                                                                                                                                                                                                 |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`     | no       | Only **boolean** values are read from the source; other values are ignored and leave **`enabled`** unset (treated like “on”). If **`enabled`** is **`false`**, the block MUST NOT run for a graph completion (§3). If **`true`** or unset, evaluation continues per §3. |
| `label`       | no       | Human-readable label; see §5 for defaulting.                                                                                                                                                                                                                            |
| `description` | no       | Free-form documentation only.                                                                                                                                                                                                                                           |
| `graph`       | yes      | Name of a **`graph`** block whose completions drive this stream. The value MAY be a bare identifier (e.g. `graph: process_leads`) or a quoted string (e.g. `graph: "process_leads"`).                                                                                   |
| `version`     | yes      | **`version_id`** naming the active writer payload. Persisted writes use **`versions[<version>]`.** MUST appear as a key in **`versions:`**.                                                                                                                             |
| `versions`    | yes      | Map of **`version_id`** → `{ schema, condition?, prepare }`. Each key MUST be unique. Each entry MUST supply **`prepare`** (non-empty **`@ts`**) and **`schema`** (inline **`@json`** or **`schema: <ref>`**) per §6.                                                   |

Per-version (**inside `versions:`**):

| Field       | Required | Meaning                                                                                                                                                            |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema`    | yes      | **`schema: @json { … }`** or **`schema: <name>`**. Defines JSON shape for that version’s row.                                                                      |
| `condition` | no       | **`@ts`** returning **boolean**. If syntactically present, non-empty **`@ts`** required (§6). If falsy at runtime, **`prepare`** MUST NOT run for that completion. |
| `prepare`   | yes      | **`@ts`** returning a plain object validated against this version’s **`schema`**. Non-empty **`@ts`** body or file ref (§6).                                       |

### 2.3. Parse disambiguation

The keyword **`stream`** is meaningful in three positions; the parser disambiguates them:

- At **file top level**, **`stream <identifier> {`** begins a stream block (§2.1).
- At **file top level**, the keyword **`stream`** immediately followed by **`:`** (no name, no `{`) is **invalid**. The parser emits a diagnostic (`"stream:" is only valid inside a node { } block (did you forget to close a brace?)`), consumes the erroneous tokens, and continues parsing the rest of the file.
- Inside a **`graph { }`** body (where node declarations are expected), the same shape **`stream:`** is also **invalid** and produces an analogous diagnostic (`"stream:" is only valid inside a node { } block`); the parser recovers to allow further nodes to parse.
- Inside **`node { … }`** in a graph body, **`stream:`** is a normal property key — specifically the stream-name key on a **`type: stream`** node (§4.1).

---

## 3. Semantics of `condition` and `prepare`

These rules apply when the implementation runs stream logic after a **successful** run of the graph named in **`graph`**, and only for stream blocks whose **`graph`** equals that graph’s name.

**Order of evaluation for one `(graph completion, stream block)` pair** uses the **`stream`** block’s **`version`** pointer to select **`versions[<version>]`** (“the active definition”):

1. **`enabled` filter (caller).** Reference runtimes skip every stream where **`enabled === false`** before invoking any sandbox or engine helper. The core `evaluateStream` helper therefore does **not** re-check `enabled`; if a stream with `enabled: false` is somehow passed to it, behavior is implementation-defined.
2. **`condition` (engine).** If the active **`condition`** is present, evaluate it once. If the result is **falsy**, stop; do not run **`prepare`** and do not store a row.
3. **`prepare` and persist (engine).** Evaluate **`prepare`** once. The reference engine then:
   1. validates the returned value against the active version’s **`schema`** (errors throw),
   2. requires the value to be a **non-null plain object** (not `null`, not an array — throws otherwise),
   3. persists it as a single record for this stream version’s storage slice. Storage layout is outside this spec.

**`FunctionContext` bindings** available in **`condition`** and **`prepare`** (same family as other graph **`@ts`**):

- **`context.output`** — Object keyed by **DSL leaf node name** (nodes with no outgoing edges). Only leaves that executed in this run appear. If the graph’s only leaf is **`root`**, authors use **`context.output.root`**. Outputs of non-leaf nodes are read only via **`context.nodes.<name>.output`**.
- **`context.nodes.<name>.output`** — Per-node outputs. The **`root`** entry includes **`input`** (graph root input) and **`output`** when present.
- **`context.reviews`**, **`context.secrets`**, **`context.meta`** — Same keys as in other node **`@ts`**; implementations MAY supply empty defaults where not applicable.

**`switch` graphs:** At runtime, **`context.output`** contains only the leaf on the taken branch. **Static typing** MUST treat each possible leaf key as **independently optional**; it MUST NOT encode mutual exclusion between switch branches. Authors narrow with **`'leaf' in context.output`**, optional chaining, non-null assertions, or explicit runtime checks.

**Errors in `condition` or `prepare`:** This specification does **not** require that a throw fail the parent graph run (the graph has already completed). Whether the error is logged, whether other streams still run, and whether anything is stored for the throwing stream are **implementation-defined**.

---

## 4. `type: stream` node

### 4.1. Surface syntax

```swirls
<node_name> {
  type: stream
  stream: <stream_block_name>
  version: <version_id>
  filter: @ts {
    return { <field>: { <op>: <value> }, ... }
  }
}
```

### 4.2. Required keys

A **`type: stream`** node MUST have configuration keys **`stream`**, **`version`**, and **`filter`**. Omitting any is a **static error**.

### 4.3. Rejected keys

These keys MUST NOT appear on a **`type: stream`** node; if present, a conforming validator MUST report an error:

- **`streamId`**
- **`querySql`**
- **`query`**

### 4.4. `StreamFilter` value (normative)

The **`filter`** **`@ts`** block is **statically** required to be a non-empty **`@ts`** body or file reference (§6). At run time it **SHOULD** return a plain object of the form:

```typescript
type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in'

type StreamFilter = Record<string, Partial<Record<FilterOperator, unknown>>>
```

- Multiple **top-level keys** combine as logical **AND**.
- Multiple **operators on the same field** combine as logical **AND**.

Each key names either a **payload field** of the stored record (per the stream’s **`schema`**) or an **implementation-defined metadata field** exposed for that row (e.g. timestamps, execution identifiers). Which metadata keys exist is **outside this specification**; only the object shape above is required.

### 4.5. Node evaluation (normative)

When a **`type: stream`** node runs:

1. **`stream`** MUST resolve to a **`stream`** block name in the merged workspace.
2. **`version`** MUST reference a **`version_id`** that exists under that block’s **`versions:`**.
3. **`filter`** is evaluated with the node’s **`FunctionContext`**. It SHOULD return a plain object satisfying **`StreamFilter`** (§4.4). If it returns a non-object or an array, the reference engine treats that as **`{}`** (no field predicates); other implementations MAY error instead.
4. The node’s **output value** is an **array** of row objects. The array MAY be empty (no error). **Element ordering** is **implementation-defined** unless a future language revision adds explicit sort/limit syntax.

Downstream **`@ts`** reads rows as **`context.nodes.<this_node_name>.output`**.

### 4.6. Static typing of node output

Let **S** be the JSON Schema resolved from **`versions[<version>]`.schema** when it is present and resolvable (**`schema: name`** lookups use top-level **`schema`** blocks).

- If **S** exists, conforming type checkers MUST type the node output as an **array of the TypeScript type implied by S**.
- If **S** is missing or not resolvable, the output MUST be typed as **`unknown[]`**.

---

## 5. Defaults (`label`)

If **`label`** is omitted on a **`stream`** block, the parser sets **`label`** to the block’s **`name`** identifier.

---

## 6. Static validation (normative summary)

Rules below MUST be enforced by any conforming Swirls **language validator** given a parsed file and, where applicable, a **merged-workspace index** of top-level resource names (`graph`, `stream`, etc.).

### 6.1. `stream` blocks

- **`name`** MUST satisfy **`resourceNameSchema`** (same as other top-level resource names).
- **Duplicate `name`** among **`stream`** blocks in the **same file** MUST be an error.
- **`graph`** MUST be non-empty and MUST name a **`graph`** present in the file or in the merged workspace graph index.
- **`version`** MUST be syntactically valid **`^v[1-9][0-9]*$`** AND MUST equal a **`versions:`** entry key (including when only one entry exists).
- **`versions`** MUST be non-empty. Each **`version_id`** MUST be unique inside the block; each MUST define **`prepare`** as a non-empty **`@ts`** block or file ref; **`condition`**, when present, MUST likewise be non-empty **`@ts`**.
- **`schema`** MUST be present inside each **`versions:`** entry (inline **`@json`** and/or **`schema: <ref>`**) per §2.2.

### 6.2. Merged workspace

Workspace-level rules are enforced by tools that build a **merged workspace index** from multiple `.swirls` files (e.g. doctor, deploy bundling). The per-file validator (§6.1) intentionally does **not** scan other files.

- The set of top-level **`stream`** names across all `.swirls` inputs in a **merged workspace** MUST be **pairwise distinct**. Two files defining **`stream foo`** MUST be reported as duplicate declarations and the merge MUST be considered invalid for downstream artifact production.
- When a workspace index is supplied to the per-file validator (`options.workspace`), unresolved cross-file references (a stream's `graph:` or a `type: stream` node's `stream:`) are resolved against the union of file-local and workspace names; without a workspace index, the validator may emit "not defined" diagnostics that disappear once the full workspace is supplied.

### 6.3. `type: stream` nodes

- **`stream`**, **`version`**, and **`filter`** MUST be present (§4.2).
- **`stream`** value MUST name a **`stream`** block in the file-local set union workspace **`stream`** index.
- **`version`** MUST be syntactically valid **`version_id`** and MUST name a **`versions:`** entry on the referenced **`stream`** block when that AST is visible to the validator.
- **`filter`** MUST be **`@ts { }`** with non-empty body or a **`@ts`** file reference; other config kinds are invalid.
- Rejected keys (§4.3) MUST be diagnosed.

---

## 7. Abstract syntax (`StreamDecl`)

The parser produces **`StreamDecl`** values with at least:

| Field                                     | Notes                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`, `label`, `range`                  | Always set for a parsed block (`label` may be defaulted per §5).                                                     |
| `description?`, `docComment?`, `enabled?` | Optional.                                                                                                            |
| `graphName`                               | String (possibly empty on parse); a valid file MUST satisfy §6.1. `graphNameRange?` is used by tooling.              |
| `version`, `versionRange?`                | Active writer **`version_id`**. MUST match some **`versions[]`/`versions:`** entry.                                  |
| `versions`                                | Array of **`StreamVersionDecl`** (each has **`key`** = `vN`, optional `schema*` fields, **`condition?`, `prepare?`). |

Implementations MAY attach extra fields not produced by the core parser (e.g. stable ids) when lowering to other artifacts; such fields are **not** part of the surface syntax.

---

## 8. Design rationale (informative)

| Topic                         | Rationale                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| **`prepare` required**        | Forces an explicit mapping from graph output to stored shape.                      |
| **`condition` optional**      | Allows unconditional persistence.                                                  |
| **`schema` required**         | Fixes the record shape for validation and typing.                                  |
| **`label` default**           | Avoids boilerplate while keeping a display string.                                 |
| **Explicit reader `version`** | Lets migrations add new **`versions:`** keys without implicitly changing consumers |

---

## 9. Known limitations (informative)

| Topic                  | Notes                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Switch narrowing**   | Types treat `context.output` leaves as independent optionals; no discriminated union for switch branches.                                                      |
| **Sort / pagination**  | Not expressible on **`type: stream`** nodes in the current grammar.                                                                                            |
| **Graph existence**    | Some pipelines MAY not re-check that **`graph`** names a graph in the same deploy artifact; behavior is product-specific.                                      |
| **Partial workspace**  | Validating a single file without a workspace index can produce “missing stream / graph” diagnostics that disappear once the full merged workspace is supplied. |
| **Filter return type** | The reference **`type: stream`** executor coerces a non-object filter result to **`{}`** instead of failing the node.                                          |

---

## 10. Conformance tests

The normative rules in this spec are anchored to tests under [`packages/language/`](../../). Any change to the rules above MUST be reflected in (or break) the listed tests; any change to these tests MUST be reflected in the spec.

| Spec section                                                                                                         | Test source                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| §2.1 surface syntax, §2.2 fields, §5 `label` default, §7 `StreamDecl`                                                | [`stream/parser.test.ts`](./parser.test.ts)                                                               |
| §6.1 `stream` block validation (duplicate names, undefined `graph`, missing `prepare` / `schema`, empty `condition`) | [`stream/validator.test.ts`](./validator.test.ts)                                                         |
| §4.2 / §6.3 `type: stream` required keys; §4.3 rejected keys; stream-name resolution                                 | [`../validator.test.ts`](../validator.test.ts) — `stream node (read side)` describe block                 |
| §6.2 cross-file resolution of stream / graph names via workspace index                                               | [`../validator.test.ts`](../validator.test.ts) — `workspace-scoped stream node validation` describe block |
| §6.2 cross-file duplicate detection in the merged workspace index                                                    | [`../workspace/workspace-resources.test.ts`](../workspace/workspace-resources.test.ts)                    |
| End-to-end valid example exercising stream block + stream node                                                       | [`../__fixtures__/valid-stream.swirls`](../__fixtures__/valid-stream.swirls)                              |

Static typing of `condition` / `prepare` and `type: stream` node output (§3, §4.6) is exercised in the LSP layer ([`packages/lsp/src/ts-service/`](../../../lsp/src/ts-service/)). That layer is informative for this spec — the language package itself does not encode TypeScript generation.

---

## 11. Related language features

- **Graph-level `persistence`:** Distinct from top-level **`stream`** blocks.
- **`schema` blocks:** Shared JSON Schema declarations; may be referenced from **`stream` `versions:`** bodies via **`schema: <name>`**.
