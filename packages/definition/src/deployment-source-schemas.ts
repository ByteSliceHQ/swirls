import { z } from 'zod'

export const deploymentSourcePositionSchema = z.object({
  line: z.number().int().min(0),
  column: z.number().int().min(0),
  offset: z.number().int().min(0),
})

export const deploymentSourceRangeSchema = z.object({
  start: deploymentSourcePositionSchema,
  end: deploymentSourcePositionSchema,
})

export const deploymentSourceFileContentSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string().length(64),
})

export const deploymentSourceFileManifestSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  r2Key: z.string().optional(),
})

export const deploymentSourceResourceKindSchema = z.enum([
  'schema',
  'form',
  'webhook',
  'schedule',
  'workflow',
  'stream',
  'view',
  'trigger',
  'secret',
  'auth',
  'postgres',
  'database',
  'migration',
  'disk',
  'skill',
  'agent',
  'decision',
  'mcp',
  'network',
  'channel',
  'connection',
  'connector',
  'action',
  /** Bespoke OpenUI-backed interfaces (`app`, RFC 0022). Also present on
   * historical manifests from the short-lived RFC 0015 generative app. */
  'app',
])

export const deploymentSourceResourceLocationSchema = z.object({
  kind: deploymentSourceResourceKindSchema,
  id: z.uuid(),
  name: z.string(),
  path: z.string().min(1),
  range: deploymentSourceRangeSchema,
})

export const deploymentSourceNodeLocationSchema = z.object({
  workflowId: z.uuid(),
  workflowName: z.string(),
  nodeId: z.uuid(),
  nodeName: z.string(),
  path: z.string().min(1),
  range: deploymentSourceRangeSchema,
})

export const deploymentSourceManifestSchema = z.object({
  version: z.literal(1),
  files: z.array(deploymentSourceFileManifestSchema),
  resources: z.array(deploymentSourceResourceLocationSchema),
  nodes: z.array(deploymentSourceNodeLocationSchema),
  sourceFingerprint: z.string().length(64),
})

/** UI-facing source jump target (path + optional 1-based line). */
export type DeploymentSourceUiLocation = {
  path: string
  line?: number
}

export const deploymentSkillFileEntrySchema = z.object({
  path: z.string().min(1),
  contentBase64: z.string().min(1),
  size: z.number().int().nonnegative(),
})

export const deploymentSkillFilesBundleSchema = z.object({
  /** On-disk directory name under `.agents/skills/`. */
  skillName: z.string().min(1),
  /** Swirls `skill` block handle for error messages. */
  blockName: z.string().min(1),
  files: z.array(deploymentSkillFileEntrySchema).min(1),
})

export type DeploymentSkillFileEntry = z.infer<typeof deploymentSkillFileEntrySchema>
export type DeploymentSkillFilesBundle = z.infer<typeof deploymentSkillFilesBundleSchema>

export type DeploymentSourceFileContent = z.infer<typeof deploymentSourceFileContentSchema>
export type DeploymentSourceFileManifest = z.infer<typeof deploymentSourceFileManifestSchema>
export type DeploymentSourceManifest = z.infer<typeof deploymentSourceManifestSchema>
export type DeploymentSourceResourceKind = z.infer<typeof deploymentSourceResourceKindSchema>
