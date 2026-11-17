#!/usr/bin/env node

/**
 * Swirls Language Server — LSP for .swirls files.
 * Run via node dist/server.js (stdio). VS Code extension spawns this and connects.
 */

import './stdio-guard'

import fs, { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, validate, validateTsFileRefs } from '@swirls/language'
import {
  buildWorkspaceResourceIndex,
  emptyWorkspaceResourceIndex,
  type SwirlsWorkspaceFileSystem,
  type WorkspaceResourceIndex,
} from '@swirls/language/workspace'
import ts from 'typescript'
import {
  type CompletionItem,
  CompletionItemKind,
  createConnection,
  type Diagnostic,
  DiagnosticSeverity,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type ParameterInformation,
  type Position,
  ProposedFeatures,
  type SignatureHelp,
  type SignatureInformation,
  type TextDocumentChangeEvent,
  TextDocuments,
  type WorkspaceFolder,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getAiNodeOptionsDiagnostics } from './ai-validation'
import {
  getBlockContext,
  getCompletions,
  getNodeContextAtPosition,
} from './completions'
import { getDefinition } from './definition'
import {
  buildHoverContent,
  type DeclWithDoc,
  getDeclarationAtPosition,
  getHarnessHover,
  getWordAtPosition,
  markdownTsQuickInfo,
  REVIEW_PROPERTY_HOVER,
} from './hover'
import { getJsonBlockDiagnostics } from './json-service/host'
import {
  collectPrismaBlocks,
  findPrismaBlockAtPosition,
} from './prisma-service/blocks'
import {
  getPrismaBlockCompletions,
  getPrismaBlockDefinition,
  getPrismaBlockDiagnostics,
  getPrismaBlockHover,
} from './prisma-service/host'
import { getReferences } from './references'
import {
  collectSqlBlocks,
  findBracePlaceholderKeyAtCodeOffset,
  findSqlBlockAtPosition,
} from './sql-service/blocks'
import { getSqlCompletions } from './sql-service/completions'
import { getSqlBlockDiagnostics } from './sql-service/validation'
import {
  getBindingsForTsFileUri,
  indexDslDocument,
  isDslSwirlsUri,
  isStandaloneTsSwirlsUri,
  removeBindingsForParent,
} from './ts-bindings'
import {
  getTsFileRefDefinition,
  getTsFileRefDocumentLinks,
} from './ts-file-ref-nav'
import { getPostgresPlaceholderTsTypeString } from './ts-service/context-types'
import {
  createLanguageServiceFromMap,
  virtualUriForBlock,
} from './ts-service/host'
import type { WorkspaceFileReader } from './ts-service/integration-types'
import { getExpectedReturnType } from './ts-service/return-types'
import {
  buildStandaloneTsBlockInfoFromBindings,
  buildVirtualTsContent,
  collectJsonBlocks,
  collectTsBlocks,
  offsetInInnerRangeCode,
  originalToVirtual,
  positionInRange,
  type TsBlockInfo,
  virtualToOriginal,
} from './ts-service/virtual-docs'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/**
 * Workspace folders reported by the client at initialize / via folder-change events.
 * Sorted longest-prefix-first so {@link findWorkspaceFolderForUri} picks the most specific one.
 */
let workspaceFolders: WorkspaceFolder[] = []

/** Set in `onInitialize` from client capabilities; used to register `onDidChangeWorkspaceFolders` only when safe. */
let workspaceFolderChangesSupported = false

/**
 * Per-workspace-folder cache of the resource index used for cross-file validation
 * (stream / graph / schema / auth / postgres / secret references). Cleared whenever any
 * `.swirls` document changes so edits to one file are reflected in another's diagnostics.
 *
 * Keyed by absolute workspace folder fs path.
 */
const workspaceIndexCache = new Map<string, WorkspaceResourceIndex>()

function setWorkspaceFolders(next: WorkspaceFolder[]): void {
  // Sort by URI length so longest folder URI wins when nested.
  workspaceFolders = [...next].sort((a, b) => b.uri.length - a.uri.length)
  workspaceIndexCache.clear()
}

function tryFileURIToPath(uri: string): string | null {
  try {
    return fileURLToPath(uri)
  } catch {
    return null
  }
}

function findWorkspaceFolderForUri(uri: string): WorkspaceFolder | null {
  for (const folder of workspaceFolders) {
    if (uri === folder.uri || uri.startsWith(`${folder.uri}/`)) {
      return folder
    }
  }
  return null
}

/**
 * Build a `SwirlsWorkspaceFileSystem` that overlays open document text on top of the on-disk
 * filesystem. This way the workspace index reflects unsaved edits in open buffers, not just
 * what's been written to disk.
 */
