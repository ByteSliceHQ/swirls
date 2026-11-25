import { sha256Hex } from '../sha256'
import type { SkillFileEntry } from './types'

/**
 * Content-addressed checksum: sha256 over sorted `(relativePath, sha256(bytes))`
 * lines. File mode is excluded.
 */
export function computeSkillChecksum(files: SkillFileEntry[]): string {
  const lines = [...files]
    .map((file) => {
      const path = file.path.replace(/\\/g, '/')
      return `${path}\t${sha256Hex(file.bytes)}`
    })
    .sort((a, b) => a.localeCompare(b))

  return sha256Hex(lines.join('\n'))
}
