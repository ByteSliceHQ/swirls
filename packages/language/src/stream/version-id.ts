/**
 * Stream DSL version keys under `versions { vN { ... } }` and reader `version: vN`.
 * Normative pattern: {@link STREAM_VERSION_ID_PATTERN}.
 */

/** Matches `v1`, `v2`, … (no `v0`). */
const STREAM_VERSION_ID_PATTERN = /^v[1-9][0-9]*$/

export function isValidStreamVersionId(id: string): boolean {
  return STREAM_VERSION_ID_PATTERN.test(id)
}
