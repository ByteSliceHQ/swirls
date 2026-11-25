import type { DeploymentDefinitionOperationBlock } from '@swirls/definition/deployment-definition'
import type { OperationDecl } from '@swirls/language'

import { sha256Hex } from './sha256'

/** How long an operation may run when it sets no `timeout`. */
const DEFAULT_TIMEOUT_SECONDS = 300

/**
 * The hash a signed dispatch commits to: SHA-256 of the script's UTF-8
 * bytes. The API recomputes this on ingest and the daemon recomputes it
 * before running, so all three sides hash the same bytes.
 */
export function operationScriptSha256(script: string): string {
  return sha256Hex(script)
}

/**
 * Turn a parsed `operation` block into what a deployment carries. The script
 * is taken as written (an inline block already has its indentation removed,
 * a file is read byte for byte) and hashed here.
 */
export function compileOperationBlock(
  operation: OperationDecl,
): Omit<DeploymentDefinitionOperationBlock, 'id'> {
  const script = operation.command?.script

  if (operation.command === undefined || script === undefined) {
    // The validator requires a command, and bundling reads script files, so
    // this is a bundle built without one of those passes.
    throw new Error(
      `Operation "${operation.name}" has no script. Its command is missing or its file was not read.`,
    )
  }

  return {
    name: operation.name,
    label: operation.label ?? operation.name,
    ...(operation.description ? { description: operation.description } : {}),
    interpreter: operation.command.lang === 'ps' ? 'powershell' : 'sh',
    ...(operation.platform === 'windows' ||
    operation.platform === 'linux' ||
    operation.platform === 'macos'
      ? { platform: operation.platform }
      : {}),
    runAs: operation.runAs === 'signed_in_user' ? 'signed_in_user' : 'system',
    script,
    scriptSha256: operationScriptSha256(script),
    ...(operation.inputSchema ? { inputSchema: operation.inputSchema } : {}),
    ...(operation.outputSchema ? { outputSchema: operation.outputSchema } : {}),
    timeoutSeconds: operation.timeout ?? DEFAULT_TIMEOUT_SECONDS,
  }
}
