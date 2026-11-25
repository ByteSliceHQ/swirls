import { base64 } from '../bytes'
import { resolveSkillTree } from './resolve-skill'
import type { SkillDeployFs } from './skill-fs'
import type { DeploymentSkillFilesBundle, SkillBlockRef } from './types'

/**
 * Resolve each referenced skill block to its local tree for the deploy payload.
 * Does not compute checksums — the server content-addresses received bytes.
 */
export function collectDeploymentSkillFiles(
  fs: SkillDeployFs,
  cwd: string,
  skillBlocks: SkillBlockRef[],
): DeploymentSkillFilesBundle[] {
  const seen = new Set<string>()
  const bundles: DeploymentSkillFilesBundle[] = []

  for (const block of skillBlocks) {
    const skillName = block.skillName.trim()

    if (!skillName) {
      throw new Error(`Skill block "${block.name}" requires a non-empty skill name`)
    }

    if (seen.has(block.name)) {
      continue
    }

    seen.add(block.name)

    const files = resolveSkillTree(fs, cwd, skillName)

    bundles.push({
      blockName: block.name,
      skillName,
      files: files.map((file) => ({
        path: file.path,
        contentBase64: base64(file.bytes),
        size: file.bytes.byteLength,
      })),
    })
  }

  return bundles.sort((a, b) => a.skillName.localeCompare(b.skillName))
}

export function collectReferencedSkillBlocksFromAst(ast: {
  skill?: SkillBlockRef[]
  agent?: Array<{
    skills?: string[]
    profiles?: Array<{ skills?: string[] }>
  }>
}): SkillBlockRef[] {
  const byName = new Map((ast.skill ?? []).map((s) => [s.name, s]))
  const needed = new Set<string>()

  for (const agent of ast.agent ?? []) {
    for (const name of agent.skills ?? []) {
      needed.add(name)
    }

    for (const profile of agent.profiles ?? []) {
      for (const name of profile.skills ?? []) {
        needed.add(name)
      }
    }
  }

  const blocks: SkillBlockRef[] = []

  for (const name of needed) {
    const block = byName.get(name)

    if (block) {
      blocks.push(block)
    }
  }

  return blocks
}
