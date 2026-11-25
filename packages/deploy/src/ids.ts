/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix time in milliseconds, then random bits.
 * Ids made later sort later, which keeps stored definitions in creation order.
 * Uses Web Crypto, so it runs on Node, Bun, Deno and Workers alike.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  const time = BigInt(Math.max(0, Math.floor(now)))

  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((time >> BigInt(8 * (5 - i))) & 0xffn)
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
