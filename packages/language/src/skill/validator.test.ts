import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { validateSkillBlocks } from './validator'

describe('validateSkillBlocks slug', () => {
  test('rejects path traversal in name:', () => {
    const src = `
skill bad {
  name: "../x"
}
`

    const { ast } = parse(src)
    const diags = validateSkillBlocks(ast)
    expect(diags.some((d) => d.message.includes('must be a single path segment'))).toBe(true)
  })

  test('rejects slash in name:', () => {
    const src = `
skill bad {
  name: "a/b"
}
`

    const { ast } = parse(src)
    const diags = validateSkillBlocks(ast)
    expect(diags.some((d) => d.message.includes('must be a single path segment'))).toBe(true)
  })
})
