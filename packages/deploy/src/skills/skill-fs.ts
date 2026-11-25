import { utf8Bytes } from '../bytes'
import type { DeployBundleFs } from '../fs'

export interface SkillDeployStat {
  isSymbolicLink: boolean
  isFile: boolean
  isDirectory: boolean
  mode?: number
}

/** Filesystem surface for resolving local skill trees at deploy time. */
export interface SkillDeployFs extends DeployBundleFs {
  readFileBuffer(path: string): Uint8Array
  lstatSync(path: string): SkillDeployStat
}

/** Adapt a text-only {@link DeployBundleFs} for skill resolution in tests/archives. */
export function deployBundleToSkillDeployFs(fs: DeployBundleFs): SkillDeployFs {
  return {
    readdirSync: fs.readdirSync.bind(fs),
    readFileSync: fs.readFileSync.bind(fs),
    readFileBuffer(absPath: string) {
      return utf8Bytes(fs.readFileSync(absPath, 'utf-8'))
    },
    lstatSync(absPath: string) {
      let isFile = false
      let isDirectory = false

      try {
        fs.readFileSync(absPath, 'utf-8')
        isFile = true
      } catch {
        isDirectory = true
      }

      return {
        isSymbolicLink: false,
        isFile,
        isDirectory,
        mode: isFile ? 0o644 : 0o755,
      }
    },
  }
}
