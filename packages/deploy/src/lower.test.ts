import { describe, expect, test } from 'bun:test'

import { parseDeploymentDefinition } from '@swirls/definition/deployment-definition'
import { swirlsHost } from '@swirls/language'

import { uuidv7 } from './ids'
import { lowerSwirlsSources } from './lower'

const INTAKE = `
form intake {
  label: "Intake"
  schema: @json {
    { "type": "object", "properties": { "email": { "type": "string" } }, "required": ["email"] }
  }
}

workflow triage {
  label: "Triage"

  root {
    type: code
    label: "Entry"
    code: @ts { return { email: context.nodes.root.input.email } }
  }
}

trigger on_intake {
  form:intake -> triage
}
`

const NORMALIZE = `
workflow normalize {
  label: "Normalize"

  root {
    type: code
    label: "Entry"
    code: @ts "./lower-case.ts.swirls"
  }
}
`

function counter(): () => string {
  let next = 0

  return () => `00000000-0000-7000-8000-${String(++next).padStart(12, '0')}`
}

describe('lowerSwirlsSources', () => {
  test('lowers one file into a definition that passes the definition schema', () => {
    const result = lowerSwirlsSources({ 'intake.swirls': INTAKE })

    expect(result.diagnostics).toEqual([])
    expect(result.ok).toBe(true)

    const parsed = parseDeploymentDefinition(result.definition)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.forms?.map((form) => form.name)).toEqual(['intake'])
    expect(parsed.data?.workflows?.map((workflow) => workflow.name)).toEqual(['triage'])
    expect(parsed.data?.triggers?.map((trigger) => trigger.name)).toEqual(['on_intake'])
  })

  test('accepts a Map and merges files, reading @ts file references from the same set', () => {
    const result = lowerSwirlsSources(
      new Map([
        ['intake.swirls', INTAKE],
        ['flows/normalize.swirls', NORMALIZE],
        ['flows/lower-case.ts.swirls', 'return { email: "a@example.com" }'],
      ]),
    )

    expect(result.diagnostics).toEqual([])

    const parsed = parseDeploymentDefinition(result.definition)
    const workflows = parsed.data?.workflows ?? []

    expect(workflows.map((workflow) => workflow.name).sort()).toEqual(['normalize', 'triage'])
    expect(JSON.stringify(workflows)).toContain('a@example.com')

    expect(result.sourceFiles.map((file) => file.path)).toEqual([
      'flows/lower-case.ts.swirls',
      'flows/normalize.swirls',
      'intake.swirls',
    ])
  })

  test('the same sources and ids give the same definition and fingerprint', () => {
    const first = lowerSwirlsSources({ 'intake.swirls': INTAKE }, { newId: counter() })
    const second = lowerSwirlsSources({ 'intake.swirls': INTAKE }, { newId: counter() })

    expect(first.definition).toEqual(second.definition)
    expect(first.sourceFingerprint).toBe(second.sourceFingerprint)
    expect(JSON.stringify(first.definition)).toContain('00000000-0000-7000-8000-000000000001')
  })

  test('reports every parse error with its file and position, and builds nothing', () => {
    const result = lowerSwirlsSources({
      'intake.swirls': INTAKE,
      'broken.swirls': 'form broken {\n  label: 3\n  nonsense: true\n}\n',
    })

    expect(result.ok).toBe(false)
    expect(result.definition).toBeNull()
    expect(result.ast).toBeNull()

    const messages = result.diagnostics.map((diagnostic) => diagnostic.message)

    expect(messages).toContain('"label" must be a string')

    expect(messages.some((message) => message.startsWith('Unknown form property "nonsense"'))).toBe(
      true,
    )

    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.stage).toBe('parse')
      expect(diagnostic.path).toBe('broken.swirls')
      expect(diagnostic.range?.start.line).toBeGreaterThan(0)
    }
  })

  test('reports validation errors from every file', () => {
    const missing = (name: string) => `
trigger ${name} {
  form:nowhere -> nothing
}
`

    const result = lowerSwirlsSources({
      'a.swirls': missing('first'),
      'b.swirls': missing('second'),
    })

    expect(result.ok).toBe(false)

    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

    expect(new Set(errors.map((error) => error.path))).toEqual(new Set(['a.swirls', 'b.swirls']))
    expect(errors.every((error) => error.stage === 'validate')).toBe(true)
  })

  test('a name declared in two files is a merge error naming both', () => {
    const result = lowerSwirlsSources({
      'a.swirls': INTAKE,
      'b.swirls': INTAKE,
    })

    expect(result.ok).toBe(false)

    const merge = result.diagnostics.filter((diagnostic) => diagnostic.stage === 'merge')

    expect(merge).toHaveLength(1)
    expect(merge[0]?.message).toContain('a.swirls')
    expect(merge[0]?.message).toContain('b.swirls')
  })

  test('a missing @ts file is reported against the file that references it', () => {
    const result = lowerSwirlsSources({ 'normalize.swirls': NORMALIZE })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.path).toBe('normalize.swirls')
    expect(result.diagnostics[0]?.message).toContain('lower-case.ts.swirls')
  })

  test('harness names are checked only against the catalog of the host given', () => {
    const source = `
computer builder {
  label: "Builder"
  harness: { type: coding, provider: quill }
}
`

    expect(lowerSwirlsSources({ 'computer.swirls': source }).ok).toBe(true)

    const hosted = lowerSwirlsSources({ 'computer.swirls': source }, { host: swirlsHost })

    expect(hosted.ok).toBe(false)
    expect(hosted.diagnostics[0]?.message).toContain('Unknown harness provider "quill"')
  })

  test('a project with no blocks is refused by the definition schema', () => {
    const result = lowerSwirlsSources({ 'README.md': 'No blocks here.' })

    expect(result.ok).toBe(false)
    expect(result.sourceFiles).toEqual([])

    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        stage: 'definition',
        message: 'workflows: Definition must include at least one Swirls primitive',
      },
    ])
  })
})

describe('uuidv7', () => {
  test('is a version 7 UUID that the definition schema accepts as an id', () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  test('starts with the time, so later ids sort later', () => {
    expect(uuidv7(0x0123456789ab).startsWith('01234567-89ab-7')).toBe(true)
    expect(uuidv7(1_000) < uuidv7(2_000)).toBe(true)
  })

  test('does not repeat', () => {
    expect(new Set(Array.from({ length: 1_000 }, () => uuidv7())).size).toBe(1_000)
  })
})
