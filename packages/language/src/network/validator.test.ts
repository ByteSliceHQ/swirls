import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { validate } from '../validator'

function networkDiagnostics(source: string): string[] {
  const parsed = parse(source)
  expect(parsed.errors).toEqual([])
  return validate(parsed.ast)
    .map((diagnostic) => diagnostic.message)
    .filter((message) => message.includes('Network'))
}

describe('network validator', () => {
  test('resolves exposed resources and named database connections', () => {
    const diagnostics = networkDiagnostics(`
form intake { label: "Intake" }
webhook events { label: "Events" }
database crm {
  schema: @prisma { model Lead { id Int @id } }
  connection application { }
}
network corporate {
  expose: {
    forms: [intake]
    webhooks: [events]
    databases: [{ database: crm, connections: [application] }]
  }
}
`)

    expect(diagnostics).toEqual([])
  })

  test('fails closed for undefined and duplicate exposure refs', () => {
    const diagnostics = networkDiagnostics(`
form intake { label: "Intake" }
network corporate {
  expose: {
    forms: [intake, intake, missing]
  }
}
`)

    expect(diagnostics).toContain('Network "corporate" exposes duplicate form "intake"')
    expect(diagnostics).toContain('Network "corporate" references undefined form "missing"')
  })

  test('requires an explicitly declared database connection', () => {
    const diagnostics = networkDiagnostics(`
database crm {
  schema: @prisma { model Lead { id Int @id } }
  connection application { }
}
network corporate {
  expose: {
    databases: [{ database: crm, connections: [analytics] }]
  }
}
`)

    expect(diagnostics).toContain(
      'Network "corporate" references undefined database connection "crm.analytics"',
    )
  })

  test('validates outbound network references and static HTTP destinations', () => {
    const diagnostics = networkDiagnostics(`
network corporate { }
workflow call_internal {
  label: "Call internal"
  root {
    type: http
    network: corporate
    url: "https://inventory.example.ts.net/v1/stock"
  }
}
`)

    expect(diagnostics).toEqual([])
  })
})
