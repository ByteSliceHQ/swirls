import { utf8Bytes, utf8Text } from '../bytes'
import type { SkillDeployFs, SkillDeployStat } from './skill-fs'

type MemoryNode =
  | { kind: 'file'; content: Uint8Array; mode?: number }
  | { kind: 'dir' }
  | { kind: 'symlink'; target: string }

/** In-memory skill FS for unit tests (posix paths relative to virtual root). */
export function createMemorySkillDeployFs(
  files: Record<string, Uint8Array | string>,
  virtualRoot: string,
): SkillDeployFs {
  const root = virtualRoot.replace(/\/$/, '') || '/project'
  const nodes = new Map<string, MemoryNode>()

  for (const [relPath, content] of Object.entries(files)) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
    const parts = normalized.split('/').filter(Boolean)
    let current = ''

    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i]!

      if (!nodes.has(current)) {
        nodes.set(current, { kind: 'dir' })
      }
    }

    const filePath = parts.join('/')

    nodes.set(filePath, {
      kind: 'file',
      content: typeof content === 'string' ? utf8Bytes(content) : content,
      mode: 0o644,
    })
  }

  function toRel(absPath: string): string {
    const normalized = absPath.replace(/\\/g, '/')
    const prefix = `${root}/`

    if (normalized === root) {
      return ''
    }

    if (!normalized.startsWith(prefix)) {
      throw new Error(`Path outside virtual root: ${absPath}`)
    }

    return normalized.slice(prefix.length)
  }

  function statFor(rel: string): SkillDeployStat {
    const node = nodes.get(rel)

    if (!node) {
      throw new Error(`ENOENT: ${rel}`)
    }

    if (node.kind === 'symlink') {
      return {
        isSymbolicLink: true,
        isFile: false,
        isDirectory: false,
      }
    }

    if (node.kind === 'dir') {
      return {
        isSymbolicLink: false,
        isFile: false,
        isDirectory: true,
        mode: 0o755,
      }
    }

    return {
      isSymbolicLink: false,
      isFile: true,
      isDirectory: false,
      mode: node.mode,
    }
  }

  return {
    readdirSync(absDir, _options) {
      const relDir = toRel(absDir)
      const prefix = relDir === '' ? '' : `${relDir}/`
      const names = new Set<string>()

      for (const key of nodes.keys()) {
        if (relDir !== '' && !key.startsWith(prefix)) {
          continue
        }

        const rest = relDir === '' ? key : key.slice(prefix.length)
        const slash = rest.indexOf('/')

        if (slash === -1 && rest) {
          names.add(rest)
        } else if (slash > 0) {
          names.add(rest.slice(0, slash))
        }
      }

      return [...names].sort().map((name) => {
        const childRel = relDir === '' ? name : `${relDir}/${name}`
        const node = nodes.get(childRel)
        const isFile = node?.kind === 'file'

        const isDirectory =
          node?.kind === 'dir' ||
          [...nodes.keys()].some((k) => k.startsWith(`${childRel}/`) && k !== childRel)

        return {
          name,
          isFile: () => isFile,
          isDirectory: () => isDirectory && !isFile,
        }
      })
    },

    readFileSync(absPath, _encoding) {
      const rel = toRel(absPath)
      const node = nodes.get(rel)

      if (!node || node.kind !== 'file') {
        throw new Error(`ENOENT: ${absPath}`)
      }

      return utf8Text(node.content)
    },

    readFileBuffer(absPath) {
      const rel = toRel(absPath)
      const node = nodes.get(rel)

      if (!node || node.kind !== 'file') {
        throw new Error(`ENOENT: ${absPath}`)
      }

      return node.content
    },

    lstatSync(absPath) {
      return statFor(toRel(absPath))
    },
  }
}

export function memorySkillProjectRoot(virtualRoot: string): string {
  return virtualRoot.replace(/\/$/, '') || '/project'
}