function makeOverlayFileSystem(): SwirlsWorkspaceFileSystem {
  const overlay = new Map<string, string>()
  for (const doc of documents.all()) {
    const fsPath = tryFileURIToPath(doc.uri)
    if (fsPath !== null) {
      overlay.set(fsPath, doc.getText())
    }
  }
  return {
    readdirSync: (path, opts) => fs.readdirSync(path, opts),
    existsSync: (path) => fs.existsSync(path),
    readFileSync: (path, enc) => {
      const open = overlay.get(path)
      if (open !== undefined) {
        return open
      }
      return fs.readFileSync(path, enc)
    },
  }
}

function getWorkspaceIndexForUri(uri: string): WorkspaceResourceIndex {
  const folder = findWorkspaceFolderForUri(uri)
  if (!folder) {
    return emptyWorkspaceResourceIndex()
  }
  const cwd = tryFileURIToPath(folder.uri)
  if (cwd === null) {
    return emptyWorkspaceResourceIndex()
  }
  const cached = workspaceIndexCache.get(cwd)
  if (cached) {
    return cached
  }
  let idx: WorkspaceResourceIndex
  try {
    idx = buildWorkspaceResourceIndex({
      cwd,
      fileSystem: makeOverlayFileSystem(),
    })
  } catch {
    idx = emptyWorkspaceResourceIndex()
  }
  workspaceIndexCache.set(cwd, idx)
  return idx
}

function getWorkspaceCwdForUri(uri: string): string | null {
  const folder = findWorkspaceFolderForUri(uri)
  if (!folder) {
    return null
  }
  return tryFileURIToPath(folder.uri)
}

function makeWorkspaceFileReader(cwd: string): WorkspaceFileReader {
  const fileSystem = makeOverlayFileSystem()
  return (relativePath: string) => {
    const fullPath = join(cwd, relativePath)
    try {
      if (!fileSystem.existsSync(fullPath)) {
        return undefined
      }
      return fileSystem.readFileSync(fullPath, 'utf-8')
    } catch {
      return undefined
    }
  }
}

function collectTsBlocksForUri(
  uri: string,
  ast: import('@swirls/language').SwirlsFile,
) {
  const workspace = getWorkspaceIndexForUri(uri)
  const cwd = getWorkspaceCwdForUri(uri)
  return collectTsBlocks(ast, {
    workspace,
    readWorkspaceFile: cwd ? makeWorkspaceFileReader(cwd) : undefined,
  })
}

function invalidateWorkspaceIndices(): void {
  workspaceIndexCache.clear()
}

/** Per-document cache: one TypeScript Program (LS) for all @ts { } blocks, keyed by document version. */
interface DocumentTsCache {
  version: number
  blocks: TsBlockInfo[]
  contentMap: Map<string, string>
  ls: ts.LanguageService
  /** Set for standalone `.ts.swirls` buffers only. */
  standaloneMeta?: { ambiguous: boolean; unbound: boolean }
}

const documentTsCache = new Map<string, DocumentTsCache>()
const standaloneTsCache = new Map<string, DocumentTsCache>()
const openStandaloneTsUris = new Set<string>()

async function refreshAllStandaloneDiagnostics(): Promise<void> {
  standaloneTsCache.clear()
  await Promise.all(
    [...openStandaloneTsUris].map(async (u) => {
      const d = documents.get(u)
      if (d) {
        await refreshDiagnostics(u, d)
      }
    }),
  )
}

/**
 * Get or build TS cache for a DSL `.swirls` document. Reuses cache when version matches.
 */
function getDocumentTsCache(
  uri: string,
  document: TextDocument,
): DocumentTsCache | null {
  const version = document.version
  const existing = documentTsCache.get(uri)

  if (existing && existing.version === version) {
    return existing
  }

  const text = document.getText()
  const result = parse(text)

  if (result.errors.length > 0) {
    documentTsCache.delete(uri)
    return null
  }

  const blocks = collectTsBlocksForUri(uri, result.ast)
  const contentMap = new Map<string, string>()

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block) {
      contentMap.set(
        virtualUriForBlock(String(i)),
        buildVirtualTsContent(block),
      )
    }
  }

  const ls = createLanguageServiceFromMap(contentMap)
  const cache: DocumentTsCache = { version, blocks, contentMap, ls }

  documentTsCache.set(uri, cache)
  return cache
}

function getStandaloneDocumentTsCache(
  uri: string,
  document: TextDocument,
): DocumentTsCache {
  const version = document.version
  const existing = standaloneTsCache.get(uri)

  if (existing && existing.version === version) {
    return existing
  }

  const bindings = getBindingsForTsFileUri(uri)
  const { block, ambiguous, unbound } = buildStandaloneTsBlockInfoFromBindings(
    document,
    bindings,
  )
  const contentMap = new Map<string, string>()
  contentMap.set(virtualUriForBlock('0'), buildVirtualTsContent(block))
  const ls = createLanguageServiceFromMap(contentMap)
  const cache: DocumentTsCache = {
    version,
    blocks: [block],
    contentMap,
    ls,
    standaloneMeta: { ambiguous, unbound },
  }
  standaloneTsCache.set(uri, cache)
  return cache
}

