/**
 * AST types for identity-scoped access control: top-level `role` and `policy`
 * blocks. Declaring a policy with grants opts the deployment into
 * deny-by-default enforcement; without one, access stays open within the org.
 */

import type { FileRetention } from '@swirls/definition/file-values'
import type { SourceRange } from '../ast'

/**
 * One condition inside a role's `match { }` block. A scalar value is an
 * equality test (`op: 'eq'`); a list value is a membership test (`op: 'in'`).
 * Values are normalized to strings to mirror how they are compared as macaroon
 * caveats at execution-token mint time.
 */
export interface ClaimCondition {
  /** Verified principal attribute key, e.g. `department` or `org_role`. */
  claim: string
  claimRange: SourceRange
  op: 'eq' | 'in'
  /** Single value for `eq`; the allowed set for `in`. */
  values: string[]
  valueRange: SourceRange
  range: SourceRange
}

/**
 * `role <name> { match { <claim>: <value> } }` — derives a named role from
 * verified principal attributes. The claim keys referenced across all role
 * `match` blocks are the only attributes the policy engine ever reads.
 */
export interface RoleDecl {
  name: string
  description?: string
  descriptionRange?: SourceRange
  /** Conditions AND together. A role with no conditions matches no one. */
  match: ClaimCondition[]
  docComment?: string
  range: SourceRange
}

/**
 * `allow|deny <role> -> agent <name>|*` grant inside a `policy { }` block. The
 * grant attaches to a role name; the target is a declared agent block, or `*`
 * for every agent (expanded to concrete names at mint time). An omitted body
 * grants all of the agent's workflows and tools; `workflows`/`tools` narrow it.
 */
interface PolicyGrantBase {
  effect: 'allow' | 'deny'
  effectRange: SourceRange
  /** Name of a `role` block this grant applies to. */
  role: string
  roleRange: SourceRange
  agentRange: SourceRange
  /** Subset of the agent's workflows; undefined grants all. */
  workflows?: string[]
  workflowsRanges?: SourceRange[]
  /** Further narrowing within the granted workflows; undefined grants all. */
  tools?: string[]
  toolsRanges?: SourceRange[]
  range: SourceRange
}

export type PolicyGrant = PolicyGrantBase &
  ({ agent: string; workflow?: never } | { workflow: string; agent?: never })

/** File retention settings inside `policy { files { … } }`. */
export interface FilePolicySettings {
  retention: FileRetention
  retentionRange: SourceRange
  range: SourceRange
}

/** `policy { allow <role> -> agent <name> { … } }` — grants attached to roles. */
export interface PolicyDecl {
  grants: PolicyGrant[]
  /** Workspace file-value settings (`files { retention: … }`). */
  files?: FilePolicySettings
  docComment?: string
  range: SourceRange
}
