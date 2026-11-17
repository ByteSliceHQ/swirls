/**
 * Validation for `skill` blocks and `agent.skills:` references.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'

import type { AgentDecl, AgentProfileDecl } from '../agent/ast'
import type { Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type { SkillDecl } from './ast'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(name: string, range: SourceRange, kind: string): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)

  if (result.success) {
    return []
  }

  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

export function validateSkillBlocks(
  ast: SwirlsFile,
  _options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.skill ?? []
  const names = new Set<string>()

  for (const s of blocks) {
    out.push(...validateResourceName(s.name, s.range, 'Skill block'))

    if (!s.skillName?.trim()) {
      out.push(diag('Skill block requires name: "..."', s.range))
    } else {
      const slug = s.skillName
      const trimmed = slug.trim()

      if (trimmed !== slug) {
        out.push(
          diag(
            `Skill block "${s.name}": name: "${slug}" must not have leading or trailing whitespace`,
            s.skillNameRange,
          ),
        )
      } else if (
        trimmed === '.' ||
        trimmed === '..' ||
        trimmed.includes('/') ||
        trimmed.includes('\\') ||
        trimmed.includes('..')
      ) {
        out.push(
          diag(
            `Skill block "${s.name}": name: "${slug}" must be a single path segment (no "/", "\\", or "..")`,
            s.skillNameRange,
          ),
        )
      }
    }

    if (names.has(s.name)) {
      out.push(diag(`Duplicate skill block name "${s.name}"`, s.range))
    }

    names.add(s.name)
  }

  return out
}

function skillBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, SkillDecl> {
  const m = new Map<string, SkillDecl>()

  for (const s of ast.skill ?? []) {
    m.set(s.name, s)
  }

  if (workspace?.skillBlocks) {
    for (const [name, decl] of workspace.skillBlocks) {
      m.set(name, decl)
    }
  }

  return m
}

export function validateAgentSkillRefs(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const skillByName = skillBlockMap(ast, options?.workspace)

  function validateSkillList(
    skillNames: string[] | undefined,
    ranges: SourceRange[] | undefined,
    at: SourceRange,
    context: string,
  ) {
    for (let i = 0; i < (skillNames ?? []).length; i++) {
      const skillName = skillNames![i]!
      const listRange = ranges?.[i] ?? at

      if (!skillByName.has(skillName)) {
        out.push(diag(`${context} references undefined skill block "${skillName}"`, listRange))
      }
    }
  }

  function validateProfileSkills(agent: AgentDecl, profile: AgentProfileDecl) {
    const agentSkillSet = new Set(agent.skills ?? [])

    for (let i = 0; i < (profile.skills ?? []).length; i++) {
      const skillName = profile.skills![i]!
      const listRange = profile.skillsRanges?.[i] ?? profile.range

      if (!agentSkillSet.has(skillName)) {
        out.push(
          diag(
            `Profile "${profile.name}" skill "${skillName}" is not listed on agent "${agent.name}" skills:`,
            listRange,
          ),
        )
      }
    }
  }

  for (const a of ast.agent ?? []) {
    validateSkillList(a.skills, a.skillsRanges, a.range, `Agent "${a.name}"`)

    for (const profile of a.profiles ?? []) {
      validateProfileSkills(a, profile)
    }
  }

  return out
}
