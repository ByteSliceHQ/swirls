import type { DeployBundleDirent, DeployBundleFs } from './fs'

/**
 * Build a virtual FS from a flat map of **posix** paths relative to the repo root
 * (e.g. `packages/app/graph.swirls` → file contents). Used with GitHub archive trees.
 *
 * @param files — keys must not start with `/`; use forward slashes only.
 * @param virtualRoot — absolute-style posix root for `cwd`, e.g. `/repo`
 */
export function createMemoryRepoFs(
  files: Map<string, string>,
  virtualRoot: string,
): DeployBundleFs {
  const root = virtualRoot.replace(/\/$/, '') || '/repo'

  const normalized = new Map<string, string>()

  for (const [k, v] of files) {
    const key = k.replace(/^\/+/, '').replace(/\\/g, '/')
    normalized.set(key, v)
  }

  function toRel(absPath: string): string {
    const a = absPath.replace(/\\/g, '/')
    const r = root

    if (a === r) {
      return ''
    }

    const prefix = `${r}/`

    if (!a.startsWith(prefix)) {
      throw new Error(`Path outside virtual root: ${absPath}`)
    }

    return a.slice(prefix.length)
  }

  return {
    readdirSync(absDir: string, _options: { withFileTypes: true }): DeployBundleDirent[] {
      const relDir = toRel(absDir)
      const prefix = relDir === '' ? '' : `${relDir}/`
      const names = new Set<string>()

      for (const key of normalized.keys()) {
        if (relDir !== '' && !key.startsWith(prefix)) {
          continue
        }

        if (relDir !== '' && key === relDir) {
          continue
        }

        const rest = relDir === '' ? key : key.slice(prefix.length)
        const slash = rest.indexOf('/')

        if (slash === -1) {
          names.add(rest)
        } else {
          names.add(rest.slice(0, slash))
        }
      }

      return [...names].sort().map((name) => {
        const childRel = relDir === '' ? name : `${relDir}/${name}`

        const isDir = [...normalized.keys()].some(
          (k) => k === childRel || k.startsWith(`${childRel}/`),
        )

        const isFile = normalized.has(childRel)
        return {
          name,
          isDirectory: () => isDir && !isFile,
          isFile: () => isFile,
        }
      })
    },

    readFileSync(absPath: string, _encoding: 'utf-8'): string {
      const rel = toRel(absPath)
      const content = normalized.get(rel)

      if (content === undefined) {
        throw new Error(`ENOENT: ${absPath}`)
      }

      return content
    },
  }
}

/**
 * Strip a single top-level directory prefix from archive paths (e.g. `owner-repo-sha/...`).
 * Returns a new map suitable for {@link createMemoryRepoFs}.
 */
export function flattenArchivePathMap(paths: Map<string, string>): Map<string, string> {
  if (paths.size === 0) {
    return paths
  }

  const firstKeys = [...paths.keys()].map((k) => k.replace(/\\/g, '/'))
  const segments = firstKeys.map((k) => k.split('/').filter(Boolean))

  if (segments.length === 0 || segments[0]?.length === 0) {
    return paths
  }

  const firstSeg = segments[0]?.[0]
  const allShare = firstSeg && segments.every((s) => s.length > 0 && s[0] === firstSeg)

  if (!allShare) {
    return paths
  }

  const prefix = `${firstSeg}/`
  const out = new Map<string, string>()

  for (const [k, v] of paths) {
    const nk = k.replace(/\\/g, '/')

    if (!nk.startsWith(prefix)) {
      return paths
    }

    out.set(nk.slice(prefix.length), v)
  }

  return out
}

/** Join virtual root with a relative posix path. */
export function virtualRepoCwd(virtualRoot: string): string {
  return virtualRoot.replace(/\/$/, '') || '/repo'
}

/**
 * Keep only files under `rootPath` (posix, no leading slash) and strip that prefix
 * from keys. Used for monorepo subdirectory links.
 */
export function sliceRepoFilesToRoot(
  files: Map<string, string>,
  rootPath: string,
): Map<string, string> {
  const seg = rootPath.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/')

  if (!seg) {
    return files
  }

  const prefix = `${seg}/`
  const out = new Map<string, string>()

  for (const [k, v] of files) {
    const n = k.replace(/\\/g, '/')

    if (n.startsWith(prefix)) {
      out.set(n.slice(prefix.length), v)
    } else if (n === seg) {
      const base = seg.split('/').pop()

      if (base) {
        out.set(base, v)
      }
    }
  }

  return out
}
