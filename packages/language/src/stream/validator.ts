/**
 * Validation for stream blocks.
 * Called from the main validator.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'
import type { ConfigValue, Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { StreamDecl, StreamVersionDecl } from './ast'
import { isValidStreamVersionId } from './version-id'

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

function validateStreamVersionEntry(
  stream: StreamDecl,
  decl: StreamVersionDecl,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const id = `"${decl.key}"`

  if (!isValidStreamVersionId(decl.key)) {
    out.push(
      diag(
        `Stream "${stream.name}" version key ${id} is invalid — use v1, v2, … (pattern v[1-9] followed by optional digits)`,
        decl.range,
      ),
    )
  }

  if (decl.schema === undefined && !decl.schemaRef) {
    out.push(
      diag(
        `Stream "${stream.name}" version ${id} has no schema; add schema: @json { … } or schema: <name>`,
        decl.range,
      ),
    )
  }

  const prepare = decl.prepare
  if (!prepare) {
    out.push(
      diag(
        `Stream "${stream.name}" version ${id} requires "prepare" (@ts { } or @ts "…")`,
        decl.range,
      ),
    )
  } else if (!tsPredicateHasBody(prepare)) {
    out.push(
      diag(
        `Stream "${stream.name}" version ${id}: prepare requires a non-empty @ts block or @ts "path.ts.swirls"`,
        prepare.range,
      ),
    )
  }

  if (decl.condition !== undefined && !tsPredicateHasBody(decl.condition)) {
    out.push(
      diag(
        `Stream "${stream.name}" version ${id}: condition requires a non-empty @ts block or @ts "path.ts.swirls"`,
        decl.condition.range,
      ),
    )
  }

  return out
}

export function validateStreamBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const streamBlocks = ast.streams ?? []
  const workflowNames = nameLookup(
    new Set(ast.workflows.map((g) => g.name)),
    options?.workspace?.workflows,
  )

  for (const stream of streamBlocks) {
    out.push(...validateResourceName(stream.name, stream.range, 'Stream'))
    const sameName = streamBlocks.filter((x) => x.name === stream.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate stream name "${stream.name}"`, stream.range))
    }

    if (stream.workflowName === '') {
      out.push(
        diag('Stream block requires "workflow" (workflow name)', stream.range),
      )
    } else if (!workflowNames.has(stream.workflowName)) {
      out.push(
        diag(
          `Stream references workflow "${stream.workflowName}" which is not defined`,
          stream.range,
        ),
      )
    }

    if (!stream.version || stream.version.trim() === '') {
      out.push(
        diag(
          `Stream "${stream.name}" requires "version" (active writer)`,
          stream.range,
        ),
      )
    } else if (!isValidStreamVersionId(stream.version)) {
      out.push(
        diag(
          `Stream "${stream.name}" version pointer "${stream.version}" is invalid — use v1, v2, …`,
          stream.versionRange ?? stream.range,
        ),
      )
    }

    const vers = stream.versions ?? []

    if (vers.length === 0) {
      out.push(
        diag(
          `Stream "${stream.name}" requires a non-empty versions { } block`,
          stream.range,
        ),
      )
    }

    const seenKeys = new Set<string>()
    for (const v of vers) {
      if (seenKeys.has(v.key)) {
        out.push(
          diag(
            `Stream "${stream.name}" declares duplicate version key "${v.key}"`,
            v.range,
          ),
        )
      }
      seenKeys.add(v.key)
      out.push(...validateStreamVersionEntry(stream, v))
    }

    if (
      stream.version &&
      vers.length > 0 &&
      isValidStreamVersionId(stream.version) &&
      !vers.some((v) => v.key === stream.version)
    ) {
      out.push(
        diag(
          `Stream "${stream.name}" version "${stream.version}" is not declared under versions { }`,
          stream.versionRange ?? stream.range,
        ),
      )
    }
  }

  return out
}
