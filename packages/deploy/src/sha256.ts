import { createHash } from 'node:crypto'

/**
 * SHA-256 hex digest of `data`. Strings are hashed as UTF-8 (Node's default), so
 * this matches every hashing site in this package that previously inlined
 * `createHash('sha256')`. The single content-addressing primitive for deploy.
 */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}
