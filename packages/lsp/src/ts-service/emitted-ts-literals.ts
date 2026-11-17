/**
 * Type strings embedded in virtual TS documents for @ts blocks.
 * Use index signatures instead of lib utility types like Record so the checker
 * does not need default lib resolution (bundled LSP / extension contexts).
 */
export const EMBEDDED_OPEN_OBJECT = '{ [key: string]: unknown }' as const

export const EMBEDDED_EMPTY_SECRETS = '{ [key: string]: never }' as const

/** Runtime file handle shape (`kind: swirls.file`); mirrors `@swirls/definition/file-values`. */
export const SWIRLS_FILE_HANDLE_TS =
  "{ kind: 'swirls.file'; id: string; mediaType: string; name: string; size: number; sha256?: string }" as const
