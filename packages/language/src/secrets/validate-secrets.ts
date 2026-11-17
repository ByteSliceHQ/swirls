/**
 * Secret-block validation helpers extracted from the main validator so
 * managed / vendor-key rules stay focused and the root validator stays smaller.
 */

import {
  getInferredVendorKeyForNode,
  MANAGEABLE_VENDOR_KEY_SET,
} from '@swirls/definition/secrets/vendor-keys'

import type { ConfigValue, Diagnostic, NodeDecl, SecretsDecl, SourceRange } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'

/** Matches project secret key rules (see docs/reference/secrets.md). */
export const SECRET_KEY_PATTERN = /^[a-zA-Z0-9_]+$/

type DiagFn = (message: string, range: SourceRange, severity?: 'error' | 'warning') => Diagnostic

/**
 * Validate that every var in a `type: managed` secret block is a known
 * manageable platform key.
 */
export function validateManagedSecretBlock(block: SecretsDecl, diag: DiagFn): Diagnostic[] {
  if (block.type !== 'managed') {
    return []
  }

  const out: Diagnostic[] = []

  for (const v of block.vars) {
    if (!SECRET_KEY_PATTERN.test(v)) {
      continue
    }

    if (!MANAGEABLE_VENDOR_KEY_SET.has(v)) {
      out.push(
        diag(
          `Managed secret block "${block.name}" var "${v}" is not a manageable platform key (allowed: ${[...MANAGEABLE_VENDOR_KEY_SET].join(', ')})`,
          block.range,
        ),
      )
    }
  }

  return out
}

/**
 * Build var name → first secret block that declares it (for vendor-key
 * declaration checks). Includes workspace secrets when provided.
 */
export function collectDeclaredVendorVars(
  secretsBlocks: readonly SecretsDecl[],
  workspace?: WorkspaceResourceIndex | null,
): Map<string, string> {
  const declaredVendorVars = new Map<string, string>()

  for (const s of secretsBlocks) {
    for (const v of s.vars) {
      if (MANAGEABLE_VENDOR_KEY_SET.has(v) && !declaredVendorVars.has(v)) {
        declaredVendorVars.set(v, s.name)
      }
    }
  }

  if (workspace?.secrets) {
    for (const [blockName, entry] of workspace.secrets) {
      for (const v of entry.vars) {
        if (MANAGEABLE_VENDOR_KEY_SET.has(v) && !declaredVendorVars.has(v)) {
          declaredVendorVars.set(v, blockName)
        }
      }
    }
  }

  return declaredVendorVars
}

/** Coerce DSL config fields into a plain object for vendor-key inference. */
export function configFieldsForVendorInference(
  configFields: Record<string, ConfigValue> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(configFields ?? {}).map(([k, cv]) => {
      if (cv.kind === 'string') {
        return [k, cv.value]
      }

      return [k, undefined]
    }),
  )
}

/**
 * Warn when a node implies a vendor key that no secret block declares.
 */
export function validateInferredVendorKeyDeclaration(
  node: NodeDecl,
  declaredVendorVars: ReadonlyMap<string, string>,
  diag: DiagFn,
): Diagnostic[] {
  const inferredVendorKey = getInferredVendorKeyForNode({
    type: node.type,
    config: configFieldsForVendorInference(node.configFields),
  })

  if (!inferredVendorKey || declaredVendorVars.has(inferredVendorKey)) {
    return []
  }

  return [
    diag(
      `Node "${node.name}" (${node.type}) requires vendor key "${inferredVendorKey}" but no secret block declares it. Add a secret block with vars: [${inferredVendorKey}] (use type: managed for Enterprise platform keys).`,
      node.range,
      'warning',
    ),
  ]
}
