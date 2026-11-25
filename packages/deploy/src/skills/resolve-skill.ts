import { isAbsolute, join, normalize, relative } from 'pathe'

import {
  AGENTS_SKILLS_DIR,
  MAX_SKILL_FILE_BYTES,
  MAX_SKILL_FILES,
  MAX_SKILL_TREE_BYTES,
  SKILL_MD_FILENAME,
} from './constants'
import type { SkillDeployFs } from './skill-fs'
import type { SkillFileEntry } from './types'
import { assertValidSkillSlug } from './validate-skill-slug'

function skillRootPath(projectRoot: string, skillName: string): string {
  return join(projectRoot, AGENTS_SKILLS_DIR, skillName)
}

function assertContained(skillRoot: string, absolutePath: string): void {
  const rel = relative(skillRoot, absolutePath)

  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return
  }

  throw new Error(
    `Skill path "${relative(skillRoot, absolutePath) || absolutePath}" escapes the skill directory`,
  )
}

function collectSkillFilesRecursive(
  fs: SkillDeployFs,
  skillRoot: string,
  absoluteDir: string,
  acc: SkillFileEntry[],
  totals: { bytes: number; count: number },
): void {
  assertContained(skillRoot, absoluteDir)

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = join(absoluteDir, entry.name)
    assertContained(skillRoot, absolutePath)

    const stat = fs.lstatSync(absolutePath)

    if (stat.isSymbolicLink) {
      throw new Error(
        `Skill tree must not contain symlinks (found at "${relative(skillRoot, absolutePath)}")`,
      )
    }

    if (stat.isDirectory) {
      collectSkillFilesRecursive(fs, skillRoot, absolutePath, acc, totals)
      continue
    }

    if (!stat.isFile) {
      continue
    }

    const bytes = fs.readFileBuffer(absolutePath)
    const relPath = relative(skillRoot, absolutePath).replace(/\\/g, '/')

    if (bytes.byteLength > MAX_SKILL_FILE_BYTES) {
      throw new Error(`Skill file "${relPath}" exceeds ${MAX_SKILL_FILE_BYTES} bytes`)
    }

    totals.bytes += bytes.byteLength

    if (totals.bytes > MAX_SKILL_TREE_BYTES) {
      throw new Error(`Skill tree exceeds ${MAX_SKILL_TREE_BYTES} bytes total`)
    }

    totals.count += 1

    if (totals.count > MAX_SKILL_FILES) {
      throw new Error(`Skill tree exceeds ${MAX_SKILL_FILES} files`)
    }

    acc.push({
      path: relPath,
      bytes,
    })
  }
}

/**
 * Walk `.agents/skills/<skillName>/`, require `SKILL.md`, reject symlinks and
 * path escape, and enforce size/file-count caps.
 */
export function resolveSkillTree(
  fs: SkillDeployFs,
  projectRoot: string,
  skillName: string,
): SkillFileEntry[] {
  const trimmed = skillName.trim()

  if (!trimmed) {
    throw new Error('Skill name must be non-empty')
  }

  assertValidSkillSlug(trimmed)

  const skillRoot = normalize(skillRootPath(projectRoot, trimmed))
  const totals = { bytes: 0, count: 0 }
  const files: SkillFileEntry[] = []

  try {
    collectSkillFilesRecursive(fs, skillRoot, skillRoot, files, totals)
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      throw new Error(`Skill "${trimmed}" not found under ${AGENTS_SKILLS_DIR}/${trimmed}/`, {
        cause: err,
      })
    }

    throw err
  }

  if (files.length === 0) {
    throw new Error(`Skill "${trimmed}" not found under ${AGENTS_SKILLS_DIR}/${trimmed}/`)
  }

  const hasSkillMd = files.some((f) => f.path === SKILL_MD_FILENAME)

  if (!hasSkillMd) {
    throw new Error(`Skill "${trimmed}" is missing required ${SKILL_MD_FILENAME}`)
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}
