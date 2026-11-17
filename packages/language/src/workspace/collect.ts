import { join } from 'pathe'
import {
  nodeWorkspaceFileSystem,
  type SwirlsWorkspaceFileSystem,
} from './sandbox'

const IGNORE_DIRS = new Set(['node_modules', '__fixtures__'])

function collectSwirlsFilesRecursive(
  cwd: string,
  fileSystem: SwirlsWorkspaceFileSystem,
  dir: string,
  acc: string[],
): void {
  const entries = fileSystem.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = join(dir, entry.name)
    const relative = full.slice(cwd.length).replace(/^[/\\]+/, '')

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue
      }
      collectSwirlsFilesRecursive(cwd, fileSystem, full, acc)
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.swirls') &&
      !entry.name.endsWith('.ts.swirls')
    ) {
      acc.push(relative)
    }
  }
}

export function collectSwirlsFiles(args: {
  cwd: string
  fileSystem?: SwirlsWorkspaceFileSystem
  dir?: string
  acc?: string[]
}): string[] {
  const cwd = args.cwd
  const fileSystem = args.fileSystem ?? nodeWorkspaceFileSystem
  const dir = args.dir ?? cwd
  const acc = args.acc ?? []

  collectSwirlsFilesRecursive(cwd, fileSystem, dir, acc)
  return acc
}
