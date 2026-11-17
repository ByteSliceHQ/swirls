import { describe, expect, test } from 'bun:test'

import { createLanguageService } from './host'

describe('createLanguageService (virtual lib)', () => {
  test('string methods and Date are typed when ES lib is available', () => {
    const fileName = '__test_block.ts'

    const source = `
function norm(s: string): string {
  const d = new Date()
  void d
  return s.trim().toLowerCase()
}
export {}
`

    const ls = createLanguageService(fileName, source)
    const diags = ls.getSemanticDiagnostics(fileName)
    const errors = diags.filter((d) => d.category === 1)
    expect(errors).toHaveLength(0)
  })

  test('URLSearchParams is typed when DOM lib is included', () => {
    const fileName = '__test_block_dom.ts'

    const source = `/// <reference lib="dom" />
const p = new URLSearchParams('a=1')
void p.get('a')
export {}
`

    const ls = createLanguageService(fileName, source)
    const diags = ls.getSemanticDiagnostics(fileName)
    const errors = diags.filter((d) => d.category === 1)
    expect(errors).toHaveLength(0)
  })
})
