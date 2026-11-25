import { utf8Text } from '../bytes'
import type { SkillMdFrontmatter } from './types'

function parseFrontmatterText(frontmatter: string): SkillMdFrontmatter {
  const out: SkillMdFrontmatter = {}

  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const colon = trimmed.indexOf(':')

    if (colon === -1) {
      continue
    }

    const key = trimmed.slice(0, colon).trim().toLowerCase()
    let value = trimmed.slice(colon + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key === 'name' && out.name === undefined) {
      out.name = value
    }

    if (key === 'description' && out.description === undefined) {
      out.description = value
    }
  }

  return out
}

/**
 * Read optional `name` and `description` from SKILL.md YAML frontmatter.
 */
export function parseSkillMdFrontmatter(input: Uint8Array | string): SkillMdFrontmatter {
  const text = typeof input === 'string' ? input : utf8Text(input)
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)

  if (!match?.[1]) {
    return {}
  }

  return parseFrontmatterText(match[1])
}
