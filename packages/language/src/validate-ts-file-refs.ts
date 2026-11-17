import type { Diagnostic, NodeDecl, SourceRange, SwirlsFile } from './ast'
import { pathEndsWithTsSwirls, resolveTsRefFullPath } from './ts-ref-path'

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateTsRefsOnNodes(
  nodes: NodeDecl[],
  swirlsFilePath: string,
  existsSync: (path: string) => boolean,
  out: Diagnostic[],
): void {
  for (const node of nodes) {
    for (const cv of Object.values(node.configFields)) {
      if (cv.kind !== 'ts_file_ref') {
        continue
      }

      const raw = cv.path.trim()

      if (!raw) {
        out.push(diag('@ts file path is empty', cv.range))
      } else if (!pathEndsWithTsSwirls(raw)) {
        out.push(diag(`@ts file reference must end with .ts.swirls, got "${raw}"`, cv.pathRange))
      } else {
        const abs = resolveTsRefFullPath(swirlsFilePath, raw)

        if (!existsSync(abs)) {
          out.push(diag(`@ts file not found: ${raw}`, cv.pathRange))
        }
      }
    }

    if (node.subgraph?.nodes?.length) {
      validateTsRefsOnNodes(node.subgraph.nodes, swirlsFilePath, existsSync, out)
    }
  }
}

export interface ValidateTsFileRefsOptions {
  /** Path to the authoring `.swirls` file (same as used for `resolveTsRefFullPath`). */
  swirlsFilePath: string
  existsSync: (path: string) => boolean
}

/**
 * Validate that `@ts "…"` references exist and use the `.ts.swirls` suffix.
 * Run after `parse` + `validate` when filesystem access is available.
 */
export function validateTsFileRefs(ast: SwirlsFile, opts: ValidateTsFileRefsOptions): Diagnostic[] {
  const out: Diagnostic[] = []
  const { swirlsFilePath, existsSync } = opts

  for (const stream of ast.streams ?? []) {
    for (const sv of stream.versions ?? []) {
      for (const cv of [sv.condition, sv.prepare]) {
        if (cv == null || cv.kind !== 'ts_file_ref') {
          continue
        }

        const raw = cv.path.trim()

        if (!raw) {
          out.push(diag('@ts file path is empty', cv.range))
        } else if (!pathEndsWithTsSwirls(raw)) {
          out.push(diag(`@ts file reference must end with .ts.swirls, got "${raw}"`, cv.pathRange))
        } else {
          const abs = resolveTsRefFullPath(swirlsFilePath, raw)

          if (!existsSync(abs)) {
            out.push(diag(`@ts file not found: ${raw}`, cv.pathRange))
          }
        }
      }
    }
  }

  for (const graph of ast.workflows) {
    validateTsRefsOnNodes(graph.nodes, swirlsFilePath, existsSync, out)
  }

  return out
}
