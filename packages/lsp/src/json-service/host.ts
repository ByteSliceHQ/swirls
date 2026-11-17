/**
 * JSON language service for @json { } schema blocks. Forwards validation to the JSON language server.
 */

import { getLanguageService } from 'vscode-json-languageservice'
import type { Diagnostic } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type { JsonBlockInfo } from '../ts-service/virtual-docs'
import { jsonVirtualToOriginal } from '../ts-service/virtual-docs'

const VIRTUAL_SCHEME = 'swirls-json-block'

function virtualUriForJsonBlock(blockId: string): string {
  return `${VIRTUAL_SCHEME}://${blockId}.json`
}

let jsonLs: ReturnType<typeof getLanguageService> | null = null

function getJsonLanguageService() {
  if (!jsonLs) {
    jsonLs = getLanguageService({})
  }

  return jsonLs
}

/**
 * Run JSON validation on block content and return diagnostics with ranges mapped to the original .swirls document.
 */
export async function getJsonBlockDiagnostics(
  block: JsonBlockInfo,
  blockId: string,
): Promise<Diagnostic[]> {
  const ls = getJsonLanguageService()
  const uri = virtualUriForJsonBlock(blockId)
  const doc = TextDocument.create(uri, 'json', 1, block.code)
  const jsonDoc = ls.parseJSONDocument(doc)
  const diagnostics = await ls.doValidation(doc, jsonDoc)

  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    message:
      typeof diagnostic.message === 'string'
        ? diagnostic.message
        : diagnostic.message.value,
    range: {
      start: jsonVirtualToOriginal(
        block,
        diagnostic.range.start.line,
        diagnostic.range.start.character,
      ),
      end: jsonVirtualToOriginal(
        block,
        diagnostic.range.end.line,
        diagnostic.range.end.character,
      ),
    },
  }))
}
