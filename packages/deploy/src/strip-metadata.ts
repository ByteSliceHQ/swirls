/**
 * Recursively strip `range`, `innerRange`, `flowRange`, `inputSchemaBlock`,
 * `outputSchemaBlock`, `schemaBlock`, and `docComment` fields from an AST value.
 * These are editor/LSP-only metadata and not meaningful for deployment.
 */
export function stripEditorMetadata(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(stripEditorMetadata)
  }

  if (typeof value === 'object') {
    const stripped: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === 'range' ||
        key === 'innerRange' ||
        key === 'flowRange' ||
        key === 'inputSchemaBlock' ||
        key === 'outputSchemaBlock' ||
        key === 'schemaBlock' ||
        key === 'docComment' ||
        key === 'sourcePath' ||
        key === 'sourcePathRange' ||
        key === 'pathRange' ||
        key === 'databaseRange' ||
        key === 'nameRange' ||
        key === 'accentRange' ||
        key === 'logoRange' ||
        key === 'schemas' ||
        key === 'schemaRef' ||
        key === 'schemaRefRange' ||
        key === 'inputSchemaRef' ||
        key === 'inputSchemaRefRange' ||
        key === 'outputSchemaRef' ||
        key === 'outputSchemaRefRange' ||
        key === 'visibilityRange'
      ) {
        continue
      }

      stripped[key] = stripEditorMetadata(val)
    }

    return stripped
  }

  return value
}
