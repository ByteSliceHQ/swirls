import { readFileSync as nodeReadFileSync } from 'node:fs'

import type { NodeDecl, SwirlsFile } from './ast'
import { resolveTsRefFullPath } from './ts-ref-path'

export interface InlineTsFileRefsOptions {
  /** Absolute or normalized path to the authoring `.swirls` file (used to resolve relative refs). */
  swirlsFilePath: string
  /** Defaults to Node `readFileSync` with utf-8. */
  readFileSync?: (path: string, encoding: 'utf-8') => string
}

function inlineTsRefsOnNodes(
  nodes: NodeDecl[],
  swirlsFilePath: string,
  read: (path: string, encoding: 'utf-8') => string,
): void {
  for (const node of nodes) {
    for (const [key, cv] of Object.entries(node.configFields)) {
      if (cv.kind === 'ts_file_ref') {
        const resolved = resolveTsRefFullPath(swirlsFilePath, cv.path)
        const code = read(resolved, 'utf-8')

        node.configFields[key] = {
          kind: 'ts_block',
          code,
          range: cv.range,
          innerRange: cv.pathRange,
        }
      }
    }

    if (node.subgraph?.nodes?.length) {
      inlineTsRefsOnNodes(node.subgraph.nodes, swirlsFilePath, read)
    }
  }
}

/**
 * Load every `ts_file_ref` into inline `ts_block` / `code`.
 * Mutates `ast`. Throws if a file cannot be read.
 */
export function inlineTsFileRefs(ast: SwirlsFile, opts: InlineTsFileRefsOptions): void {
  const read = opts.readFileSync ?? nodeReadFileSync
  const { swirlsFilePath } = opts

  for (const stream of ast.streams ?? []) {
    for (const sv of stream.versions ?? []) {
      for (const ck of ['condition', 'prepare'] as const) {
        const cv = sv[ck]

        if (cv?.kind === 'ts_file_ref') {
          const resolved = resolveTsRefFullPath(swirlsFilePath, cv.path)
          const code = read(resolved, 'utf-8')

          sv[ck] = {
            kind: 'ts_block',
            code,
            range: cv.range,
            innerRange: cv.pathRange,
          }
        }
      }
    }
  }

  for (const migration of ast.migrations ?? []) {
    const cv = migration.operation

    if (cv?.kind === 'ts_file_ref') {
      const resolved = resolveTsRefFullPath(swirlsFilePath, cv.path)
      const code = read(resolved, 'utf-8')

      migration.operation = {
        kind: 'ts_block',
        code,
        range: cv.range,
        innerRange: cv.pathRange,
      }
    }
  }

  // An operation's script file is read here too, so the deployed operation
  // carries the script text itself. Line endings are left exactly as they
  // are in the file: those bytes are what gets hashed and signed.
  for (const operation of ast.operations ?? []) {
    const command = operation.command

    if (command?.path !== undefined && command.script === undefined) {
      const resolved = resolveTsRefFullPath(swirlsFilePath, command.path)
      command.script = read(resolved, 'utf-8')
    }
  }

  for (const graph of ast.workflows) {
    inlineTsRefsOnNodes(graph.nodes, swirlsFilePath, read)
  }
}
