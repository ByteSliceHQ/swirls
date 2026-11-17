import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from './parser'

const FIXTURES_DIR = join(import.meta.dir, '__fixtures__')

/** Byte offsets count the extra \r, so they are the one thing allowed to differ. */
function comparable(ast: unknown): string {
  return JSON.stringify(ast, (key, value) => (key === 'offset' ? undefined : value)).replaceAll(
    '\\r\\n',
    '\\n',
  )
}

describe('CRLF sources', () => {
  const fixtures = readdirSync(FIXTURES_DIR).filter(
    (name) => name.startsWith('valid-') || name.startsWith('edge-'),
  )

  test.each(fixtures)('%s parses the same as LF', (name) => {
    const lf = readFileSync(join(FIXTURES_DIR, name), 'utf8')
    const lfResult = parse(lf)
    const crlfResult = parse(lf.replaceAll('\n', '\r\n'))

    expect(crlfResult.errors).toHaveLength(lfResult.errors.length)
    expect(comparable(crlfResult.ast)).toBe(comparable(lfResult.ast))
  })
})
