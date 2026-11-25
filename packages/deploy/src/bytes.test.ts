import { describe, expect, test } from 'bun:test'

import { base64, utf8Bytes, utf8Text } from './bytes'

describe('base64', () => {
  test('pads to a multiple of four', () => {
    expect(base64(utf8Bytes(''))).toBe('')
    expect(base64(utf8Bytes('f'))).toBe('Zg==')
    expect(base64(utf8Bytes('fo'))).toBe('Zm8=')
    expect(base64(utf8Bytes('foo'))).toBe('Zm9v')
    expect(base64(utf8Bytes('foob'))).toBe('Zm9vYg==')
  })

  test('agrees with the runtime on every byte value and on a large input', () => {
    const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i)
    const large = Uint8Array.from({ length: 200_001 }, (_, i) => (i * 31) % 256)

    expect(base64(everyByte)).toBe(Buffer.from(everyByte).toString('base64'))
    expect(base64(large)).toBe(Buffer.from(large).toString('base64'))
  })
})

describe('utf8', () => {
  test('round-trips text outside ASCII', () => {
    expect(utf8Text(utf8Bytes('naïve ☕'))).toBe('naïve ☕')
    expect(utf8Bytes('☕').byteLength).toBe(3)
  })
})
