/**
 * Validation for `disk` blocks and `type: disk` nodes.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'

import type { ConfigValue, Diagnostic, NodeDecl, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type { DiskDecl } from './ast'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(name: string, range: SourceRange, kind: string): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)

  if (result.success) {
    return []
  }

  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

function diskFieldPresent(cv: ConfigValue | undefined): boolean {
  if (!cv) {
    return false
  }

  if (cv.kind === 'string') {
    return Boolean(cv.value.trim())
  }

  if (cv.kind === 'ts_block') {
    return Boolean(cv.code?.trim())
  }

  if (cv.kind === 'ts_file_ref') {
    return Boolean(cv.path?.trim())
  }

  return false
}

export function validateDiskBlocks(
  ast: SwirlsFile,
  _options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.disk ?? []
  const names = new Set<string>()

  for (const r of blocks) {
    out.push(...validateResourceName(r.name, r.range, 'Disk block'))

    if (names.has(r.name)) {
      out.push(diag(`Duplicate disk block name "${r.name}"`, r.range))
    }

    names.add(r.name)
  }

  return out
}

function diskBlockMap(ast: SwirlsFile, workspace?: WorkspaceResourceIndex): Map<string, DiskDecl> {
  const m = new Map<string, DiskDecl>()

  for (const p of ast.disk ?? []) {
    m.set(p.name, p)
  }

  if (workspace?.diskBlocks) {
    for (const [name, decl] of workspace.diskBlocks) {
      m.set(name, decl)
    }
  }

  return m
}

export function validateDiskNodes(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const diskByName = diskBlockMap(ast, options?.workspace)

  function checkNode(node: NodeDecl) {
    if (node.type !== 'disk') {
      return
    }

    const cf = node.configFields
    const diskCv = cf.disk

    if (!diskCv || diskCv.kind !== 'string') {
      out.push(
        diag('Disk node requires a "disk" field (name of a top-level disk block)', node.range),
      )

      return
    }

    const diskName = diskCv.value.trim()

    if (!diskName) {
      out.push(diag('Disk node "disk" must be a non-empty name', diskCv.range))
      return
    }

    const block = diskByName.get(diskName)

    if (!block) {
      out.push(diag(`Disk node references undefined disk block "${diskName}"`, diskCv.range))
    }

    const operationCv = cf.operation
    const operation = operationCv?.kind === 'string' ? operationCv.value.trim() : 'exec'

    if (operation === 'copy_file') {
      const pathCv = cf.path

      if (!diskFieldPresent(pathCv)) {
        out.push(
          diag(
            'Disk copy_file node requires a non-empty "path" field',
            pathCv?.range ?? node.range,
          ),
        )
      }

      const fileCv = cf.file

      if (!diskFieldPresent(fileCv)) {
        out.push(
          diag(
            'Disk copy_file node requires a "file" field (@ts returning a file handle)',
            fileCv?.range ?? node.range,
          ),
        )
      }

      return
    }

    const commandCv = cf.command

    if (!diskFieldPresent(commandCv)) {
      out.push(diag('Disk exec node requires a "command" field', commandCv?.range ?? node.range))
    }
  }

  for (const g of ast.workflows ?? []) {
    for (const n of g.nodes) {
      checkNode(n)
    }
  }

  return out
}
