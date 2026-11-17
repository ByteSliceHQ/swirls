import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  resolveTsRefFullPath,
  type SourceRange,
} from '@swirls/language'
import { parse } from './parse-cache'
import type {
  DocumentLink,
  Location,
  Position,
  Range,
} from 'vscode-languageserver'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import { isDslSwirlsUri } from './ts-bindings'
import { positionInRange } from './ts-service/virtual-docs'

/** Swirls 1-based inclusive SourceRange → LSP 0-based Range (matches server diagnostics). */
function sourceRangeToLspRange(r: SourceRange): Range {
  return {
    start: { line: r.start.line - 1, character: r.start.column - 1 },
    end: { line: r.end.line - 1, character: r.end.column - 1 },
  }
}

/**
 * If the cursor is on a `@ts "path.ts.swirls"` path, return the target file location.
 * Hit test uses the full `@ts "…"` span (including `@` and quotes) so navigation matches document links.
 * Includes node config refs and stream `condition` / `prepare` file refs.
 */
export function getTsFileRefDefinition(
  document: TextDocument,
  position: Position,
  uri: string,
): Location | null {
  if (!isDslSwirlsUri(uri)) {
    return null
  }

  const result = parse(document.getText())

  let parentPath: string
  try {
    parentPath = fileURLToPath(uri)
  } catch {
    return null
  }

  const line = position.line
  const character = position.character

  for (const graph of result.ast.workflows) {
    for (const node of graph.nodes) {
      for (const cv of Object.values(node.configFields)) {
        if (cv.kind !== 'ts_file_ref') {
          continue
        }
        if (!positionInRange(line, character, cv.range)) {
          continue
        }
        const abs = resolveTsRefFullPath(parentPath, cv.path.trim())
        const href = pathToFileURL(abs).href
        return {
          uri: href,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        }
      }
    }
  }

  for (const stream of result.ast.streams ?? []) {
    for (const sv of stream.versions ?? []) {
      for (const cv of [sv.condition, sv.prepare]) {
        if (cv?.kind !== 'ts_file_ref') {
          continue
        }
        if (!positionInRange(line, character, cv.range)) {
          continue
        }
        const abs = resolveTsRefFullPath(parentPath, cv.path.trim())
        const href = pathToFileURL(abs).href
        return {
          uri: href,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        }
      }
    }
  }

  return null
}

/**
 * Document links for every `@ts "path.ts.swirls"` in the file (node config, stream condition/prepare).
 */
export function getTsFileRefDocumentLinks(
  document: TextDocument,
  uri: string,
): DocumentLink[] {
  if (!isDslSwirlsUri(uri)) {
    return []
  }

  const result = parse(document.getText())

  let parentPath: string
  try {
    parentPath = fileURLToPath(uri)
  } catch {
    return []
  }

  const links: DocumentLink[] = []

  for (const graph of result.ast.workflows) {
    for (const node of graph.nodes) {
      for (const cv of Object.values(node.configFields)) {
        if (cv.kind !== 'ts_file_ref') {
          continue
        }
        const abs = resolveTsRefFullPath(parentPath, cv.path.trim())
        links.push({
          range: sourceRangeToLspRange(cv.range),
          target: pathToFileURL(abs).href,
        })
      }
    }
  }

  for (const stream of result.ast.streams ?? []) {
    for (const sv of stream.versions ?? []) {
      for (const cv of [sv.condition, sv.prepare]) {
        if (cv?.kind !== 'ts_file_ref') {
          continue
        }
        const abs = resolveTsRefFullPath(parentPath, cv.path.trim())
        links.push({
          range: sourceRangeToLspRange(cv.range),
          target: pathToFileURL(abs).href,
        })
      }
    }
  }

  return links
}
