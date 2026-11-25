import type { SwirlsFile } from '@swirls/language'

import { canonicalizeForStableJson } from './canonical-json'
import { sha256Hex } from './sha256'

/**
 * SHA-256 hex digest of the stripped Swirls AST (post-`stripEditorMetadata`),
 * before UUID assignment in `buildDeploymentDefinitionPayload`.
 * Identical `.swirls` semantics produce the same hash.
 */
export function computeDefinitionHash(stripped: SwirlsFile): string {
  const payload = canonicalizeForStableJson(stripped) as SwirlsFile
  return sha256Hex(JSON.stringify(payload))
}
