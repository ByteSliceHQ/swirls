/**
 * Canonicalize HTTP header names for storage and lookup.
 * The DSL, DB, and Triggers runtime all compare header names case-insensitively;
 * storing the lowercased form removes ambiguity from the write and read paths.
 */
export function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase()
}