function getTsLanguageServiceCache(
  uri: string,
  document: TextDocument,
): DocumentTsCache | null {
  if (isStandaloneTsSwirlsUri(uri)) {
    return getStandaloneDocumentTsCache(uri, document)
  }
  return getDocumentTsCache(uri, document)
}

function toLspRange(r: {
  start: { line: number; column: number }
  end: { line: number; column: number }
}): {
  start: { line: number; character: number }
  end: { line: number; character: number }
} {
  return {
    start: { line: r.start.line - 1, character: r.start.column - 1 },
    end: { line: r.end.line - 1, character: r.end.column - 1 },
  }
}

/** Find the block and its index at the given position. Uses pre-parsed blocks. */
function findBlockAtIndex(
  blocks: TsBlockInfo[],
  position: Position,
): { block: TsBlockInfo; index: number } | null {
  const line = position.line
  const character = position.character

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block && positionInRange(line, character, block.innerRange)) {
      return { block, index: i }
    }
  }

  return null
}

function getStandaloneFileDiagnostics(
  uri: string,
  document: TextDocument,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const cache = getStandaloneDocumentTsCache(uri, document)
  const block = cache.blocks[0]

  if (!block) {
    return diagnostics
  }

  const meta = cache.standaloneMeta
  if (meta?.unbound) {
    diagnostics.push({
      message:
        'This file is not referenced by any `@ts "…"` in a .swirls file; `context` is loosely typed.',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      severity: DiagnosticSeverity.Hint,
    })
  }

  if (meta?.ambiguous) {
    diagnostics.push({
      message:
        'This file is referenced from multiple `@ts "…"` sites; using the first match for typings.',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      severity: DiagnosticSeverity.Warning,
    })
  }

  const virtualUri = virtualUriForBlock('0')
  const tsDiags = cache.ls.getSemanticDiagnostics(virtualUri)

  for (const d of tsDiags) {
    if (
      d.file?.fileName === virtualUri &&
      d.start !== undefined &&
      d.length !== undefined
    ) {
      const start = d.file.getLineAndCharacterOfPosition(d.start)
      const end = d.file.getLineAndCharacterOfPosition(d.start + d.length)
      const origStart = virtualToOriginal(block, start.line, start.character)
      const origEnd = virtualToOriginal(block, end.line, end.character)

      let message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      const expectedReturn = getExpectedReturnType(block)
      if (
        expectedReturn !== undefined &&
        message.includes('__ExpectedReturn')
      ) {
        message = message.replace(/__ExpectedReturn/g, expectedReturn)
        message = `${message} Expected return type for this block: \`${expectedReturn}\`.`
      }

      diagnostics.push({
        message,
        range: {
          start: { line: origStart.line, character: origStart.character },
          end: { line: origEnd.line, character: origEnd.character },
        },
        severity: DiagnosticSeverity.Error,
      })
    }
  }

  return diagnostics
}

