import { describe, expect, test } from 'bun:test'

import { parse } from './parser'

const messages = (source: string): string[] => parse(source).errors.map((e) => e.message)

describe('blocks reject keys they do not define', () => {
  test('unknown form property', () => {
    expect(messages('form f {\n  label: "F"\n  lable: "typo"\n}\n')).toEqual([
      'Unknown form property "lable"; expected label, description, enabled, schema, visibility, auth',
    ])
  })

  test('wrongly typed scalar is reported and not stored', () => {
    const { ast, errors } = parse('form f {\n  label: 5\n}\n')
    expect(errors.map((e) => e.message)).toEqual(['"label" must be a string'])
    expect(ast.forms[0]?.label).toBe('')
  })

  test('unknown schedule, secret, role and workflow properties', () => {
    expect(messages('schedule s {\n  cron: "0 0 * * *"\n  tz: "UTC"\n}\n')).toEqual([
      'Unknown schedule property "tz"; expected label, description, cron, timezone, enabled',
    ])

    expect(messages('secret s {\n  vars: [A]\n  kind: 1\n}\n')).toEqual([
      'Unknown secret property "kind"; expected label, description, type, vars',
    ])

    expect(messages('role r {\n  descripton: "x"\n}\n')).toEqual([
      'Unknown role property "descripton"; expected description, match',
    ])

    expect(messages('workflow w {\n  lable: "W"\n}\n')).toEqual([
      'Unknown workflow property "lable"',
    ])
  })
})

describe('a key given twice in one block is an error', () => {
  test('form', () => {
    expect(messages('form f {\n  label: "A"\n  label: "B"\n}\n')).toEqual([
      'Duplicate form property "label"',
    ])
  })

  test('workflow and node', () => {
    expect(
      messages(
        'workflow w {\n  label: "A"\n  label: "B"\n  root {\n    type: code\n    code: @ts { return {} }\n    code: @ts { return 1 }\n  }\n}\n',
      ),
    ).toEqual(['Duplicate workflow property "label"', 'Duplicate node property "code"'])
  })

  test('any other block, once per duplicate', () => {
    expect(messages('secret s {\n  label: "A"\n  label: "B"\n  vars: [A]\n}\n')).toEqual([
      'Duplicate property "label"',
    ])
  })

  test('nav pages may repeat', () => {
    const errors = messages(
      'app a {\n  nav {\n    section "S" {\n      page: one\n      page: two\n    }\n  }\n}\n',
    )

    expect(errors.filter((m) => m.startsWith('Duplicate'))).toEqual([])
  })
})
