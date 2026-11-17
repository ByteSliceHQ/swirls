import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

/** Resolve `typescript/lib/*.d.ts` from the installed `typescript` package, or from `typescript-lib/` next to server.js (VSIX / packaged extension). */
const require = createRequire(import.meta.url)

/** Packaged extension: `server/typescript-lib/` is a copy of `node_modules/typescript/lib` (see editors/vscode build:server). */
function resolveBundledTypescriptLibDirectory(): string | undefined {
  try {
    const serverDir = path.dirname(fileURLToPath(import.meta.url))
    const bundled = path.join(serverDir, 'typescript-lib')

    if (fs.existsSync(path.join(bundled, 'lib.es2022.d.ts'))) {
      return bundled
    }
  } catch {
    // ignore
  }

  return undefined
}

function resolveTypescriptLibDirectory(): string | undefined {
  try {
    const resolved = require.resolve('typescript/lib/lib.es2022.d.ts')
    return path.dirname(resolved)
  } catch {
    return resolveBundledTypescriptLibDirectory()
  }
}

/** TS may pass absolute paths or bare names like `lib.dom.d.ts` depending on getCurrentDirectory. */
function resolveLibRequestPath(libDir: string, requestedPath: string): string {
  const n = path.normalize(requestedPath)

  if (path.isAbsolute(n)) {
    return n
  }

  return path.normalize(path.join(libDir, path.basename(requestedPath)))
}

function isLibPath(libDir: string, defaultLibPath: string, requestedPath: string): boolean {
  const resolved = resolveLibRequestPath(libDir, requestedPath)

  if (resolved === path.normalize(defaultLibPath)) {
    return true
  }

  const normLibDir = path.normalize(libDir) + path.sep
  return resolved.startsWith(normLibDir) && resolved.endsWith('.d.ts')
}

/** Shared compiler options for virtual @ts LanguageServiceHost instances. */
const virtualTsCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
}

/** Synthetic file path for virtual TS documents. Plain path (no URI scheme) so TypeScript's program includes it. */
export function virtualUriForBlock(blockId: string): string {
  return `__swirls_ts_block_${blockId}.ts`
}

/**
 * Version string for a virtual file. The shared document registry reuses a
 * parsed source file whenever name and version match, so this has to be a real
 * content hash: a collision would serve a stale file.
 */
function scriptVersion(content: string): string {
  return createHash('sha1').update(content).digest('base64')
}

function loadLibFile(filePath: string): string | undefined {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.length > 0 ? content : undefined
  } catch {
    return undefined
  }
}

function resolveVirtualLib(compilerOptions: ts.CompilerOptions): {
  defaultLibPath: string
  libDir: string
  defaultLibContent: string | undefined
} {
  const defaultLibPathFromTs = ts.getDefaultLibFilePath(compilerOptions)
  const libFileName = path.basename(defaultLibPathFromTs)
  let defaultLibPath = defaultLibPathFromTs
  let libDir = path.dirname(defaultLibPathFromTs)
  let defaultLibContent = loadLibFile(defaultLibPath)

  if (!defaultLibContent) {
    const altDir = resolveTypescriptLibDirectory()

    if (altDir) {
      const candidate = path.join(altDir, libFileName)
      const alt = loadLibFile(candidate)

      if (alt) {
        defaultLibPath = candidate
        libDir = altDir
        defaultLibContent = alt
      }
    }
  }

  return { defaultLibPath, libDir, defaultLibContent }
}

