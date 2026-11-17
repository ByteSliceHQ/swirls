/**
 * Validation for `connector` blocks.
 *
 * Reference resolution (channels pointing at a `connector` block via
 * `connector:`) lives in the channel validator, mirroring how `connection:`
 * resolution is checked there.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'
import type { Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(
  name: string,
  range: SourceRange,
  kind: string,
): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)
  if (result.success) {
    return []
  }
  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

/**
 * Validates `connector` blocks: handle format and unique names. Reference
 * resolution (channels pointing at a connector block) is handled by the channel
 * validator.
 */
export function validateConnectorBlocks(
  ast: SwirlsFile,
  _options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.connector ?? []
  const names = new Set<string>()

  for (const c of blocks) {
    out.push(...validateResourceName(c.name, c.range, 'Connector block'))

    if (names.has(c.name)) {
      out.push(diag(`Duplicate connector block name "${c.name}"`, c.range))
    }
    names.add(c.name)
  }

  return out
}
