import { type ParseResult, parse } from './parser'

/**
 * Memoizes {@link parse} by source text.
 *
 * Parsing is a pure function of the text, so the text itself is the key: there
 * is no path, version or mtime to keep in sync, and a file that is renamed,
 * reverted or opened in an editor with unchanged contents is still a hit.
 *
 * Results are shared between callers and must be treated as read-only. A
 * caller that needs to rewrite an AST (for example to inline `@ts "path"`
 * references) should call {@link parse} directly.
 */
export interface ParseCache {
  parse(source: string): ParseResult
  clear(): void
  readonly size: number
  /** Lookups answered from the cache, and lookups that had to parse. */
  readonly stats: { readonly hits: number; readonly misses: number }
}

export interface ParseCacheOptions {
  /**
   * Entries kept before the least recently used one is dropped. It should be
   * at least the number of `.swirls` files in the workspace, or a full index
   * build evicts entries it is about to need. Default 2048.
   */
  maxEntries?: number
}

export function createParseCache(options: ParseCacheOptions = {}): ParseCache {
  const maxEntries = Math.max(1, options.maxEntries ?? 2048)
  // A Map iterates in insertion order, so re-inserting on a hit keeps the
  // least recently used entry first.
  const entries = new Map<string, ParseResult>()
  const stats = { hits: 0, misses: 0 }

  return {
    parse(source) {
      const cached = entries.get(source)
      if (cached !== undefined) {
        stats.hits++
        entries.delete(source)
        entries.set(source, cached)
        return cached
      }
      stats.misses++
      const result = parse(source)
      entries.set(source, result)
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next()
        if (!oldest.done) {
          entries.delete(oldest.value)
        }
      }
      return result
    },
    clear() {
      entries.clear()
    },
    get size() {
      return entries.size
    },
    stats,
  }
}
