import { describe, expect, test } from 'bun:test'

import { parseDurationSeconds } from './duration'

describe('parseDurationSeconds', () => {
  test('converts each unit to whole seconds', () => {
    expect(parseDurationSeconds('15s')).toBe(15)
    expect(parseDurationSeconds('30m')).toBe(1800)
    expect(parseDurationSeconds('1h')).toBe(3600)
    expect(parseDurationSeconds('24h')).toBe(86400)
  })

  test('accepts zero and surrounding whitespace', () => {
    expect(parseDurationSeconds('0s')).toBe(0)
    expect(parseDurationSeconds('  45m  ')).toBe(2700)
  })

  test('refuses anything outside the grammar', () => {
    for (const literal of [
      '30',
      '30 m',
      '30 minutes',
      'thirty',
      '30d',
      '1.5h',
      '-5m',
      '+5m',
      '',
      '5ms',
      '5M',
    ]) {
      expect(parseDurationSeconds(literal)).toBeNull()
    }
  })
})
