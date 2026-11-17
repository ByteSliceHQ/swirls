import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { inlineTsFileRefs } from './inline-ts-file-refs'
import { parse } from './parser'

describe('inlineTsFileRefs', () => {
  test('replaces ts_file_ref with file contents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swirls-inline-'))

    try {
      await writeFile(join(dir, 'logic.ts.swirls'), 'return { n: 1 }\n', 'utf-8')
      const swirlsPath = join(dir, 'app.swirls')

      const source = `
workflow g {
  node n {
    type: code
    label: "N"
    code: @ts "./logic.ts.swirls"
  }
}
`

      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      inlineTsFileRefs(ast, { swirlsFilePath: swirlsPath })
      const cv = ast.workflows[0]?.nodes[0]?.configFields.code
      expect(cv?.kind).toBe('ts_block')

      if (cv?.kind === 'ts_block') {
        expect(cv.code.trim()).toBe('return { n: 1 }')
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('replaces ts_file_ref inside map subgraph nodes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swirls-inline-'))

    try {
      await writeFile(join(dir, 'logic.ts.swirls'), 'return { rubric: "test" }\n', 'utf-8')
      const swirlsPath = join(dir, 'app.swirls')

      const source = `
workflow g {
  node each {
    type: map
    label: "Each"
    items: @ts { return [] }
    subgraph {
      root {
        type: code
        label: "Rubric"
        code: @ts "./logic.ts.swirls"
      }
    }
  }
}
`

      const { ast, errors } = parse(source)
      expect(errors.length).toBe(0)
      inlineTsFileRefs(ast, { swirlsFilePath: swirlsPath })
      const cv = ast.workflows[0]?.nodes[0]?.subgraph?.nodes[0]?.configFields.code
      expect(cv?.kind).toBe('ts_block')

      if (cv?.kind === 'ts_block') {
        expect(cv.code.trim()).toBe('return { rubric: "test" }')
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
