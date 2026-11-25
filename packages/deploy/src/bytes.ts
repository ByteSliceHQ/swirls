/** Byte helpers on `Uint8Array`, so the package needs no Node `Buffer`. */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function utf8Bytes(text: string): Uint8Array {
  return encoder.encode(text)
}

export function utf8Text(bytes: Uint8Array): string {
  return decoder.decode(bytes)
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard base64 with padding. Written out because `btoa` takes a string, not bytes. */
export function base64(bytes: Uint8Array): string {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const left = bytes.length - i

    out += BASE64.charAt(a >> 2)
    out += BASE64.charAt(((a & 0x03) << 4) | (b >> 4))
    out += left > 1 ? BASE64.charAt(((b & 0x0f) << 2) | (c >> 6)) : '='
    out += left > 2 ? BASE64.charAt(c & 0x3f) : '='
  }

  return out
}
