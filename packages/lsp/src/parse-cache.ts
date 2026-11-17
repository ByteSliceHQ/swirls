import { createParseCache } from '@swirls/language'

/**
 * One parse cache for the whole server. Every handler (diagnostics, hover,
 * completion, definition, references) and the workspace index parse through
 * it, so a document is parsed once per distinct text, not once per request,
 * and an index rebuild re-parses only the files that changed.
 */
export const parseCache = createParseCache()

/** Cached drop-in for `parse` from `@swirls/language`. The result is read-only. */
export const parse = parseCache.parse
