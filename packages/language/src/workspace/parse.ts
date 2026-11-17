import { join } from 'pathe'

import type { SwirlsFile } from '../ast'
import type { LanguageHost } from '../host'
import { inlineTsFileRefs } from '../inline-ts-file-refs'
import { parse } from '../parser'
import { validateTsFileRefs } from '../validate-ts-file-refs'
import { validate } from '../validator'
import { nodeWorkspaceFileSystem, type SwirlsWorkspaceFileSystem } from './sandbox'
import type { WorkspaceResourceIndex } from './workspace-resources'

/**
 * Reads, parses, and validates a `.swirls` file.
 *
 * Returns `null` if the file could not be read (caller may skip).
 * Throws on parse, validation, or @ts reference resolution errors.
 */
export function parseSwirlsFile(args: {
  cwd: string
  relativePath: string
  fileSystem?: SwirlsWorkspaceFileSystem
  /** When scanning multiple files (doctor, deploy, CLI), pass the workspace resource index. */
  workspace?: WorkspaceResourceIndex
  /** The runtime's provider catalog and `@openui` support, for its checks. */
  host?: LanguageHost
}): SwirlsFile | null {
  const { cwd, relativePath } = args
  const fileSystem = args.fileSystem ?? nodeWorkspaceFileSystem
  const fullPath = join(cwd, relativePath)

  let content: string

  try {
    content = fileSystem.readFileSync(fullPath, 'utf-8')
  } catch {
    return null
  }

  const result = parse(content)

  if (result.errors.length > 0) {
    const first = result.errors[0]
    throw new Error(
      `${relativePath}:${first?.range?.start?.line ?? 0}: Parse error: ${first?.message ?? 'Unknown'}`,
    )
  }

  const diagnostics = validate(result.ast, {
    workspace: args.workspace,
    host: args.host,
  })

  const blocking = diagnostics.filter((d) => d.severity === 'error')

  if (blocking.length > 0) {
    const first = blocking[0]

    if (first) {
      const pos = first.range?.start
      throw new Error(`${relativePath}:${pos?.line ?? 0}: Validation error: ${first.message}`)
    }
  }

  const refDiags = validateTsFileRefs(result.ast, {
    swirlsFilePath: fullPath,
    existsSync: fileSystem.existsSync,
  })

  const refBlocking = refDiags.filter((d) => d.severity === 'error')

  if (refBlocking.length > 0) {
    const first = refBlocking[0]

    if (first) {
      const pos = first.range?.start
      throw new Error(`${relativePath}:${pos?.line ?? 0}: ${first.message}`)
    }
  }

  try {
    inlineTsFileRefs(result.ast, {
      swirlsFilePath: fullPath,
      readFileSync: (path, encoding) => fileSystem.readFileSync(path, encoding),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`${relativePath}: Failed to load @ts file: ${msg}`, { cause: e })
  }

  return result.ast
}
