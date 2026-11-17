/**
 * TypeScript diagnostics for `@ts { }` blocks.
 *
 * Each block becomes its own virtual module, so its diagnostics depend only on
 * its own virtual source. That makes them cacheable by content: after an edit,
 * only the blocks whose virtual source changed are type-checked again, and a
 * file with fifty blocks costs one block per keystroke, not fifty.
 */
import { createHash } from 'node:crypto'

import ts from 'typescript'
import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver'

import { createLanguageServiceFromMap, virtualUriForBlock } from './host'
import { getExpectedReturnType } from './return-types'
import { type TsBlockInfo, virtualToOriginal } from './virtual-docs'

/** A diagnostic in virtual-document coordinates, independent of where the block sits. */
export interface VirtualTsDiagnostic {
  start: { line: number; character: number }
  end: { line: number; character: number }
  message: string
  category: ts.DiagnosticCategory
}

const MAX_CACHED_BLOCKS = 2048
const cache = new Map<string, VirtualTsDiagnostic[]>()
export const blockDiagnosticsStats = { hits: 0, misses: 0 }

export function clearBlockDiagnosticsCache(): void {
  cache.clear()
}

function contentKey(content: string): string {
  return createHash('sha1').update(content).digest('base64')
}

/** Syntactic and semantic diagnostics reported against `virtualUri` itself. */
export function collectVirtualDiagnostics(
  ls: ts.LanguageService,
  virtualUri: string,
): VirtualTsDiagnostic[] {
  const out: VirtualTsDiagnostic[] = []
  const all = [...ls.getSyntacticDiagnostics(virtualUri), ...ls.getSemanticDiagnostics(virtualUri)]

  for (const d of all) {
    if (d.file?.fileName !== virtualUri || d.start === undefined || d.length === undefined) {
      continue
    }

    out.push({
      start: d.file.getLineAndCharacterOfPosition(d.start),
      end: d.file.getLineAndCharacterOfPosition(d.start + d.length),
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      category: d.category,
    })
  }

  return out
}

/**
 * Diagnostics for each virtual source, in order. Sources seen before are
 * answered from the cache; the rest are checked together in one short-lived
 * language service.
 */
export function getVirtualDiagnostics(contents: readonly string[]): VirtualTsDiagnostic[][] {
  const keys = contents.map(contentKey)
  const missing = new Map<string, string>()

  keys.forEach((key, i) => {
    const hit = cache.get(key)

    if (hit !== undefined) {
      blockDiagnosticsStats.hits++
      // Refresh recency: a Map iterates in insertion order.
      cache.delete(key)
      cache.set(key, hit)
    } else if (!missing.has(key)) {
      blockDiagnosticsStats.misses++
      missing.set(key, contents[i] ?? '')
    }
  })

  if (missing.size > 0) {
    const contentMap = new Map<string, string>()
    const uriByKey = new Map<string, string>()
    let n = 0

    for (const [key, content] of missing) {
      const uri = virtualUriForBlock(`check-${n++}`)
      uriByKey.set(key, uri)
      contentMap.set(uri, content)
    }

    const ls = createLanguageServiceFromMap(contentMap)

    try {
      for (const [key, uri] of uriByKey) {
        cache.set(key, collectVirtualDiagnostics(ls, uri))
      }
    } finally {
      ls.dispose()
    }

    while (cache.size > MAX_CACHED_BLOCKS) {
      const oldest = cache.keys().next()

      if (oldest.done) {
        break
      }

      cache.delete(oldest.value)
    }
  }

  return keys.map((key) => cache.get(key) ?? [])
}

function severityOf(category: ts.DiagnosticCategory): DiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Warning:
      return DiagnosticSeverity.Warning
    case ts.DiagnosticCategory.Suggestion:
      return DiagnosticSeverity.Hint
    case ts.DiagnosticCategory.Message:
      return DiagnosticSeverity.Information
    default:
      return DiagnosticSeverity.Error
  }
}

/** Map a block's virtual diagnostics onto the `.swirls` document. */
export function toDocumentDiagnostics(
  block: TsBlockInfo,
  virtual: readonly VirtualTsDiagnostic[],
): Diagnostic[] {
  const expectedReturn = getExpectedReturnType(block)
  return virtual.map((d) => {
    let message = d.message

    if (expectedReturn !== undefined && message.includes('__ExpectedReturn')) {
      message = message.replace(/__ExpectedReturn/g, expectedReturn)
      message = `${message} Expected return type for this block: \`${expectedReturn}\`.`
    }

    return {
      message,
      range: {
        start: virtualToOriginal(block, d.start.line, d.start.character),
        end: virtualToOriginal(block, d.end.line, d.end.character),
      },
      severity: severityOf(d.category),
    }
  })
}
