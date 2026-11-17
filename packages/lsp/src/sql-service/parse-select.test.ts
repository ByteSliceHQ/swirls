import { describe, expect, test } from 'bun:test'

import { getSelectResultColumns } from './parse-select'

describe('getSelectResultColumns', () => {
  test('simple SELECT returns column names', () => {
    const result = getSelectResultColumns('SELECT a, b FROM {{table}}')
    expect(result.kind).toBe('columns')

    if (result.kind === 'columns') {
      expect(result.columns).toEqual(['a', 'b'])
    }
  })

  test('SELECT * returns star', () => {
    const result = getSelectResultColumns('SELECT * FROM {{table}}')
    expect(result.kind).toBe('star')
  })

  test('aliased column returns alias name', () => {
    const result = getSelectResultColumns('SELECT foo AS bar FROM {{table}}')
    expect(result.kind).toBe('columns')

    if (result.kind === 'columns') {
      expect(result.columns).toEqual(['bar'])
    }
  })

  test('empty SQL returns error', () => {
    const result = getSelectResultColumns('')
    expect(result.kind).toBe('error')

    if (result.kind === 'error') {
      expect(result.message).toContain('Empty')
    }
  })

  test('whitespace-only returns error', () => {
    const result = getSelectResultColumns('   \n  ')
    expect(result.kind).toBe('error')
  })

  test('non-SELECT returns error', () => {
    const result = getSelectResultColumns('INSERT INTO {{table}} (x) VALUES (1)')
    expect(result.kind).toBe('error')

    if (result.kind === 'error') {
      expect(result.message).toContain('Only SELECT')
    }
  })

  test('invalid SQL returns error with message', () => {
    const result = getSelectResultColumns('SELECT FROM broken')
    expect(result.kind).toBe('error')

    if (result.kind === 'error') {
      expect(result.message.length).toBeGreaterThan(0)
    }
  })
})
