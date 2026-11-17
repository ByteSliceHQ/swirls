import { describe, expect, test } from 'bun:test'

import {
  FILE_HANDLE_KIND,
  fileHandleSchema,
  isFileHandle,
  isTextPresentableMediaType,
  parseFileRetentionLiteral,
  schemaNodeMarksFileValue,
  swirlsFileJsonSchema,
  SWIRLS_FILE_REF,
} from './file-values'

describe('fileHandleSchema', () => {
  test('accepts a valid handle', () => {
    const handle = {
      kind: FILE_HANDLE_KIND,
      id: 'f_abc123',
      mediaType: 'application/pdf',
      name: 'invoice.pdf',
      size: 12345,
      sha256: 'abc',
    }

    expect(fileHandleSchema.parse(handle)).toEqual(handle)
    expect(isFileHandle(handle)).toBe(true)
  })

  test('rejects handles with forbidden shape fields at parse time', () => {
    expect(
      isFileHandle({
        kind: FILE_HANDLE_KIND,
        id: 'x',
        mediaType: 'text/plain',
        name: 'a.txt',
        size: 1,
        bucket: 'secret',
      }),
    ).toBe(false)
  })
})

describe('schemaNodeMarksFileValue', () => {
  test('matches swirls:file ref', () => {
    expect(schemaNodeMarksFileValue({ $ref: SWIRLS_FILE_REF })).toBe(true)
  })

  test('matches contentMediaType', () => {
    expect(schemaNodeMarksFileValue({ type: 'string', contentMediaType: 'application/pdf' })).toBe(
      true,
    )
  })

  test('does not match plain strings', () => {
    expect(schemaNodeMarksFileValue({ type: 'string' })).toBe(false)
  })
})

describe('isTextPresentableMediaType', () => {
  test('recognizes text-presentable types', () => {
    expect(isTextPresentableMediaType('text/plain')).toBe(true)
    expect(isTextPresentableMediaType('text/markdown')).toBe(true)
  })

  test('rejects binary types', () => {
    expect(isTextPresentableMediaType('application/pdf')).toBe(false)
  })
})

describe('parseFileRetentionLiteral', () => {
  test('parses forever', () => {
    expect(parseFileRetentionLiteral('forever')).toEqual({ mode: 'forever' })
  })

  test('parses day counts', () => {
    expect(parseFileRetentionLiteral('30d')).toEqual({ mode: 'days', days: 30 })
  })

  test('rejects invalid literals', () => {
    expect(parseFileRetentionLiteral('30m')).toBeNull()
    expect(parseFileRetentionLiteral('')).toBeNull()
  })
})

describe('swirlsFileJsonSchema', () => {
  test('defines required handle properties', () => {
    const schema = swirlsFileJsonSchema()
    expect(schema.$id).toBe(SWIRLS_FILE_REF)
    expect(schema.required).toEqual(['kind', 'id', 'mediaType', 'name', 'size'])
    expect(schema.additionalProperties).toBe(false)
  })
})
