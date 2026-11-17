import { SWIRLS_FILE_REF } from '@swirls/definition/file-values'

import { EMBEDDED_OPEN_OBJECT, SWIRLS_FILE_HANDLE_TS } from './emitted-ts-literals'

/**
 * Synchronous JSON Schema → TypeScript type string for LSP preamble generation.
 * Supports the subset used in Swirls node schemas: type, properties, required, items, nested objects.
 */

type JsonSchemaLiteral = Record<string, unknown>

type JsonSchemaToTsOptions = {
  root: JsonSchemaLiteral
  visiting: Set<string>
}

function isObjectSchema(schema: JsonSchemaLiteral): schema is Record<string, unknown> {
  return typeof schema === 'object' && schema !== null && !Array.isArray(schema)
}

function schemaType(schema: JsonSchemaLiteral): string | string[] | undefined {
  const t = schema.type

  if (typeof t === 'string') {
    return t
  }

  if (Array.isArray(t)) {
    return t
  }

  return undefined
}

function getProperties(schema: JsonSchemaLiteral): Record<string, JsonSchemaLiteral> | undefined {
  const properties = schema.properties

  if (isObjectSchema(properties as JsonSchemaLiteral)) {
    return properties as Record<string, JsonSchemaLiteral>
  }

  return undefined
}

function getRequired(schema: JsonSchemaLiteral): string[] | undefined {
  const required = schema.required

  if (Array.isArray(required) && required.every((x) => typeof x === 'string')) {
    return required as string[]
  }

  return undefined
}

function getItems(schema: JsonSchemaLiteral): JsonSchemaLiteral | undefined {
  const items = schema.items

  if (isObjectSchema(items as JsonSchemaLiteral)) {
    return items as JsonSchemaLiteral
  }

  return undefined
}

function getDefs(schema: JsonSchemaLiteral): Record<string, JsonSchemaLiteral> | undefined {
  const defs = schema.$defs

  if (!isObjectSchema(defs as JsonSchemaLiteral)) {
    return undefined
  }

  return defs as Record<string, JsonSchemaLiteral>
}

function resolveSchemaRef(
  schema: JsonSchemaLiteral,
  options: JsonSchemaToTsOptions,
): string | undefined {
  const ref = schema.$ref

  if (typeof ref !== 'string') {
    return undefined
  }

  if (ref === SWIRLS_FILE_REF) {
    return SWIRLS_FILE_HANDLE_TS
  }

  const match = ref.match(/^#\/\$defs\/(.+)$/)

  if (!match) {
    return undefined
  }

  const defName = match[1]

  if (!defName || options.visiting.has(defName)) {
    return EMBEDDED_OPEN_OBJECT
  }

  const defs = getDefs(options.root)
  const target = defs?.[defName]

  if (!target || !isObjectSchema(target)) {
    return 'unknown'
  }

  options.visiting.add(defName)
  const resolved = jsonSchemaToTsType(target, options)
  options.visiting.delete(defName)
  return resolved
}

const literalType = (value: unknown): string | undefined => {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return JSON.stringify(value)
  }

  return undefined
}

/**
 * Convert a JSON Schema object to a TypeScript type string.
 * Handles: type (string, number, integer, boolean, object, array), properties, required, items.
 */
export function jsonSchemaToTsType(
  schema: JsonSchemaLiteral,
  options?: JsonSchemaToTsOptions,
): string {
  if (!isObjectSchema(schema)) {
    return 'unknown'
  }

  const resolvedOptions: JsonSchemaToTsOptions = options ?? {
    root: schema,
    visiting: new Set<string>(),
  }

  const refType = resolveSchemaRef(schema, resolvedOptions)

  if (refType !== undefined) {
    return refType
  }

  if (Object.hasOwn(schema, 'const')) {
    const literal = literalType(schema.const)

    if (literal !== undefined) {
      return literal
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const literals = schema.enum.map(literalType)

    if (literals.every((value): value is string => value !== undefined)) {
      return literals.join(' | ')
    }
  }

  const type = schemaType(schema)
  const types = typeof type === 'string' ? [type] : Array.isArray(type) ? type : []

  if (types.length === 0) {
    const properties = getProperties(schema)

    if (properties && Object.keys(properties).length > 0) {
      return schemaObjectToTs(properties, getRequired(schema), resolvedOptions)
    }

    return 'unknown'
  }

  if (types.length > 1) {
    const parts = types.map((t) => singleTypeToTs(schema, t, resolvedOptions))
    return parts.join(' | ')
  }

  const single = types[0]
  return single !== undefined ? singleTypeToTs(schema, single, resolvedOptions) : 'unknown'
}

function singleTypeToTs(
  schema: JsonSchemaLiteral,
  type: string,
  options: JsonSchemaToTsOptions,
): string {
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'

    case 'object': {
      const properties = getProperties(schema)

      if (properties && Object.keys(properties).length > 0) {
        return schemaObjectToTs(properties, getRequired(schema), options)
      }

      return EMBEDDED_OPEN_OBJECT
    }

    case 'array': {
      const items = getItems(schema)
      const itemType = items ? jsonSchemaToTsType(items, options) : 'unknown'
      return itemType.includes(' | ') ? `(${itemType})[]` : `${itemType}[]`
    }

    default:
      return 'unknown'
  }
}

function schemaObjectToTs(
  properties: Record<string, JsonSchemaLiteral>,
  required: string[] | undefined,
  options: JsonSchemaToTsOptions,
): string {
  const requiredSet = new Set(required ?? [])

  const entries = Object.entries(properties)
    .filter(([, s]) => isObjectSchema(s))
    .map(([key, s]) => {
      const tsType = jsonSchemaToTsType(s, options)
      const optional = requiredSet.has(key) ? '' : '?'
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : JSON.stringify(key)
      return `${safeKey}${optional}: ${tsType}`
    })

  return `{ ${entries.join('; ')} }`
}
