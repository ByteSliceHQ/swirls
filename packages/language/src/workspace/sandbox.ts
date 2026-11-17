import fs from 'node:fs'

/** Minimal directory entry for `.swirls` discovery (compatible with Node `Dirent` and deploy `DeployBundleDirent`). */
export interface SwirlsWorkspaceDirent {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

/**
 * Filesystem surface required to discover and resolve `.swirls` files on disk or in a virtual tree.
 * Callers pass a plain object (e.g. `node:fs` or deploy `DeployBundleFs` + `existsSync` shim).
 */
export interface SwirlsWorkspaceFileSystem {
  readdirSync(path: string, options: { withFileTypes: true }): SwirlsWorkspaceDirent[]
  readFileSync(path: string, encoding: 'utf-8'): string
  existsSync(path: string): boolean
}

/** Default workspace filesystem backed by `node:fs`. */
export const nodeWorkspaceFileSystem: SwirlsWorkspaceFileSystem = {
  readdirSync: (path, opts) => fs.readdirSync(path, opts),
  readFileSync: (path, enc) => fs.readFileSync(path, enc),
  existsSync: (path) => fs.existsSync(path),
}
