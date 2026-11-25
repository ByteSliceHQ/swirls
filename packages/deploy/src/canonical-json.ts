/**
 * Recursively sort object keys for deterministic JSON serialization.
 * Arrays preserve element order (callers pre-sort when order is not semantic).
 */
export function canonicalizeForStableJson(value: unknown): unknown {
  if (value === null) {
    return null
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map((v) => canonicalizeForStableJson(v))
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const out: Record<string, unknown> = {}

    for (const k of keys) {
      const v = obj[k]

      if (v === undefined) {
        continue
      }

      out[k] = canonicalizeForStableJson(v)
    }

    return out
  }

  return value
}
