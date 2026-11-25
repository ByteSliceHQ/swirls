export interface SkillFileEntry {
  /** Path relative to the skill root, posix separators. */
  path: string
  bytes: Uint8Array
}

export interface SkillBundle {
  /** On-disk skill slug (directory name under `.agents/skills/`). */
  skillName: string
  files: SkillFileEntry[]
}

export type SkillClassificationResult =
  | { kind: 'knowledge' }
  | { kind: 'executable'; triggerFile: string }

export interface SkillMdFrontmatter {
  name?: string
  description?: string
}

export interface DeploymentSkillFilePayload {
  path: string
  contentBase64: string
  size: number
}

export interface DeploymentSkillFilesBundle {
  /** Swirls `skill` block handle. */
  blockName: string
  skillName: string
  files: DeploymentSkillFilePayload[]
}

export interface SkillBlockRef {
  /** Swirls block handle (`skill <name>`). */
  name: string
  /** On-disk slug under `.agents/skills/<skillName>/`. */
  skillName: string
}
