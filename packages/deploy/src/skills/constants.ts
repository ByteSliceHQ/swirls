/** Canonical skills root relative to the project directory. */
export const AGENTS_SKILLS_DIR = '.agents/skills'

export const SKILL_MD_FILENAME = 'SKILL.md'

/** ≤ 1 MB per file. */
export const MAX_SKILL_FILE_BYTES = 1 * 1024 * 1024

/** ≤ 5 MB per skill tree. */
export const MAX_SKILL_TREE_BYTES = 5 * 1024 * 1024

/** ≤ 200 files per skill tree. */
export const MAX_SKILL_FILES = 200

const SCRIPT_EXTENSIONS = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.pl',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.jsx',
  '.tsx',
  '.go',
  '.rs',
  '.php',
  '.ps1',
  '.bat',
  '.cmd',
])

export function isKnownScriptExtension(relativePath: string): boolean {
  const lower = relativePath.toLowerCase()

  for (const ext of SCRIPT_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true
    }
  }

  return false
}

export function isScriptsOrBinDirectory(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.some((part) => part === 'scripts' || part === 'bin')
}
