import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'

describe('skill block parser', () => {
  test('parses skill block with name field', () => {
    const src = `
skill swirls_lang {
  name: "swirls-lang"
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.skill).toHaveLength(1)
    expect(ast.skill[0]).toMatchObject({
      name: 'swirls_lang',
      skillName: 'swirls-lang',
    })
  })

  test('rejects unknown skill property', () => {
    const src = `
skill bad {
  source: "foo"
}
`
    const { ast, errors } = parse(src)
    expect(ast.skill).toHaveLength(0)
    expect(
      errors.some((e) => e.message.includes('Unknown skill property')),
    ).toBe(true)
  })

  test('requires name field', () => {
    const src = `
skill empty {
  label: "nope"
}
`
    const { ast, errors } = parse(src)
    expect(ast.skill).toHaveLength(0)
    expect(
      errors.some((e) => e.message.includes('Skill block requires name')),
    ).toBe(true)
  })
})
