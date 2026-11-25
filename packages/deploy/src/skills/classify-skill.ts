import { isKnownScriptExtension, isScriptsOrBinDirectory, SKILL_MD_FILENAME } from './constants'
import type { SkillClassificationResult, SkillFileEntry } from './types'

function hasShebang(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21
}

/**
 * Classify a resolved skill tree as knowledge-only or executable.
 * Deterministic signals: shebang, script extension, scripts/bin path segment.
 * File mode bits are intentionally excluded for cross-OS consistency.
 */
export function classifySkillBundle(files: SkillFileEntry[]): SkillClassificationResult {
  for (const file of files) {
    const path = file.path.replace(/\\/g, '/')

    if (path !== SKILL_MD_FILENAME && isScriptsOrBinDirectory(path)) {
      return { kind: 'executable', triggerFile: path }
    }

    if (isKnownScriptExtension(path)) {
      return { kind: 'executable', triggerFile: path }
    }

    if (hasShebang(file.bytes)) {
      return { kind: 'executable', triggerFile: path }
    }
  }

  return { kind: 'knowledge' }
}
