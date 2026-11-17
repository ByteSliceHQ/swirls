/**
 * Named top-level `schema` blocks: resolution map and validation helpers.
 */

import type {
  Diagnostic,
  JsonSchemaLiteral,
  SourceRange,
  SwirlsFile,
} from '../ast'
import { resolveNamedSchemasFromDecls } from './named-schema-resolve'

function diag(
  message: string,
  range: SourceRange,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { message, range, severity }
}

/**
 * Inlines all named schema references.
 *
 * Converts:
 * - `schema: some_name` on forms/webhooks/streams
 * - `inputSchema: some_name` / `outputSchema: some_name` on graph nodes
 * - `review { schema: some_name }` via `reviewConfig.schemaRef`
 *
 * into their resolved JSON Schema literals from top-level `schema` blocks.
 *
 * @param extraSchemas — resolved literals from other files (e.g. `workspace.schemaLiterals`);
 *   used when the name is not declared in `ast.schemas`.
 */
export function inlineNamedSchemaRefs(
  ast: SwirlsFile,
  extraSchemas?: Map<string, JsonSchemaLiteral>,
): SwirlsFile {
  const { map: localMap } = resolveNamedSchemasFromDecls(ast.schemas ?? [])

  const lit = (ref: string | undefined) => {
    if (!ref) {
      return undefined
    }
    return localMap.get(ref) ?? extraSchemas?.get(ref)
  }

  const forms = ast.forms.map((f) => {
    if (!f.schemaRef) {
      return f
    }
    const {
      schemaRef: _schemaRef,
      schemaRefRange: _schemaRefRange,
      ...rest
    } = f
    const resolved = lit(f.schemaRef)
    return resolved !== undefined ? { ...rest, schema: resolved } : rest
  })

  const webhooks = ast.webhooks.map((w) => {
    if (!w.schemaRef) {
      return w
    }
    const {
      schemaRef: _schemaRef,
      schemaRefRange: _schemaRefRange,
      ...rest
    } = w
    const resolved = lit(w.schemaRef)
    return resolved !== undefined ? { ...rest, schema: resolved } : rest
  })

  const streams = (ast.streams ?? []).map((s) => ({
    ...s,
    versions: (s.versions ?? []).map((sv) => {
      if (!sv.schemaRef) {
        return sv
      }
      const {
        schemaRef: _schemaRef,
        schemaRefRange: _schemaRefRange,
        ...rest
      } = sv
      const resolved = lit(sv.schemaRef)
      return resolved !== undefined ? { ...rest, schema: resolved } : rest
    }),
  }))

  const views = (ast.views ?? []).map((v) => {
    if (!v.schemaRef) {
      return v
    }
    const {
      schemaRef: _schemaRef,
      schemaRefRange: _schemaRefRange,
      ...rest
    } = v
    const resolved = lit(v.schemaRef)
    return resolved !== undefined ? { ...rest, schema: resolved } : rest
  })

  const actions = (ast.actions ?? []).map((a) => {
    const inputResolved = a.inputRef ? lit(a.inputRef) : undefined
    const outputResolved = a.outputRef ? lit(a.outputRef) : undefined
    const {
      inputRef: _inputRef,
      inputRefRange: _inputRefRange,
      outputRef: _outputRef,
      outputRefRange: _outputRefRange,
      ...rest
    } = a
    return {
      ...rest,
      ...(inputResolved !== undefined ? { input: inputResolved } : {}),
      ...(outputResolved !== undefined ? { output: outputResolved } : {}),
    }
  })

  const workflows = ast.workflows.map((g) => ({
    ...g,
    nodes: g.nodes.map((n) => {
      const {
        inputSchemaRef: _inputSchemaRef,
        inputSchemaRefRange: _inputSchemaRefRange,
        outputSchemaRef: _outputSchemaRef,
        outputSchemaRefRange: _outputSchemaRefRange,
        ...rest
      } = n

      const inputResolved = n.inputSchemaRef ? lit(n.inputSchemaRef) : undefined
      const outputResolved = n.outputSchemaRef
        ? lit(n.outputSchemaRef)
        : undefined

      const reviewConfig =
        n.reviewConfig &&
        typeof n.reviewConfig === 'object' &&
        !Array.isArray(n.reviewConfig)
          ? (() => {
              const raw = n.reviewConfig as Record<string, unknown>
              const { schemaRef, ...reviewRest } = raw
              if (typeof schemaRef !== 'string') {
                return n.reviewConfig
              }
              const resolved = lit(schemaRef)
              return resolved !== undefined
                ? { ...reviewRest, schema: resolved }
                : reviewRest
            })()
          : n.reviewConfig

      return {
        ...rest,
        ...(inputResolved !== undefined ? { inputSchema: inputResolved } : {}),
        ...(outputResolved !== undefined
          ? { outputSchema: outputResolved }
          : {}),
        ...(reviewConfig !== undefined ? { reviewConfig } : {}),
      }
    }),
  }))

  return {
    ...ast,
    forms,
    webhooks,
    streams,
    views,
    actions,
    workflows,
    schemas: [],
  }
}

export type ValidateSchemaFieldRefsOptions = {
  /** Schema names declared in other `.swirls` files (workspace-wide resolution). */
  workspaceSchemaNames?: Set<string>
}

