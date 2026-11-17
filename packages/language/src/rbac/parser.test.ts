import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'

describe('role blocks', () => {
  test('parses a role with an equality match', () => {
    const { ast, errors } = parse(`
role finance {
  description: "Finance team"
  match {
    department: "finance"
  }
}
`)

    expect(errors).toEqual([])
    expect(ast.roles.length).toBe(1)
    const r = ast.roles[0]
    expect(r?.name).toBe('finance')
    expect(r?.description).toBe('Finance team')
    expect(r?.match.length).toBe(1)
    expect(r?.match[0]?.claim).toBe('department')
    expect(r?.match[0]?.op).toBe('eq')
    expect(r?.match[0]?.values).toEqual(['finance'])
  })

  test('parses a role with a membership (list) match', () => {
    const { ast, errors } = parse(`
role exec {
  match {
    org_role: [ "ceo", "cfo" ]
  }
}
`)

    expect(errors).toEqual([])
    const r = ast.roles[0]
    expect(r?.match[0]?.claim).toBe('org_role')
    expect(r?.match[0]?.op).toBe('in')
    expect(r?.match[0]?.values).toEqual(['ceo', 'cfo'])
  })

  test('parses multiple conditions and bare-word values', () => {
    const { ast, errors } = parse(`
role finance_admin {
  match {
    department: "finance"
    org_role: admin
  }
}
`)

    expect(errors).toEqual([])
    const r = ast.roles[0]
    expect(r?.match.length).toBe(2)
    expect(r?.match[1]?.claim).toBe('org_role')
    expect(r?.match[1]?.op).toBe('eq')
    expect(r?.match[1]?.values).toEqual(['admin'])
  })

  test('parses multiple role blocks alongside other top-level blocks', () => {
    const { ast, errors } = parse(`
role finance {
  match { department: "finance" }
}

role hr {
  match { department: "hr" }
}

secret s { vars: [ OPENAI_API_KEY ] }
`)

    expect(errors).toEqual([])
    expect(ast.roles.map((r) => r.name)).toEqual(['finance', 'hr'])
    expect(ast.secrets.length).toBe(1)
  })

  test('round-trips roles through the serializer', () => {
    const src = `
role finance {
  description: "Finance"
  match {
    department: "finance"
    org_role: [ "ceo", "cfo" ]
  }
}
`

    const first = parse(src)
    expect(first.errors).toEqual([])
    const { ast, errors } = parse(serialize(first.ast))
    expect(errors).toEqual([])
    expect(ast.roles[0]?.name).toBe('finance')
    expect(ast.roles[0]?.description).toBe('Finance')

    expect(ast.roles[0]?.match[0]).toMatchObject({
      claim: 'department',
      op: 'eq',
      values: ['finance'],
    })

    expect(ast.roles[0]?.match[1]).toMatchObject({
      claim: 'org_role',
      op: 'in',
      values: ['ceo', 'cfo'],
    })
  })

  test('flags duplicate role names', () => {
    const { ast } = parse(`
role dup { match { a: "1" } }
role dup { match { b: "2" } }
`)

    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('Duplicate role name'))).toBe(true)
  })

  test('warns on an empty match block', () => {
    const { ast } = parse(`role nobody { match { } }`)
    const diags = validate(ast)

    expect(diags.some((d) => d.severity === 'warning' && d.message.includes('empty match'))).toBe(
      true,
    )
  })
})

describe('policy blocks', () => {
  test('parses an allow grant with workflows and tools', () => {
    const { ast, errors } = parse(`
policy {
  allow finance -> agent accountant {
    workflows: [ brex, quickbooks ]
    tools: [ brex_read ]
  }
}
`)

    expect(errors).toEqual([])
    expect(ast.policies.length).toBe(1)
    const g = ast.policies[0]?.grants[0]
    expect(g?.effect).toBe('allow')
    expect(g?.role).toBe('finance')
    expect(g?.agent).toBe('accountant')
    expect(g?.workflows).toEqual(['brex', 'quickbooks'])
    expect(g?.tools).toEqual(['brex_read'])
  })

  test('parses an agent wildcard with no body', () => {
    const { ast, errors } = parse(`
policy {
  allow exec -> agent *
}
`)

    expect(errors).toEqual([])
    const g = ast.policies[0]?.grants[0]
    expect(g?.role).toBe('exec')
    expect(g?.agent).toBe('*')
    expect(g?.workflows).toBeUndefined()
  })

  test('parses deny and multiple grants', () => {
    const { ast, errors } = parse(`
policy {
  allow finance -> agent accountant { workflows: [ brex ] }
  deny finance -> agent payroll
  allow org_admin -> agent *
}
`)

    expect(errors).toEqual([])
    const grants = ast.policies[0]?.grants ?? []
    expect(grants.length).toBe(3)
    expect(grants.map((g) => g.effect)).toEqual(['allow', 'deny', 'allow'])
    expect(grants[1]?.agent).toBe('payroll')
    expect(grants[2]?.agent).toBe('*')
  })

  test('round-trips a policy through the serializer', () => {
    const src = `
policy {
  allow finance -> agent accountant {
    workflows: [ brex, quickbooks ]
  }
  allow exec -> agent *
}
`

    const first = parse(src)
    expect(first.errors).toEqual([])
    const { ast, errors } = parse(serialize(first.ast))
    expect(errors).toEqual([])
    const grants = ast.policies[0]?.grants ?? []

    expect(grants[0]).toMatchObject({
      effect: 'allow',
      role: 'finance',
      agent: 'accountant',
      workflows: ['brex', 'quickbooks'],
    })

    expect(grants[1]).toMatchObject({ role: 'exec', agent: '*' })
  })

  test('parses policy.files retention', () => {
    const { ast, errors } = parse(`
policy {
  files {
    retention: 30d
  }
  allow finance -> agent accountant
}
`)

    expect(errors).toEqual([])

    expect(ast.policies[0]?.files?.retention).toEqual({
      mode: 'days',
      days: 30,
    })
  })

  test('parses forever retention', () => {
    const { ast, errors } = parse(`
policy {
  files {
    retention: forever
  }
}
`)

    expect(errors).toEqual([])
    expect(ast.policies[0]?.files?.retention).toEqual({ mode: 'forever' })
  })

  test('round-trips policy.files through serializer', () => {
    const src = `
policy {
  files {
    retention: 30d
  }
  allow finance -> agent accountant
}
`

    const first = parse(src)
    expect(first.errors).toEqual([])
    const { ast, errors } = parse(serialize(first.ast))
    expect(errors).toEqual([])

    expect(ast.policies[0]?.files?.retention).toEqual({
      mode: 'days',
      days: 30,
    })
  })
})
