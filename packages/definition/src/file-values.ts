/**
 * File values: schema-marked fields whose runtime representation is a JSON-safe
 * file handle (`kind: swirls.file`), never raw bytes. See
 * `wiki/features/workflows/file-values/SPEC.md`.
 */

import type { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

/** Discriminator on every file handle in workflow state. */
export const FILE_HANDLE_KIND = 'swirls.file' as const

/** Built-in JSON Schema $ref for file-valued fields (DSL bare name and $ref). */
export const SWIRLS_FILE_REF = 'swirls:file' as const

/** Platform caps (v1; not author-configured). */
export const FILE_VALUE_MAX_BYTES = 25 * 1024 * 1024
export const FILE_GRANT_MAX_BYTES = 100 * 1024 * 1024
export const FILE_GRANT_MAX_FILES = 10
export const FILE_PROJECT_MAX_BYTES = 1024 * 1024 * 1024

export const fileUploadGrantPurposeSchema = z.enum([
  'workflow_input',
  'review',
  'form',
  'cli',
  'chat',
  'execution',
])

export type FileUploadGrantPurpose = z.infer<typeof fileUploadGrantPurposeSchema>

/** Text-presentable contentMediaType values (dual-mode: string or handle). */
export const TEXT_PRESENTABLE_MEDIA_TYPES = ['text/plain', 'text/html', 'text/markdown'] as const

export type TextPresentableMediaType = (typeof TEXT_PRESENTABLE_MEDIA_TYPES)[number]

const textPresentableMediaTypeSet = new Set<string>(TEXT_PRESENTABLE_MEDIA_TYPES)

export const fileHandleSchema = z
  .object({
    kind: z.literal(FILE_HANDLE_KIND),
    id: z.string().min(1),
    mediaType: z.string().min(1),
    name: z.string().min(1),
    size: z.number().int().nonnegative(),
    sha256: z.string().min(1).optional(),
  })
  .strict()

export type FileHandle = z.infer<typeof fileHandleSchema>

/** Forbidden handle fields that must never appear in workflow payloads. */
const FORBIDDEN_HANDLE_KEYS = [
  'bucket',
  'key',
  'bytes',
  'data',
  'url',
  'signedUrl',
  'signed_url',
] as const

export function isFileHandle(value: unknown): value is FileHandle {
  return fileHandleSchema.safeParse(value).success
}

/** A swirls.file object with kind and id but missing required metadata fields. */
export function isPartialFileHandle(
  value: unknown,
): value is { kind: typeof FILE_HANDLE_KIND; id: string } {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return record.kind === FILE_HANDLE_KIND && typeof record.id === 'string' && !isFileHandle(value)
}

export function isTextPresentableMediaType(
  mediaType: string,
): mediaType is TextPresentableMediaType {
  return textPresentableMediaTypeSet.has(mediaType)
}

/** Returns true when a JSON Schema node marks a file value field. */
export function schemaNodeMarksFileValue(schema: JSONSchema7): boolean {
  if (schema.$ref === SWIRLS_FILE_REF) {
    return true
  }

  if (typeof schema.contentMediaType === 'string' && schema.contentMediaType.length > 0) {
    return true
  }

  return false
}

/** Built-in JSON Schema fragment for `swirls:file` refs. */
export function swirlsFileJsonSchema(): JSONSchema7 {
  return {
    $id: SWIRLS_FILE_REF,
    type: 'object',
    required: ['kind', 'id', 'mediaType', 'name', 'size'],
    additionalProperties: false,
    properties: {
      kind: { type: 'string', const: FILE_HANDLE_KIND },
      id: { type: 'string', minLength: 1 },
      mediaType: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      size: { type: 'integer', minimum: 0 },
      sha256: { type: 'string', minLength: 1 },
    },
  }
}

export function assertFileHandleSafe(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return
  }

  const record = value as Record<string, unknown>

  if (record.kind !== FILE_HANDLE_KIND) {
    return
  }

  for (const key of FORBIDDEN_HANDLE_KEYS) {
    if (key in record) {
      throw new Error(`File handle must not include forbidden field "${key}"`)
    }
  }
}

/** File object lifecycle in the project bucket. */
export const fileObjectStatusSchema = z.enum(['pending', 'ready'])
export type FileObjectStatus = z.infer<typeof fileObjectStatusSchema>

/** `forever` or a day count from DSL `retention: 30d`. */
export const fileRetentionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('forever') }),
  z.object({ mode: z.literal('days'), days: z.number().int().positive() }),
])

export type FileRetention = z.infer<typeof fileRetentionSchema>

const RETENTION_DAYS_PATTERN = /^([0-9]+)d$/

/** Parse DSL retention literal (`30d` or bare `forever`). */
export function parseFileRetentionLiteral(literal: string): FileRetention | null {
  const trimmed = literal.trim()

  if (trimmed === 'forever') {
    return { mode: 'forever' }
  }

  const match = RETENTION_DAYS_PATTERN.exec(trimmed)
  const daysText = match?.[1]

  if (daysText === undefined) {
    return null
  }

  const days = Number(daysText)

  if (!Number.isSafeInteger(days) || days <= 0) {
    return null
  }

  return { mode: 'days', days }
}

export const FILE_RETENTION_SYNTAX_HINT = 'retention must be forever or a day count like 30d'

/** API: minted upload grant returned to clients. */
export const fileUploadGrantResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  expiresAt: z.string(),
  maxBytes: z.number().int().positive(),
  maxFiles: z.number().int().positive(),
})

export const initFileUploadResponseSchema = z.object({
  objectId: z.uuid(),
  uploadUrl: z.url(),
  expiresAt: z.string(),
})

export const previewFileResponseSchema = z.object({
  url: z.url(),
  expiresAt: z.string(),
})

/** Presigned PUT lifetime (seconds). */
export const FILE_UPLOAD_PRESIGN_SECONDS = 900

/** Preview signed GET lifetime (seconds). */
export const FILE_PREVIEW_PRESIGN_SECONDS = 60

/** Default upload grant TTL (seconds). */
export const FILE_UPLOAD_GRANT_TTL_SECONDS = 3600
