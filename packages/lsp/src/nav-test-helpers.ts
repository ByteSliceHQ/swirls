import * as fs from 'node:fs'
import * as path from 'node:path'

import type { Position } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'

/** Repo root from `packages/lsp/src`. */
function repoRoot(): string {
  return path.join(import.meta.dir, '../../..')
}

function fixturePath(relativePath: string): string {
  return path.join(repoRoot(), relativePath)
}

export function loadFixture(
  relativePath: string,
  uri?: string,
): {
  doc: TextDocument
  content: string
  uri: string
} {
  const absolute = fixturePath(relativePath)
  const content = fs.readFileSync(absolute, 'utf8')
  const docUri = uri ?? `file:///${path.basename(absolute)}`
  const doc = TextDocument.create(docUri, 'swirls', 1, content)
  return { doc, content, uri: docUri }
}

export function loadInline(content: string, uri = 'file:///inline.swirls'): TextDocument {
  return TextDocument.create(uri, 'swirls', 1, content)
}

/** 0-based line index of the first line containing `substring`. */
export function lineIndexOf(content: string, substring: string): number {
  const idx = content.indexOf(substring)

  if (idx < 0) {
    throw new Error(`substring not found: ${substring}`)
  }

  return content.slice(0, idx).split('\n').length - 1
}

/** Character index on a 0-based line for the first `substring` on that line. */
function charIndexOnLine(doc: TextDocument, line: number, substring: string): number {
  const lineText = doc.getText({
    start: { line, character: 0 },
    end: { line, character: Number.MAX_SAFE_INTEGER },
  })

  const idx = lineText.indexOf(substring)

  if (idx < 0) {
    throw new Error(`substring "${substring}" not found on line ${line}: ${lineText.trim()}`)
  }

  return idx
}

export function positionAt(doc: TextDocument, line: number, substring: string): Position {
  return { line, character: charIndexOnLine(doc, line, substring) }
}
