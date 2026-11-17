import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { parse } from './parser'
import { serialize } from './serializer'
import { validate } from './validator'

const source = readFileSync(new URL('../examples/decisions.swirls', import.meta.url), 'utf8')

const errors = (text: string) => {
  const result = parse(text)
  return [...result.errors, ...validate(result.ast).filter((d) => d.severity === 'error')].map(
    (d) => d.message,
  )
}

describe('decision declarations', () => {
  test('literal state preserves nested JSON null through serialization', () => {
    const text = source.replace(
      'state: @ts { return context.nodes.root.output }',
      'state: { message: "help", extra: null }',
    )

    const parsed = parse(text)
    expect(parsed.errors).toEqual([])
    const roundTrip = parse(serialize(parsed.ast))
    expect(roundTrip.errors).toEqual([])

    const state = roundTrip.ast.workflows[0]!.nodes.find((n) => n.name === 'assess')!.configFields
      .state

    expect(state?.kind === 'object' && state.value.extra).toMatchObject({
      kind: 'null',
      value: null,
    })
  })

  test('complete triage and model routing fixture parses, validates and round trips', () => {
    expect(errors(source)).toEqual([])
    const parsed = parse(source)
    const roundTrip = parse(serialize(parsed.ast))
    expect(roundTrip.errors).toEqual([])
    expect(roundTrip.ast.decisions?.[0]?.fields).toEqual(parsed.ast.decisions?.[0]?.fields)
  })

  test('managed TypeSafe still requires the named secret block and declared variable', () => {
    const managed = source.replace(
      'secret decision_vendor {',
      'secret decision_vendor { type: managed',
    )

    expect(errors(managed)).toEqual([])
    expect(errors(serialize(parse(managed).ast))).toEqual([])

    expect(
      errors(managed.replace('secrets: decision_vendor', 'secrets: missing')).join('\n'),
    ).toContain('existing secret block')

    expect(
      errors(managed.replace('vars: [TYPESAFE_API_KEY]', 'vars: [OPENAI_API_KEY]')).join('\n'),
    ).toContain('declare TYPESAFE_API_KEY')
  })

  test.each([
    [
      'state: @ts { return context.nodes.root.output }',
      'state: { message: @ts { return "help" } }',
      'whole-value @ts',
    ],
    ['secrets: decision_vendor', 'secrets: missing', 'existing secret block'],
    ['vars: [TYPESAFE_API_KEY]', 'vars: [OTHER_KEY]', 'declare TYPESAFE_API_KEY'],
    ['secrets: decision_vendor', 'apiKey: "bad"', 'Unrecognized key'],
    ['secrets: decision_vendor', 'secrets: "decision_vendor"', 'bare secret block'],
    ['provider: typesafe', 'provider: openai', 'typesafe'],
    ['model: "jev-1.13.0"', 'model: ""', 'Too small'],
    [
      'criteria: ["No impairment", "Partial impairment", "Work is blocked"]',
      'criteria: ["only"]',
      'Too small',
    ],
    ['decision: support_triage', 'decision: absent', 'declared decision'],
    [
      'decision: support_triage',
      'decision: support_triage\n    review: true',
      'separate downstream review',
    ],
    ['decision: support_triage', 'decision: support_triage\n    apiKey: "bad"', 'does not accept'],
  ])('rejects %s → %s', (a, b, message) =>
    expect(errors(source.replace(a, b)).join('\n')).toContain(message),
  )
})

test('release canary declares both credential modes and validates without side effects', () => {
  const parsed = parse(
    readFileSync(new URL('../examples/decisions-release.swirls', import.meta.url), 'utf8'),
  )

  expect(parsed.errors).toEqual([])
  expect(validate(parsed.ast).filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  expect(parsed.ast.workflows).toHaveLength(2)
  expect(parsed.ast.decisions).toHaveLength(2)
})
