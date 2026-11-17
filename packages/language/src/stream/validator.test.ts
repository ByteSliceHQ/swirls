import { describe, expect, test } from 'bun:test'

import type { Diagnostic } from '../ast'
import { parse } from '../parser'
import { validate } from '../validator'

function hasDiagnostic(diags: Diagnostic[], substring: string): boolean {
  return diags.some((d) => d.message.includes(substring))
}

const versionedStreamSnippet = `
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
}
`

describe('stream block', () => {
  test('duplicate stream names produce diagnostic', () => {
    const source = `
${versionedStreamSnippet}
stream a {
  workflow: g
  version: v1
  versions: {
    v1 { schema: @json { {} } prepare: @ts { return {} } }
  }
}
stream a {
  workflow: g
  version: v1
  versions: {
    v1 { schema: @json { {} } prepare: @ts { return {} } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'Duplicate stream name')).toBe(true)
  })

  test('stream references undefined graph', () => {
    const source = `
stream s {
  workflow: missing
  version: v1
  versions: {
    v1 { schema: @json { {} } prepare: @ts { return {} } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'not defined')).toBe(true)
  })

  test('stream requires prepare per version', () => {
    const source = `
${versionedStreamSnippet}
stream s {
  workflow: g
  version: v1
  versions: {
    v1 { schema: @json { {} } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'requires "prepare"')).toBe(true)
  })

  test('empty condition @ts produces diagnostic', () => {
    const source = `
${versionedStreamSnippet}
stream s {
  workflow: g
  version: v1
  versions: {
    v1 {
      schema: @json { {} }
      condition: @ts { }
      prepare: @ts { return {} }
    }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'condition requires')).toBe(true)
  })

  test('stream version requires schema', () => {
    const source = `
${versionedStreamSnippet}
stream s {
  workflow: g
  version: v1
  versions: {
    v1 { prepare: @ts { return {} } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    const schemaDiag = diags.find((d) => d.message.toLowerCase().includes('no schema'))
    expect(schemaDiag).toBeDefined()
    expect(schemaDiag?.severity).toBe('error')
  })

  test('top-level schema is rejected by validator wording from parser diagnostics', () => {
    const source = `
${versionedStreamSnippet}
stream bad {
  workflow: g
  version: v1
  schema: @json { {} }
  versions: {
    v1 { schema: @json { {} } prepare: @ts { return {} } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.some((e) => e.message.includes('top-level'))).toBe(true)
    /** Parser still produces a declaration; validator should catch missing coherence if any */
    expect(ast.streams.length).toBeGreaterThan(0)
  })

  test('version pointer must match a versions entry', () => {
    const source = `
${versionedStreamSnippet}
stream s {
  workflow: g
  version: v9
  versions: {
    v1 { schema: @json { {} } prepare: @ts { return {} } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors.length).toBe(0)
    const diags = validate(ast)
    expect(hasDiagnostic(diags, 'not declared under versions')).toBe(true)
  })
})
