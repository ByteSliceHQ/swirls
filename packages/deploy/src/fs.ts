import type { SwirlsWorkspaceFileSystem } from '@swirls/language/workspace'

/** Minimal filesystem surface for scanning and reading `.swirls` sources. */
export interface DeployBundleDirent {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

export interface DeployBundleFs {
  readdirSync(
    path: string,
    options: {
      withFileTypes: true
    },
  ): DeployBundleDirent[]
  readFileSync(path: string, encoding: 'utf-8'): string
}

/**
 * Adapts {@link DeployBundleFs} to {@link SwirlsWorkspaceFileSystem} for shared workspace helpers.
 */
export function deployBundleToWorkspaceFileSystem(fs: DeployBundleFs): SwirlsWorkspaceFileSystem {
  return {
    readdirSync: fs.readdirSync.bind(fs),
    readFileSync: fs.readFileSync.bind(fs),
    existsSync: (p) => {
      try {
        fs.readFileSync(p, 'utf-8')
        return true
      } catch {
        return false
      }
    },
  }
}