/**
 * Build a map of webhook name -> secret block/var it references.
 * Used by LSP (hover / completions) and downstream tooling to resolve
 * `webhook foo { secret: my_block.VAR }` into a concrete secret declaration.
 */
export function webhookSecretRefs(
  ast: SwirlsFile,
): Map<string, { blockName: string; varName: string }> {
  const out = new Map<string, { blockName: string; varName: string }>()

  for (const w of ast.webhooks) {
    if (w.secretRef) {
      out.set(w.name, {
        blockName: w.secretRef.blockName,
        varName: w.secretRef.varName,
      })
    }
  }

  return out
}

/**
 * Ensures every `*SchemaRef` / `schemaRef` points at a defined top-level `schema` name
 * and flags illegal literal + ref combinations.
 */
export function validateSchemaFieldRefs(
  ast: SwirlsFile,
  options?: ValidateSchemaFieldRefsOptions,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const localNames = new Set((ast.schemas ?? []).map((s) => s.name))
  const extra = options?.workspaceSchemaNames
  const names =
    extra !== undefined && extra.size > 0
      ? new Set([...localNames, ...extra])
      : localNames

  const check = (
    ref: string | undefined,
    range: SourceRange | undefined,
    fallback: SourceRange,
    ctx: string,
  ) => {
    if (!ref) {
      return
    }
    if (!names.has(ref)) {
      out.push(
        diag(`${ctx} references undefined schema "${ref}"`, range ?? fallback),
      )
    }
  }

  for (const f of ast.forms) {
    if (f.schema !== undefined && f.schemaRef) {
      out.push(
        diag(
          `Form "${f.name}" cannot combine inline schema and schema: <name>`,
          f.schemaRefRange ?? f.range,
        ),
      )
    }
    check(f.schemaRef, f.schemaRefRange, f.range, `Form "${f.name}"`)
  }

  for (const w of ast.webhooks) {
    if (w.schema !== undefined && w.schemaRef) {
      out.push(
        diag(
          `Webhook "${w.name}" cannot combine inline schema and schema: <name>`,
          w.schemaRefRange ?? w.range,
        ),
      )
    }
    check(w.schemaRef, w.schemaRefRange, w.range, `Webhook "${w.name}"`)
  }

  for (const s of ast.streams ?? []) {
    for (const sv of s.versions ?? []) {
      if (sv.schema !== undefined && sv.schemaRef) {
        out.push(
          diag(
            `Stream "${s.name}" version "${sv.key}" cannot combine inline schema and schema: <name>`,
            sv.schemaRefRange ?? sv.range,
          ),
        )
      }
      check(
        sv.schemaRef,
        sv.schemaRefRange,
        sv.range,
        `Stream "${s.name}" version "${sv.key}"`,
      )
    }
  }

  for (const v of ast.views ?? []) {
    if (v.schema !== undefined && v.schemaRef) {
      out.push(
        diag(
          `View "${v.name}" cannot combine inline schema and schema: <name>`,
          v.schemaRefRange ?? v.range,
        ),
      )
    }
    check(v.schemaRef, v.schemaRefRange, v.range, `View "${v.name}"`)
  }

  for (const a of ast.actions ?? []) {
    const ctx = `Action "${a.name}"`
    if (a.input !== undefined && a.inputRef) {
      out.push(
        diag(
          `${ctx} cannot combine inline input and input: <name>`,
          a.inputRefRange ?? a.range,
        ),
      )
    }
    if (a.output !== undefined && a.outputRef) {
      out.push(
        diag(
          `${ctx} cannot combine inline output and output: <name>`,
          a.outputRefRange ?? a.range,
        ),
      )
    }
    check(a.inputRef, a.inputRefRange, a.range, `${ctx} input`)
    check(a.outputRef, a.outputRefRange, a.range, `${ctx} output`)
  }

  for (const g of ast.workflows) {
    for (const n of g.nodes) {
      const ctx = `Workflow "${g.name}" node "${n.name}"`
      if (n.inputSchema !== undefined && n.inputSchemaRef) {
        out.push(
          diag(
            `${ctx} cannot combine inline inputSchema and inputSchema: <name>`,
            n.inputSchemaRefRange ?? n.range,
          ),
        )
      }
      if (n.outputSchema !== undefined && n.outputSchemaRef) {
        out.push(
          diag(
            `${ctx} cannot combine inline schema and schema: <name>`,
            n.outputSchemaRefRange ?? n.range,
          ),
        )
      }
      check(
        n.inputSchemaRef,
        n.inputSchemaRefRange,
        n.range,
        `${ctx} inputSchema`,
      )
      check(
        n.outputSchemaRef,
        n.outputSchemaRefRange,
        n.range,
        `${ctx} output schema`,
      )

      const rc = n.reviewConfig
      if (rc) {
        const sr = rc.schemaRef
        if (typeof sr === 'string' && sr !== '') {
          if (rc.schema !== undefined && rc.schema !== null) {
            out.push(
              diag(
                `${ctx} review cannot combine inline schema and schema: <name>`,
                n.range,
              ),
            )
          }
          check(sr, undefined, n.range, `${ctx} review`)
        }
      }
    }
  }

  return out
}
