/**
 * AST types for top-level `skill name { }` blocks referenced by `agent.skills:`.
 */

import type { SourceRange } from '../ast'

export interface SkillDecl {
  /** Swirls block handle (`^[a-zA-Z0-9_]+$`). */
  name: string
  /** On-disk skill slug under `.agents/skills/<skillName>/`. */
  skillName: string
  skillNameRange: SourceRange
  docComment?: string
  range: SourceRange
}
