import { dirname, isAbsolute, join, normalize } from 'pathe'

/** Resolve a @ts "path" relative to the directory of the authoring .swirls file. */
export function resolveTsRefFullPath(
  swirlsFilePath: string,
  refPath: string,
): string {
  const base = dirname(swirlsFilePath)
  const trimmed = refPath.trim()
  if (isAbsolute(trimmed)) {
    return normalize(trimmed)
  }
  return normalize(join(base, trimmed))
}

export function pathEndsWithTsSwirls(p: string): boolean {
  return p.replace(/\\/g, '/').toLowerCase().endsWith('.ts.swirls')
}