async function getDiagnostics(
  uri: string,
  document: TextDocument,
): Promise<Diagnostic[]> {
  if (isStandaloneTsSwirlsUri(uri)) {
    return getStandaloneFileDiagnostics(uri, document)
  }

  const diagnostics: Diagnostic[] = []
  const text = document.getText()
  const result = parse(text)

  for (const err of result.errors) {
    diagnostics.push({
      message: err.message,
      range: toLspRange(err.range),
      severity: DiagnosticSeverity.Error,
    })
  }

  if (result.errors.length > 0) {
    return diagnostics
  }

  const validationDiags = validate(result.ast, {
    workspace: getWorkspaceIndexForUri(uri),
    includeUnboundComputerWarnings: true,
  })

  for (const d of validationDiags) {
    diagnostics.push({
      message: d.message,
      range: toLspRange(d.range),
      severity:
        d.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Error,
    })
  }

  if (isDslSwirlsUri(uri)) {
    try {
      const swirlsPath = fileURLToPath(uri)
      const refDiags = validateTsFileRefs(result.ast, {
        swirlsFilePath: swirlsPath,
        existsSync,
      })
      for (const d of refDiags) {
        diagnostics.push({
          message: d.message,
          range: toLspRange(d.range),
          severity:
            d.severity === 'warning'
              ? DiagnosticSeverity.Warning
              : DiagnosticSeverity.Error,
        })
      }
    } catch {
      // non-file URI
    }
  }

  const allGraphNodes = result.ast.workflows.flatMap((g) => g.nodes)
  const aiOptionsDiags = getAiNodeOptionsDiagnostics(allGraphNodes)
  for (const d of aiOptionsDiags) {
    diagnostics.push({
      message: d.message,
      range: toLspRange(d.range),
      severity:
        d.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Error,
    })
  }

  const blocks = collectTsBlocksForUri(uri, result.ast)
  const contentMap = new Map<string, string>()

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block) {
      contentMap.set(
        virtualUriForBlock(String(i)),
        buildVirtualTsContent(block),
      )
    }
  }

  const ls = createLanguageServiceFromMap(contentMap)

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    if (!block) {
      continue
    }

    const uri = virtualUriForBlock(String(i))
    const tsDiags = ls.getSemanticDiagnostics(uri)

    for (const d of tsDiags) {
      if (
        d.file?.fileName === uri &&
        d.start !== undefined &&
        d.length !== undefined
      ) {
        const start = d.file.getLineAndCharacterOfPosition(d.start)
        const end = d.file.getLineAndCharacterOfPosition(d.start + d.length)
        const origStart = virtualToOriginal(block, start.line, start.character)
        const origEnd = virtualToOriginal(block, end.line, end.character)

        let message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
        const expectedReturn = getExpectedReturnType(block)
        if (
          expectedReturn !== undefined &&
          message.includes('__ExpectedReturn')
        ) {
          message = message.replace(/__ExpectedReturn/g, expectedReturn)
          message = `${message} Expected return type for this block: \`${expectedReturn}\`.`
        }

        diagnostics.push({
          message,
          range: {
            start: { line: origStart.line, character: origStart.character },
            end: { line: origEnd.line, character: origEnd.character },
          },
          severity: DiagnosticSeverity.Error,
        })
      }
    }
  }

  const jsonBlocks = collectJsonBlocks(result.ast)

  for (let i = 0; i < jsonBlocks.length; i++) {
    const block = jsonBlocks[i]

    if (!block) {
      continue
    }

    const jsonDiags = await getJsonBlockDiagnostics(block, `block-${i}`)

    for (const d of jsonDiags) {
      diagnostics.push({
        message: d.message,
        range: d.range,
        severity: d.severity ?? DiagnosticSeverity.Error,
      })
    }
  }

  const sqlBlocks = collectSqlBlocks(result.ast)
  for (const block of sqlBlocks) {
    const sqlDiags = getSqlBlockDiagnostics(block, result.ast)
    for (const d of sqlDiags) {
      diagnostics.push({
        message: d.message,
        range: d.range,
        severity: d.severity ?? DiagnosticSeverity.Error,
      })
    }
  }

  const prismaBlocks = collectPrismaBlocks(result.ast)
  for (const block of prismaBlocks) {
    const prismaDiags = getPrismaBlockDiagnostics(block, (msg) =>
      connection.console.log(`[Swirls LSP] prisma: ${msg}`),
    )
    for (const d of prismaDiags) {
      diagnostics.push({
        message: d.message,
        range: d.range,
        severity: d.severity ?? DiagnosticSeverity.Error,
      })
    }
  }

  return diagnostics
}

/** Convert 0-based line and character in virtual content to a character offset. */
function virtualOffsetInContent(
  content: string,
  line: number,
  character: number,
): number {
  const lines = content.split('\n')
  let offset = 0

  for (let i = 0; i < line; i++) {
    offset += (lines[i]?.length ?? 0) + 1
  }

  return offset + character
}

/** Convert offset in virtual content to 0-based line and character. */
function offsetToLineChar(
  content: string,
  offset: number,
): { line: number; character: number } {
  const lines = content.split('\n')
  let pos = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineLen = (line?.length ?? 0) + 1

    if (offset < pos + lineLen) {
      return { line: i, character: offset - pos }
    }
    pos += lineLen
  }

  const last = lines[lines.length - 1]

  return {
    line: lines.length - 1,
    character: last ? last.length : 0,
  }
}

const DIAGNOSTIC_DEBOUNCE_MS = 200
let diagnosticDebounceTimer: ReturnType<typeof setTimeout> | null = null

async function refreshDiagnostics(
  uri: string,
  document: TextDocument,
): Promise<void> {
  if (isDslSwirlsUri(uri)) {
    indexDslDocument(uri, document.getText())
    await refreshAllStandaloneDiagnostics()
  }

  const diagnostics = await getDiagnostics(uri, document)
  connection.sendDiagnostics({ uri, diagnostics })
}

/** Refresh diagnostics for every open `.swirls` DSL doc. Used after cross-file invalidations. */
async function refreshAllOpenDslDiagnostics(primary?: {
  uri: string
  document: TextDocument
}): Promise<void> {
  if (primary) {
    await refreshDiagnostics(primary.uri, primary.document)
  }
  await Promise.all(
    documents.all().map(async (doc) => {
      if (primary && doc.uri === primary.uri) {
        return
      }
      if (!isDslSwirlsUri(doc.uri)) {
        return
      }
      const diagnostics = await getDiagnostics(doc.uri, doc)
      connection.sendDiagnostics({ uri: doc.uri, diagnostics })
    }),
  )
}

