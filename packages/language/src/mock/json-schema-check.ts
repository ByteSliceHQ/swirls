/**
 * Lightweight JSON Schema payload checks for mock output / review formData.
 * Uses Ajv (strict: false) so author schemas with $ref siblings still compile.
 */

import Ajv from 'ajv'
import type { JsonSchemaLiteral } from '../ast'

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  removeAdditional: false,
})

export type SchemaCheckFailure = {
  path: string
  message: string
}

/**
 * Returns `null` when `value` satisfies `schema`, otherwise a short list of
 * field-level failures suitable for diagnostic messages.
 */
export function checkJsonSchemaPayload(
  schema: JsonSchemaLiteral,
  value: unknown,
): SchemaCheckFailure[] | null {
  let validate: ReturnType<typeof ajv.compile>
  try {
    validate = ajv.compile(schema as object)
  } catch (err) {
    return [
      {
        path: '',
        message: `invalid JSON Schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    ]
  }

  const ok = validate(value) as boolean
  if (ok) {
    return null
  }

  const failures: SchemaCheckFailure[] = []
  for (const error of validate.errors ?? []) {
    const missing =
      error.params &&
      typeof error.params === 'object' &&
      'missingProperty' in error.params &&
      typeof (error.params as { missingProperty?: unknown }).missingProperty ===
        'string'
        ? (error.params as { missingProperty: string }).missingProperty
        : undefined

    let path = error.instancePath.replace(/^\//, '').replace(/\//g, '.')
    if (!path && missing) {
      path = missing
    } else if (missing) {
      path = path ? `${path}.${missing}` : missing
    }

    failures.push({
      path,
      message: error.message ?? 'invalid value',
    })
  }

  return failures.length > 0
    ? failures
    : [{ path: '', message: 'does not match schema' }]
}

export function formatSchemaFailures(
  label: string,
  failures: SchemaCheckFailure[],
): string {
  const details = failures
    .slice(0, 5)
    .map((f) => (f.path ? `${f.path}: ${f.message}` : f.message))
    .join('; ')
  const more = failures.length > 5 ? ` (+${failures.length - 5} more)` : ''
  return `${label} does not match schema (${details}${more})`
}