function createTypeScriptHost(fileName: string, content: string): ts.LanguageServiceHost {
  const compilerOptions = virtualTsCompilerOptions
  const { defaultLibPath, libDir, defaultLibContent } = resolveVirtualLib(compilerOptions)

  const version = scriptVersion(content)
  const libCache = new Map<string, string>()

  function getLibContent(name: string): string | undefined {
    const fullPath = resolveLibRequestPath(libDir, name)

    if (fullPath === path.normalize(defaultLibPath)) {
      return defaultLibContent ?? undefined
    }

    if (!isLibPath(libDir, defaultLibPath, name)) {
      return undefined
    }

    const cached = libCache.get(fullPath)

    if (cached !== undefined) {
      return cached
    }

    const fileContent = loadLibFile(fullPath)

    if (fileContent !== undefined) {
      libCache.set(fullPath, fileContent)
    }

    return fileContent
  }

  return {
    getCompilationSettings: (): ts.CompilerOptions => compilerOptions,
    getScriptFileNames: (): string[] => [fileName],
    getScriptVersion: () => version,
    getScriptSnapshot: (name: string): ts.IScriptSnapshot | undefined => {
      if (name === fileName) {
        return ts.ScriptSnapshot.fromString(content)
      }

      const libContent = getLibContent(name)

      if (libContent !== undefined) {
        return ts.ScriptSnapshot.fromString(libContent)
      }

      return undefined
    },
    /** Required so /// <reference lib="dom" /> resolves under libDir, not extension/server/lib.dom.d.ts */
    getCurrentDirectory: () => libDir,
    getDefaultLibFileName: () => defaultLibPath,
    readFile: (name: string): string | undefined => {
      if (name === fileName) {
        return content
      }

      return getLibContent(name)
    },
    fileExists: (name: string): boolean => {
      if (name === fileName) {
        return true
      }

      const fullPath = resolveLibRequestPath(libDir, name)

      if (fullPath === path.normalize(defaultLibPath)) {
        return defaultLibContent !== undefined
      }

      if (isLibPath(libDir, defaultLibPath, name)) {
        try {
          return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()
        } catch {
          return false
        }
      }

      return false
    },
  }
}

/**
 * Shared by every language service the server creates, so the parsed standard
 * library (several megabytes of `lib.*.d.ts`) is built once per process and
 * not once per service. A service must be `dispose()`d when it is dropped, or
 * the registry keeps its source files alive.
 */
const documentRegistry = ts.createDocumentRegistry()

export function createLanguageService(fileName: string, content: string): ts.LanguageService {
  const host = createTypeScriptHost(fileName, content)
  return ts.createLanguageService(host, documentRegistry)
}

/**
 * Create a LanguageServiceHost that serves multiple virtual TS files (e.g. one per @ts { } block).
 * contentMap is held by reference; mutate it when the document changes so the same LS sees new content.
 */
function createMultiFileTypeScriptHost(contentMap: Map<string, string>): ts.LanguageServiceHost {
  const compilerOptions = virtualTsCompilerOptions
  const { defaultLibPath, libDir, defaultLibContent } = resolveVirtualLib(compilerOptions)
  const libCache = new Map<string, string>()

  function getLibContent(name: string): string | undefined {
    const fullPath = resolveLibRequestPath(libDir, name)

    if (fullPath === path.normalize(defaultLibPath)) {
      return defaultLibContent ?? undefined
    }

    if (!isLibPath(libDir, defaultLibPath, name)) {
      return undefined
    }

    const cached = libCache.get(fullPath)

    if (cached !== undefined) {
      return cached
    }

    const fileContent = loadLibFile(fullPath)

    if (fileContent !== undefined) {
      libCache.set(fullPath, fileContent)
    }

    return fileContent
  }

  return {
    getCompilationSettings: (): ts.CompilerOptions => compilerOptions,
    getScriptFileNames: (): string[] => Array.from(contentMap.keys()),
    getScriptVersion: (fileName: string): string => {
      const content = contentMap.get(fileName)

      if (content !== undefined) {
        return scriptVersion(content)
      }

      return ''
    },
    getScriptSnapshot: (name: string): ts.IScriptSnapshot | undefined => {
      const content = contentMap.get(name)

      if (content !== undefined) {
        return ts.ScriptSnapshot.fromString(content)
      }

      const libContent = getLibContent(name)

      if (libContent !== undefined) {
        return ts.ScriptSnapshot.fromString(libContent)
      }

      return undefined
    },
    getCurrentDirectory: () => libDir,
    getDefaultLibFileName: () => defaultLibPath,
    readFile: (name: string): string | undefined => {
      const content = contentMap.get(name)

      if (content !== undefined) {
        return content
      }

      return getLibContent(name)
    },
    fileExists: (name: string): boolean => {
      if (contentMap.has(name)) {
        return true
      }

      const fullPath = resolveLibRequestPath(libDir, name)

      if (fullPath === path.normalize(defaultLibPath)) {
        return defaultLibContent !== undefined
      }

      if (isLibPath(libDir, defaultLibPath, name)) {
        try {
          return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()
        } catch {
          return false
        }
      }

      return false
    },
  }
}

/**
 * Create a single LanguageService for all virtual files in contentMap.
 * Use this for one Program per document; pass the same map reference and update it on document change.
 */
export function createLanguageServiceFromMap(contentMap: Map<string, string>): ts.LanguageService {
  const host = createMultiFileTypeScriptHost(contentMap)
  return ts.createLanguageService(host, documentRegistry)
}