function scheduleRefreshDiagnostics(uri: string, document: TextDocument): void {
  if (diagnosticDebounceTimer !== null) {
    clearTimeout(diagnosticDebounceTimer)
  }

  diagnosticDebounceTimer = setTimeout(() => {
    diagnosticDebounceTimer = null
    if (isDslSwirlsUri(uri)) {
      // A change to any DSL file invalidates cross-file resource resolution; rebuild the
      // workspace index and re-validate every open DSL doc so cross-file diagnostics are fresh.
      invalidateWorkspaceIndices()
      void refreshAllOpenDslDiagnostics({ uri, document })
      return
    }
    void refreshDiagnostics(uri, document)
  }, DIAGNOSTIC_DEBOUNCE_MS)
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // `InitializeParams.capabilities.workspace.workspaceFolders` is typed as `boolean | undefined`
  // in vscode-languageserver-protocol (not the spec’s richer object form). Match that.
  workspaceFolderChangesSupported =
    params.capabilities.workspace?.workspaceFolders === true

  const initialFolders: WorkspaceFolder[] = []
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    initialFolders.push(...params.workspaceFolders)
  } else if (params.rootUri) {
    initialFolders.push({ uri: params.rootUri, name: 'root' })
  }
  setWorkspaceFolders(initialFolders)

  return {
    capabilities: {
      textDocumentSync: 1,
      completionProvider: {
        // '@' triggers Prisma attribute completions inside @prisma islands.
        triggerCharacters: [' ', ':', '.', '(', ',', '@'],
        resolveProvider: true,
      },
      hoverProvider: true,
      definitionProvider: true,
      documentLinkProvider: { resolveProvider: false },
      referencesProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ','],
      },
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
    },
  }
})

connection.onInitialized(() => {
  if (!workspaceFolderChangesSupported) {
    return
  }
  connection.workspace.onDidChangeWorkspaceFolders((event) => {
    const next = new Map<string, WorkspaceFolder>()
    for (const f of workspaceFolders) {
      next.set(f.uri, f)
    }
    for (const removed of event.removed) {
      next.delete(removed.uri)
    }
    for (const added of event.added) {
      next.set(added.uri, added)
    }
    setWorkspaceFolders([...next.values()])
  })
})

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri)

  if (!doc) {
    return null
  }

  const refDef = getTsFileRefDefinition(
    doc,
    params.position,
    params.textDocument.uri,
  )
  if (refDef) {
    return refDef
  }

  const cache = getTsLanguageServiceCache(params.textDocument.uri, doc)
  const found = cache ? findBlockAtIndex(cache.blocks, params.position) : null

  if (cache && found) {
    const { block, index } = found
    const virtualUri = virtualUriForBlock(String(index))
    const virtualContent = cache.contentMap.get(virtualUri)

    if (virtualContent === undefined) {
      return null
    }

    const ls = cache.ls

    const virt = originalToVirtual(
      block,
      params.position.line,
      params.position.character,
    )

    const offset = virtualOffsetInContent(
      virtualContent,
      virt.line,
      virt.character,
    )

    const defs = ls.getDefinitionAtPosition(virtualUri, offset)

    if (defs && defs.length > 0) {
      const docUri = params.textDocument.uri
      const locations: Location[] = []

      for (const d of defs) {
        if (d.fileName !== virtualUri) {
          continue
        }

        const start = offsetToLineChar(virtualContent, d.textSpan.start)

        const end = offsetToLineChar(
          virtualContent,
          d.textSpan.start + d.textSpan.length,
        )

        const origStart = virtualToOriginal(block, start.line, start.character)
        const origEnd = virtualToOriginal(block, end.line, end.character)

        locations.push({
          uri: docUri,
          range: {
            start: { line: origStart.line, character: origStart.character },
            end: { line: origEnd.line, character: origEnd.character },
          },
        })
      }

      if (locations.length > 0) {
        return locations
      }
    }
  }

  const parseResult = parse(doc.getText())
  if (parseResult.errors.length === 0) {
    const prismaBlock = findPrismaBlockAtPosition(
      collectPrismaBlocks(parseResult.ast),
      params.position.line,
      params.position.character,
    )
    if (prismaBlock) {
      const prismaDefs = getPrismaBlockDefinition(
        prismaBlock,
        params.position,
        params.textDocument.uri,
      )
      if (prismaDefs) {
        return prismaDefs
      }
    }
  }

  const cwd = getWorkspaceCwdForUri(params.textDocument.uri)
  const ctx =
    cwd !== null
      ? {
          workspaceIndex: getWorkspaceIndexForUri(params.textDocument.uri),
          workspaceRoot: cwd,
        }
      : undefined

  return getDefinition(doc, params.position, params.textDocument.uri, ctx)
})

connection.onDocumentLinks((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) {
    return []
  }
  return getTsFileRefDocumentLinks(doc, params.textDocument.uri)
})

connection.onReferences((params) => {
  const doc = documents.get(params.textDocument.uri)

  if (!doc) {
    return []
  }

  const cache = getTsLanguageServiceCache(params.textDocument.uri, doc)
  const found = cache ? findBlockAtIndex(cache.blocks, params.position) : null

  if (cache && found) {
    // Inside an @ts { } block: only Swirls-level references are implemented; TS symbol references could be added later.
    return []
  }

  return getReferences(
    doc,
    params.position,
    params.textDocument.uri,
    params.context.includeDeclaration,
  )
})

