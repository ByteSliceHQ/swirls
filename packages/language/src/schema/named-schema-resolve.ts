/**
 * Resolve top-level `schema { }` declarations to JSON Schema literals.
 * Shared by single-file validation and workspace-wide schema indexing.
 */

import type { Diagnostic, JsonSchemaLiteral, SchemaDecl, SourceRange } from '../ast'

function diag(
  message: string,
  range: SourceRange,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { message, range, severity }
}

export interface NamedSchemaResolution {
  /** name -> resolved JSON Schema literal (after following schemaRef chains). */
  map: Map<string, JsonSchemaLiteral>
  diagnostics: Diagnostic[]
}

/**
 * Validates `schema { }` declarations and builds a map of resolved literals.
 * Reports duplicates, missing refs, cycles, and empty declarations.
 */
export function resolveNamedSchemasFromDecls(decls: SchemaDecl[]): NamedSchemaResolution {
  const diagnostics: Diagnostic[] = []
  const byName = new Map<string, SchemaDecl>(decls.map((d) => [d.name, d]))
  const resolved = new Map<string, JsonSchemaLiteral>()
  const visiting = new Set<string>()

  const seenSchemaNames = new Set<string>()

  for (const d of decls) {
    if (seenSchemaNames.has(d.name)) {
      diagnostics.push(diag(`Duplicate schema name "${d.name}"`, d.range))
    } else {
      seenSchemaNames.add(d.name)
    }

    const hasInline = d.schema !== undefined
    const hasRef = d.schemaRef !== undefined && d.schemaRef !== ''

    if (!hasInline && !hasRef) {
      diagnostics.push(
        diag(
          `Schema "${d.name}" must set schema: with @json, inline object, or schema: <name>`,
          d.range,
        ),
      )
    }

    if (hasInline && hasRef) {
      diagnostics.push(
        diag(
          `Schema "${d.name}" cannot combine an inline schema with schema: <name>`,
          d.schemaRefRange ?? d.range,
        ),
      )
    }
  }

  function resolveDecl(decl: SchemaDecl): JsonSchemaLiteral | undefined {
    if (resolved.has(decl.name)) {
      return resolved.get(decl.name)
    }

    if (visiting.has(decl.name)) {
      diagnostics.push(
        diag(
          `Circular schema reference involving "${decl.name}"`,
          decl.schemaRefRange ?? decl.range,
        ),
      )

      return undefined
    }

    visiting.add(decl.name)

    let lit: JsonSchemaLiteral | undefined

    if (decl.schemaRef) {
      const target = byName.get(decl.schemaRef)

      if (!target) {
        diagnostics.push(
          diag(
            `Schema "${decl.name}" references undefined schema "${decl.schemaRef}"`,
            decl.schemaRefRange ?? decl.range,
          ),
        )
      } else {
        lit = resolveDecl(target)

        if (lit !== undefined) {
          resolved.set(decl.name, lit)
        }
      }
    } else if (decl.schema !== undefined) {
      lit = decl.schema
      resolved.set(decl.name, lit)
    }

    visiting.delete(decl.name)
    return resolved.get(decl.name)
  }

  for (const d of decls) {
    resolveDecl(d)
  }

  return { map: resolved, diagnostics }
}
