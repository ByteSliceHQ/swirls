import { describe, expect, test } from 'bun:test'
import { SWIRLS_FILE_HANDLE_TS } from './emitted-ts-literals'
import { jsonSchemaToTsType } from './schema-to-ts'

describe('jsonSchemaToTsType', () => {
  test('preserves literal tags, enum choices, and enum array grouping', () => {
    expect(jsonSchemaToTsType({ type: 'string', const: 'choice' })).toBe(
      '"choice"',
    )
    expect(
      jsonSchemaToTsType({
        type: 'array',
        items: { type: 'string', enum: ['billing', 'other'] },
      }),
    ).toBe('("billing" | "other")[]')
  })

  test('primitive string', () => {
    expect(jsonSchemaToTsType({ type: 'string' })).toBe('string')
  })

  test('primitive number and integer', () => {
    expect(jsonSchemaToTsType({ type: 'number' })).toBe('number')
    expect(jsonSchemaToTsType({ type: 'integer' })).toBe('number')
  })

  test('primitive boolean and null', () => {
    expect(jsonSchemaToTsType({ type: 'boolean' })).toBe('boolean')
    expect(jsonSchemaToTsType({ type: 'null' })).toBe('null')
  })

  test('object with properties and required', () => {
    const out = jsonSchemaToTsType({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['name'],
    })
    expect(out).toContain('name: string')
    expect(out).toContain('count?: number')
  })

  test('array of string', () => {
    expect(
      jsonSchemaToTsType({ type: 'array', items: { type: 'string' } }),
    ).toBe('string[]')
  })

  test('nested object', () => {
    const out = jsonSchemaToTsType({
      type: 'object',
      properties: {
        inner: {
          type: 'object',
          properties: { x: { type: 'number' } },
        },
      },
    })
    expect(out).toContain('inner')
    expect(out).toContain('x')
    expect(out).toContain('number')
  })

  test('union type', () => {
    const out = jsonSchemaToTsType({ type: ['string', 'null'] })
    expect(out).toBe('string | null')
  })

  test('no type but has properties infers object', () => {
    const out = jsonSchemaToTsType({
      properties: { foo: { type: 'string' } },
    })
    expect(out).toContain('foo')
    expect(out).toContain('string')
  })

  test('empty or non-object schema returns unknown', () => {
    expect(jsonSchemaToTsType(null as unknown as Record<string, unknown>)).toBe(
      'unknown',
    )
    expect(
      jsonSchemaToTsType(undefined as unknown as Record<string, unknown>),
    ).toBe('unknown')
    expect(jsonSchemaToTsType({})).toBe('unknown')
  })

  test('object type with no properties uses embedded open object (not Record)', () => {
    expect(jsonSchemaToTsType({ type: 'object' })).toBe(
      '{ [key: string]: unknown }',
    )
  })

  test('resolves $ref from $defs', () => {
    const out = jsonSchemaToTsType({
      type: 'object',
      properties: {
        filter: { $ref: '#/$defs/IssueFilter' },
      },
      $defs: {
        IssueFilter: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
      },
    })
    expect(out).toContain('filter?: { id?: string }')
  })

  test('falls back to open object for recursive $ref cycles', () => {
    const out = jsonSchemaToTsType({
      type: 'object',
      properties: {
        filter: { $ref: '#/$defs/IssueFilter' },
      },
      $defs: {
        IssueFilter: {
          type: 'object',
          properties: {
            and: {
              type: 'array',
              items: { $ref: '#/$defs/IssueFilter' },
            },
          },
        },
      },
    })
    expect(out).toContain('filter?: { and?: { [key: string]: unknown }[] }')
  })

  test('resolves swirls:file ref to file handle shape', () => {
    expect(jsonSchemaToTsType({ $ref: 'swirls:file' })).toBe(
      SWIRLS_FILE_HANDLE_TS,
    )
  })

  test('object property with swirls:file ref types file field', () => {
    const out = jsonSchemaToTsType({
      type: 'object',
      required: ['companyId', 'file'],
      properties: {
        companyId: { type: 'integer' },
        file: { $ref: 'swirls:file' },
      },
    })
    expect(out).toContain('companyId: number')
    expect(out).toContain(`file: ${SWIRLS_FILE_HANDLE_TS}`)
  })
})