connection.onCompletion((params) => {
  const { line, character } = params.position
  connection.console.log(
    `[Swirls LSP] completion request: uri=${params.textDocument.uri} position=(${line},${character})`,
  )
  const doc = documents.get(params.textDocument.uri)

  if (!doc) {
    connection.console.log('[Swirls LSP] completion: no document found')
    return []
  }

  const cache = getTsLanguageServiceCache(params.textDocument.uri, doc)
  const found = cache ? findBlockAtIndex(cache.blocks, params.position) : null

  if (!cache || !found) {
    const text = doc.getText()
    const parseResult = parse(text)

    if (parseResult.errors.length === 0) {
      const prismaBlock = findPrismaBlockAtPosition(
        collectPrismaBlocks(parseResult.ast),
        params.position.line,
        params.position.character,
      )

      if (prismaBlock) {
        connection.console.log(
          `[Swirls LSP] completion: inside @prisma island of database=${prismaBlock.databaseName}`,
        )
        const list = getPrismaBlockCompletions(
          prismaBlock,
          params.position,
          params.context,
          (msg) => connection.console.log(`[Swirls LSP] prisma: ${msg}`),
        )
        return list ?? []
      }

      const sqlItems = getSqlCompletions(
        parseResult.ast,
        params.position.line,
        params.position.character,
      )

      if (sqlItems.length > 0) {
        connection.console.log(
          '[Swirls LSP] completion: inside SQL block, returning SQL completions',
        )

        return sqlItems
      }
    }

    connection.console.log(
      `[Swirls LSP] completion: not inside a ts/sql block (or parse errors), using Swirls completions`,
    )

    const items = getCompletions(
      doc,
      params.position,
      getWorkspaceIndexForUri(params.textDocument.uri),
    )
    const linePrefix = doc.getText({
      start: { line: params.position.line, character: 0 },
      end: params.position,
    })
    const trimmed = linePrefix.replace(/^\s*/, '')
    const blockContext = getBlockContext(
      doc.getText(),
      doc.offsetAt(params.position),
    )
    connection.console.log(
      `[Swirls LSP] completion: blockContext=${blockContext} trimmed=${JSON.stringify(trimmed)} items=${items.length}`,
    )
    return items
  }

  const { block, index } = found
  connection.console.log(
    `[Swirls LSP] completion: in ts block graph=${block.workflowName} node=${block.nodeName}`,
  )

  const virtualUri = virtualUriForBlock(String(index))
  const virtualContent = cache.contentMap.get(virtualUri)

  if (virtualContent === undefined) {
    return []
  }

  const ls = cache.ls

  const virt = originalToVirtual(
    block,
    params.position.line,
    params.position.character,
  )

  const offset = virtualOffsetInContent(
    virtualContent,
    virt.line,
    virt.character,
  )

  connection.console.log(
    `[Swirls LSP] completion: virtual pos=(${virt.line},${virt.character}) offset=${offset}`,
  )

  const tsCompletions = ls.getCompletionsAtPosition(
    virtualUri,
    offset,
    undefined,
  )

  if (!tsCompletions) {
    connection.console.log(
      '[Swirls LSP] completion: getCompletionsAtPosition returned null',
    )

    return []
  }

  const items: CompletionItem[] = []
  const kindMap: Record<string, CompletionItemKind> = {
    [ts.ScriptElementKind.functionElement]: CompletionItemKind.Function,
    [ts.ScriptElementKind.variableElement]: CompletionItemKind.Variable,
    [ts.ScriptElementKind.memberVariableElement]: CompletionItemKind.Field,
    [ts.ScriptElementKind.memberFunctionElement]: CompletionItemKind.Method,
    [ts.ScriptElementKind.keyword]: CompletionItemKind.Keyword,
  }

  for (const e of tsCompletions.entries) {
    if (e.name === '__expr') {
      continue
    }

    items.push({
      label: e.name,
      kind: kindMap[e.kind] ?? CompletionItemKind.Text,
      detail: e.kind,
      data: {
        type: 'ts',
        uri: params.textDocument.uri,
        line: params.position.line,
        character: params.position.character,
        blockIndex: index,
        entryName: e.name,
        entryData: (e as { data?: unknown }).data,
      },
    })
  }

  connection.console.log(
    `[Swirls LSP] completion: returning ${items.length} TS completion items`,
  )

  return items
})

interface TsCompletionData {
  type: 'ts'
  uri: string
  line: number
  character: number
  blockIndex?: number
  entryName: string
  entryData?: unknown
}

