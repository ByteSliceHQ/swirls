import type fs from 'node:fs'

import type { SkillDeployFs } from './skills/skill-fs'

export function createNodeDeployBundleFs(nodeFs: typeof fs): SkillDeployFs {
  return {
    readdirSync: (path, options) => nodeFs.readdirSync(path, options),
    readFileSync: (path, encoding) => nodeFs.readFileSync(path, encoding),
    readFileBuffer: (path) => new Uint8Array(nodeFs.readFileSync(path)),
    lstatSync: (path) => {
      const stat = nodeFs.lstatSync(path)
      return {
        isSymbolicLink: stat.isSymbolicLink(),
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        mode: stat.mode,
      }
    },
  }
}
