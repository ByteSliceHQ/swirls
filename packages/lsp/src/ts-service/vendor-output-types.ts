/**
 * TypeScript output shapes for vendor API nodes when users must not declare `schema:` /
 * `outputSchema:` — responses are defined by upstream APIs. Used for downstream
 * `context.nodes.*.output` inference in the LSP.
 *
 * Keep each constant as a single-line type literal string so it is easy to diff when
 * APIs change.
 */

import { SWIRLS_FILE_HANDLE_TS } from './emitted-ts-literals'

// --- Parallel.ai (parallel-web) ---

/** `client.beta.search` → `SearchResult` */
export const PARALLEL_SEARCH_OUTPUT_TS =
  '{ search_id: string; results: Array<{ url: string; title?: string | null; excerpts?: string[] | null; publish_date?: string | null }>; usage?: unknown; warnings?: unknown }'

/** `client.beta.extract` → `ExtractResponse` */
export const PARALLEL_EXTRACT_OUTPUT_TS =
  '{ extract_id: string; errors: Array<{ url: string; error_type: string; content: string | null; http_status_code: number | null }>; results: Array<{ url: string; title?: string | null; excerpts?: string[] | null; full_content?: string | null; publish_date?: string | null }>; usage?: unknown; warnings?: unknown }'

/** `client.beta.findall.result` → `FindAllRunResult` */
export const PARALLEL_FINDALL_OUTPUT_TS =
  '{ candidates: Array<{ candidate_id: string; name: string; url: string; match_status: "generated" | "matched" | "unmatched" | "discarded"; description?: string | null; output?: Record<string, unknown> | null }>; run: { findall_id: string; generator: string; status: { is_active: boolean; status: string; metrics?: { generated_candidates_count?: number; matched_candidates_count?: number } } }; last_event_id?: string | null }'

// --- Firecrawl (`POST /v2/scrape` → `data` on success) ---

/**
 * Shape of `payload.data` after a successful scrape. Field presence depends on
 * `formats` and API version; extras allowed via index signature.
 *
 * @see https://docs.firecrawl.dev/api-reference/endpoint/scrape
 */
export const FIRECRAWL_OUTPUT_TS =
  '{ markdown?: string; html?: string; rawHtml?: string; json?: unknown; metadata?: { title?: string; description?: string; sourceURL?: string; statusCode?: number; [key: string]: unknown }; links?: string[]; [key: string]: unknown }'

// --- Web search (Firecrawl or Telem → normalized Swirls shape) ---

/**
 * Stable Swirls output across search providers. Telem returns web rows with
 * engine attribution in metadata; Firecrawl supports source groups and content.
 */
export const SEARCH_OUTPUT_TS =
  '{ query: string; results: Array<{ url: string; title?: string; description?: string; position?: number; source: "web" | "news" | "images"; category?: string; markdown?: string; links?: string[]; metadata?: Record<string, unknown> }> }'

// --- Resend (email send) ---

/** Engine always returns `{ sent: true }` on success. */
export const RESEND_OUTPUT_TS = '{ sent: true }'

// --- Archil disk exec (`disk.exec` → node output) ---

/** Fixed exec envelope returned by disk nodes after `disk.exec`. */
export const DISK_EXEC_OUTPUT_TS =
  '{ stdout: string; stderr: string; exitCode: number; timing: { totalMs: number; queueMs: number; executeMs: number } }'

/** Output envelope returned by disk nodes after `disk.copy_file`. */
export const DISK_COPY_FILE_OUTPUT_TS = `{ path: string; file: ${SWIRLS_FILE_HANDLE_TS}; size: number }`
