/** Reject skill directory slugs that escape `.agents/skills/<name>/`. */
export function assertValidSkillSlug(skillName: string): void {
  const trimmed = skillName.trim()

  if (!trimmed) {
    throw new Error('Skill name must be non-empty')
  }

  if (trimmed !== skillName) {
    throw new Error('Skill name must not have leading or trailing whitespace')
  }

  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`Skill name "${trimmed}" is not a valid path segment`)
  }

  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error(`Skill name "${trimmed}" must be a single path segment (no "/", "\\", or "..")`)
  }
}