connection.onCompletionResolve((item) => {
  const data = item.data as TsCompletionData | undefined

  if (!data || data.type !== 'ts') {
    return item
  }

  const doc = documents.get(data.uri)

  if (!doc) {
    return item
  }

  const cache = getTsLanguageServiceCache(data.uri, doc)
  const position = { line: data.line, character: data.character }
  const found = cache ? findBlockAtIndex(cache.blocks, position) : null

  if (!cache || !found) {
    return item
  }

  const { block, index } = found
  const virtualUri = virtualUriForBlock(String(index))
  const virtualContent = cache.contentMap.get(virtualUri)

  if (virtualContent === undefined) {
    return item
  }

  const ls = cache.ls
  const virt = originalToVirtual(block, data.line, data.character)

  const offset = virtualOffsetInContent(
    virtualContent,
    virt.line,
    virt.character,
  )

  const details = ls.getCompletionEntryDetails(
    virtualUri,
    offset,
    data.entryName,
    undefined,
    undefined,
    undefined,
    data.entryData as ts.CompletionEntryData | undefined,
  )

  if (!details) {
    return item
  }

  const out = { ...item }
  out.detail = ts.displayPartsToString(details.displayParts) || item.detail

  if (details.documentation && details.documentation.length > 0) {
    out.documentation = {
      kind: 'markdown',
      value: ts.displayPartsToString(details.documentation),
    }
  }

  return out
})

connection.onSignatureHelp((params) => {
  const doc = documents.get(params.textDocument.uri)

  if (!doc) {
    return null
  }

  const cache = getTsLanguageServiceCache(params.textDocument.uri, doc)
  const found = cache ? findBlockAtIndex(cache.blocks, params.position) : null

  if (!cache || !found) {
    return null
  }

  const { block, index } = found
  const virtualUri = virtualUriForBlock(String(index))
  const virtualContent = cache.contentMap.get(virtualUri)

  if (virtualContent === undefined) {
    return null
  }

  const ls = cache.ls
  const virt = originalToVirtual(
    block,
    params.position.line,
    params.position.character,
  )

  const offset = virtualOffsetInContent(
    virtualContent,
    virt.line,
    virt.character,
  )

  const help = ls.getSignatureHelpItems(virtualUri, offset, undefined)

  if (!help || help.items.length === 0) {
    return null
  }

  const signatures: SignatureInformation[] = help.items.map((item) => {
    const label =
      ts.displayPartsToString(item.prefixDisplayParts) +
      item.parameters
        .map((p) => ts.displayPartsToString(p.displayParts))
        .join(ts.displayPartsToString(item.separatorDisplayParts)) +
      ts.displayPartsToString(item.suffixDisplayParts)

    const parameters: ParameterInformation[] = item.parameters.map((p) => ({
      label: p.name,
      documentation: ts.displayPartsToString(p.documentation) || undefined,
    }))

    return { label, parameters }
  })

  return {
    signatures,
    activeSignature: help.selectedItemIndex,
    activeParameter: help.argumentIndex,
  } satisfies SignatureHelp
})

