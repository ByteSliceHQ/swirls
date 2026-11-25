import { collectSwirlsFiles as collectSwirlsFilesWorkspace } from '@swirls/language/workspace'

import { type DeployBundleFs, deployBundleToWorkspaceFileSystem } from './fs'

/**
 * Recursively find all `.swirls` files under `dir`, returning relative paths from `cwd`.
 */
export function collectSwirlsFiles(
  fs: DeployBundleFs,
  cwd: string,
  dir: string = cwd,
  acc: string[] = [],
): string[] {
  return collectSwirlsFilesWorkspace({
    cwd,
    fileSystem: deployBundleToWorkspaceFileSystem(fs),
    dir,
    acc,
  })
}
