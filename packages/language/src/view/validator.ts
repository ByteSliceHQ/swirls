/**
 * Validation for view blocks.
 * Called from the main validator.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'
import type { ConfigValue, Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { ViewComputedColumnDecl, ViewDecl } from './ast'

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

function tsPredicateHasBody(cv: ConfigValue | undefined): boolean {
  if (!cv) {
    return false
  }
  if (cv.kind === 'ts_block') {
    return Boolean(cv.code?.trim())
  }
  if (cv.kind === 'ts_file_ref') {
    return Boolean(cv.path?.trim())
  }
  return false
}

function validateComputedColumn(
  view: ViewDecl,
  col: ViewComputedColumnDecl,
  workflowNames: Set<string>,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const id = `"${col.name}"`

  out.push(
    ...validateResourceName(
      col.name,
      col.range,
      `View "${view.name}" computed column`,
    ),
  )

  if (col.workflowName === '') {
    out.push(
      diag(
        `View "${view.name}" computed column ${id} requires "graph" (workflow name)`,
        col.range,
      ),
    )
  } else if (!workflowNames.has(col.workflowName)) {
    out.push(
      diag(
        `View "${view.name}" computed column ${id} references workflow "${col.workflowName}" which is not defined`,
        col.workflowNameRange ?? col.range,
      ),
    )
  }

  if (!col.input) {
    out.push(
      diag(
        `View "${view.name}" computed column ${id} requires "input" (@ts { } or @ts "…") mapping the row into the graph input`,
        col.range,
      ),
    )
  } else if (!tsPredicateHasBody(col.input)) {
    out.push(
      diag(
        `View "${view.name}" computed column ${id}: input requires a non-empty @ts block or @ts "path.ts.swirls"`,
        col.input.range,
      ),
    )
  }

  if (col.output !== undefined && !tsPredicateHasBody(col.output)) {
    out.push(
      diag(
        `View "${view.name}" computed column ${id}: output requires a non-empty @ts block or @ts "path.ts.swirls"`,
        col.output.range,
      ),
    )
  }

  return out
}

export function validateViewBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const viewBlocks = ast.views ?? []
  const streamNames = nameLookup(
    new Set((ast.streams ?? []).map((s) => s.name)),
    options?.workspace?.streams,
  )
  const workflowNames = nameLookup(
    new Set(ast.workflows.map((g) => g.name)),
    options?.workspace?.workflows,
  )

  for (const view of viewBlocks) {
    out.push(...validateResourceName(view.name, view.range, 'View'))
    const sameName = viewBlocks.filter((x) => x.name === view.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate view name "${view.name}"`, view.range))
    }

    if (view.streams.length === 0) {
      out.push(
        diag(
          `View "${view.name}" requires "streams" (non-empty list of stream names)`,
          view.range,
        ),
      )
    }

    const seenStreams = new Set<string>()
    for (const ref of view.streams) {
      if (seenStreams.has(ref.name)) {
        out.push(
          diag(
            `View "${view.name}" lists stream "${ref.name}" more than once`,
            ref.range,
          ),
        )
      }
      seenStreams.add(ref.name)

      if (!streamNames.has(ref.name)) {
        out.push(
          diag(
            `View references stream "${ref.name}" which is not defined`,
            ref.range,
          ),
        )
      }
    }

    if (view.schema === undefined && !view.schemaRef) {
      out.push(
        diag(
          `View "${view.name}" has no schema; add schema: @json { … } or schema: <name>`,
          view.range,
        ),
      )
    }

    if (!view.columns) {
      out.push(
        diag(
          `View "${view.name}" requires "columns" (@ts { } or @ts "…") mapping streams into row values`,
          view.range,
        ),
      )
    } else if (!tsPredicateHasBody(view.columns)) {
      out.push(
        diag(
          `View "${view.name}": columns requires a non-empty @ts block or @ts "path.ts.swirls"`,
          view.columns.range,
        ),
      )
    }

    const seenCols = new Set<string>()
    for (const col of view.computed) {
      if (seenCols.has(col.name)) {
        out.push(
          diag(
            `View "${view.name}" declares duplicate computed column "${col.name}"`,
            col.range,
          ),
        )
      }
      seenCols.add(col.name)
      out.push(...validateComputedColumn(view, col, workflowNames))
    }
  }

  out.push(...validateViewExecutionCycles(ast))

  return out
}

/**
 * Reject computed-column execution cycles: view A's computed column runs a
 * graph that writes a stream composed by view B, whose computed column
 * (transitively) feeds a stream composed by view A again. Each materialized
 * row would enqueue a graph run that materializes another row, forever.
 * Callers that merge multiple source files must run this on the merged AST so
 * cross-file view/stream/workflow loops cannot reach deployment.
 */
export function validateViewExecutionCycles(ast: SwirlsFile): Diagnostic[] {
  const out: Diagnostic[] = []
  const views = ast.views ?? []
  if (views.length === 0) {
    return out
  }

  const streamsByWorkflow = new Map<string, string[]>()
  for (const s of ast.streams ?? []) {
    const list = streamsByWorkflow.get(s.workflowName)
    if (list) {
      list.push(s.name)
    } else {
      streamsByWorkflow.set(s.workflowName, [s.name])
    }
  }

  // Edge v1 -> v2: a computed column of v1 runs a graph that writes a stream
  // composed by v2.
  const edges = new Map<string, Set<string>>()
  for (const v1 of views) {
    const targets = new Set<string>()
    for (const col of v1.computed) {
      const written = streamsByWorkflow.get(col.workflowName) ?? []
      for (const streamName of written) {
        for (const v2 of views) {
          if (v2.streams.some((ref) => ref.name === streamName)) {
            targets.add(v2.name)
          }
        }
      }
    }
    edges.set(v1.name, targets)
  }

  const visiting = new Set<string>()
  const done = new Set<string>()
  const inCycle = new Set<string>()

  function visit(name: string, path: string[]): void {
    if (done.has(name)) {
      return
    }
    if (visiting.has(name)) {
      for (const member of path.slice(path.indexOf(name))) {
        inCycle.add(member)
      }
      return
    }
    visiting.add(name)
    for (const next of edges.get(name) ?? []) {
      visit(next, [...path, next])
    }
    visiting.delete(name)
    done.add(name)
  }

  for (const v of views) {
    visit(v.name, [v.name])
  }

  for (const v of views) {
    if (inCycle.has(v.name)) {
      out.push(
        diag(
          `View "${v.name}" creates an infinite execution loop: a computed column runs a graph that writes a stream this view (or a view it feeds) composes. Every materialized row would enqueue another graph run forever.`,
          v.range,
        ),
      )
    }
  }

  return out
}