connection.onHover((params) => {
  const { line, character } = params.position
  connection.console.log(
    `[Swirls LSP] hover request: uri=${params.textDocument.uri} position=(${line},${character})`,
  )

  const doc = documents.get(params.textDocument.uri)

  if (!doc) {
    connection.console.log('[Swirls LSP] hover: no document found')
    return null
  }

  const cache = getTsLanguageServiceCache(params.textDocument.uri, doc)
  const found = cache ? findBlockAtIndex(cache.blocks, params.position) : null

  if (!cache || !found) {
    // Not inside a ts block: try swirls-level hover (form, graph, node, etc.)
    const result = parse(doc.getText())

    if (result.errors.length === 0) {
      const prismaBlock = findPrismaBlockAtPosition(
        collectPrismaBlocks(result.ast),
        params.position.line,
        params.position.character,
      )

      if (prismaBlock) {
        return getPrismaBlockHover(prismaBlock, params.position, (msg) =>
          connection.console.log(`[Swirls LSP] prisma: ${msg}`),
        )
      }

      const word = getWordAtPosition(doc, params.position)

      if (word === 'review') {
        const nodeCtx = getNodeContextAtPosition(
          doc,
          params.position,
          result.ast,
        )

        if (nodeCtx) {
          const line = doc.getText({
            start: { line: params.position.line, character: 0 },
            end: { line: params.position.line, character: 1 << 20 },
          })

          const match = line.match(/\breview\b/)

          if (match && match.index !== undefined) {
            const startChar = match.index

            return {
              contents: { kind: 'markdown', value: REVIEW_PROPERTY_HOVER },
              range: {
                start: {
                  line: params.position.line,
                  character: startChar,
                },
                end: {
                  line: params.position.line,
                  character: startChar + 6,
                },
              },
            }
          }
        }
      }

      const sqlBlocks = collectSqlBlocks(result.ast)
      const sqlBlock = findSqlBlockAtPosition(
        sqlBlocks,
        params.position.line,
        params.position.character,
      )
      if (
        sqlBlock &&
        sqlBlock.node.type === 'postgres' &&
        (sqlBlock.sqlField === 'select' ||
          sqlBlock.sqlField === 'insert' ||
          sqlBlock.sqlField === 'update' ||
          sqlBlock.sqlField === 'delete')
      ) {
        const off = offsetInInnerRangeCode(
          doc,
          params.position,
          sqlBlock.innerRange,
          sqlBlock.code.length,
        )
        if (off !== null) {
          const key = findBracePlaceholderKeyAtCodeOffset(sqlBlock.code, off)
          if (key) {
            const ts = getPostgresPlaceholderTsTypeString(
              sqlBlock.node,
              sqlBlock.postgresBlocks,
              key,
            )
            const typeLine =
              ts !== undefined
                ? `\`${ts}\``
                : '`unknown` (not in declared table row schema)'
            return {
              contents: {
                kind: 'markdown',
                value: `\`{{${key}}}\`\n\n**Type:** ${typeLine}`,
              },
            }
          }
        }
      }

      const harnessHover = getHarnessHover(doc, params.position, result.ast)

      if (harnessHover) {
        return {
          contents: { kind: 'markdown', value: harnessHover.value },
          range: harnessHover.range,
        }
      }

      const swirlsDecl = getDeclarationAtPosition(
        doc,
        params.position,
        result.ast,
        getWorkspaceIndexForUri(params.textDocument.uri),
      )

      if (swirlsDecl) {
        const decl = swirlsDecl.decl as DeclWithDoc
        const content = buildHoverContent({ description: decl.description })

        if (content && decl.range) {
          const lspRange = toLspRange(decl.range)

          return {
            contents: { kind: 'markdown', value: content },
            range: lspRange,
          }
        }
      }
    }

    connection.console.log(
      `[Swirls LSP] hover: not inside a ts block (or parse errors). position=(${line},${character})`,
    )

    return null
  }

  const { block, index } = found

  connection.console.log(
    `[Swirls LSP] hover: in ts block graph=${block.workflowName} node=${block.nodeName} innerRange=L${block.innerRange.start.line}:${block.innerRange.start.column}-L${block.innerRange.end.line}:${block.innerRange.end.column}`,
  )

  const virtualUri = virtualUriForBlock(String(index))
  const virtualContent = cache.contentMap.get(virtualUri)

  if (virtualContent === undefined) {
    return null
  }

  const ls = cache.ls

  const virt = originalToVirtual(
    block,
    params.position.line,
    params.position.character,
  )

  const offset = virtualOffsetInContent(
    virtualContent,
    virt.line,
    virt.character,
  )

  connection.console.log(
    `[Swirls LSP] hover: virtual pos=(${virt.line},${virt.character}) offset=${offset} contentLength=${virtualContent.length}`,
  )

  const info = ls.getQuickInfoAtPosition(virtualUri, offset)

  if (!info) {
    connection.console.log(
      '[Swirls LSP] hover: getQuickInfoAtPosition returned null',
    )
    return null
  }

  let display = ts.displayPartsToString(info.displayParts)
  const expectedReturn = getExpectedReturnType(block)

  if (expectedReturn !== undefined && display.includes('__ExpectedReturn')) {
    display = display.replace(/__ExpectedReturn/g, expectedReturn)
  }

  const docs = info.documentation
    ? ts.displayPartsToString(info.documentation)
    : ''

  connection.console.log(
    `[Swirls LSP] hover: returning quickInfo display="${display.slice(0, 80)}${display.length > 80 ? '...' : ''}"`,
  )

  return {
    contents: {
      kind: 'markdown',
      value: markdownTsQuickInfo(display, docs),
    },
    range: {
      start: params.position,
      end: params.position,
    },
  }
})

documents.onDidOpen(
  (e: { document: TextDocument } | { textDocument: { uri: string } }) => {
    const uri = 'textDocument' in e ? e.textDocument.uri : e.document.uri
    const doc = documents.get(uri)

    if (isStandaloneTsSwirlsUri(uri)) {
      openStandaloneTsUris.add(uri)
    }

    if (isDslSwirlsUri(uri)) {
      invalidateWorkspaceIndices()
    }

    if (doc) {
      void refreshDiagnostics(uri, doc)
    }
  },
)

documents.onDidChangeContent((e: TextDocumentChangeEvent<TextDocument>) => {
  const doc = documents.get(e.document.uri)

  if (doc) {
    // scheduleRefreshDiagnostics handles workspace-index invalidation + cross-file refresh
    // for `.swirls` DSL docs after the debounce.
    scheduleRefreshDiagnostics(e.document.uri, doc)
  }
})

documents.onDidClose((e) => {
  const uri = e.document.uri
  documentTsCache.delete(uri)
  standaloneTsCache.delete(uri)
  if (isStandaloneTsSwirlsUri(uri)) {
    openStandaloneTsUris.delete(uri)
  }
  if (isDslSwirlsUri(uri)) {
    removeBindingsForParent(uri)
    invalidateWorkspaceIndices()
    void refreshAllStandaloneDiagnostics()
  }
  connection.sendDiagnostics({ uri, diagnostics: [] })
})

connection.onDidChangeWatchedFiles(() => {
  invalidateWorkspaceIndices()
  for (const doc of documents.all()) {
    if (isDslSwirlsUri(doc.uri)) {
      void refreshDiagnostics(doc.uri, doc)
    }
  }
})

documents.listen(connection)
connection.listen()
