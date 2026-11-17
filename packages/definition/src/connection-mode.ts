/**
 * Shared connection mode helpers for managed (Fabric OAuth) vs self-managed
 * (base_url + vault auth) connections.
 */

export type ConnectionSelfManagedFields = {
  baseUrl?: string | null
  authRef?: string | null
}

/** True when the connection uses vault-backed credentials instead of Fabric OAuth. */
export function isSelfManagedConnectionBlock(
  block: ConnectionSelfManagedFields,
): boolean {
  return Boolean(block.baseUrl && block.authRef)
}

/** True when only one of baseUrl or authRef is set (invalid partial state). */
export function hasPartialSelfManagedFields(
  block: ConnectionSelfManagedFields,
): boolean {
  return Boolean(block.baseUrl) !== Boolean(block.authRef)
}

/** User-facing error when base_url and auth must appear together. */
export function connectionModePairError(
  connectionName: string,
  baseUrl?: string | null,
  authRef?: string | null,
): string | undefined {
  if (hasPartialSelfManagedFields({ baseUrl, authRef })) {
    return `Connection "${connectionName}" self-managed mode requires both base_url and auth (or neither for managed OAuth).`
  }
  return undefined
}
