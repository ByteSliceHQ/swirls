import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { serialize } from '../serializer'

describe('network parser', () => {
  test('parses a centralized exposure allowlist', () => {
    const result = parse(`
network corporate {
  label: "Corporate"
  description: "Private customer interfaces"

  expose: {
    apps: [operations]
    channels: [support_mcp]
    forms: [employee_intake]
    webhooks: [internal_events]
    services: [sales_ops]
    databases: [
      {
        database: crm
        connections: [application, analytics]
      }
    ]
  }
}
`)

    expect(result.errors).toEqual([])
    const network = result.ast.networks?.[0]
    expect(network?.name).toBe('corporate')
    expect(network?.label).toBe('Corporate')
    expect(network?.expose?.apps.map((ref) => ref.name)).toEqual(['operations'])
    expect(network?.expose?.services.map((ref) => ref.name)).toEqual(['sales_ops'])
    expect(network?.expose?.databases[0]?.database).toBe('crm')

    expect(network?.expose?.databases[0]?.connections.map((ref) => ref.name)).toEqual([
      'application',
      'analytics',
    ])
  })

  test('allows a declaration with no exposed interfaces', () => {
    const result = parse('network corporate { expose: { } }')
    expect(result.errors).toEqual([])

    expect(result.ast.networks?.[0]?.expose).toMatchObject({
      apps: [],
      channels: [],
      forms: [],
      webhooks: [],
      services: [],
      databases: [],
    })
  })

  test('round-trips network declarations', () => {
    const first = parse(`
network corporate {
  expose: {
    forms: [intake]
    databases: [{ database: crm, connections: [application] }]
  }
}
`)

    expect(first.errors).toEqual([])
    const second = parse(serialize(first.ast))
    expect(second.errors).toEqual([])
    expect(second.ast.networks?.[0]?.expose?.forms[0]?.name).toBe('intake')
    expect(second.ast.networks?.[0]?.expose?.databases[0]?.connections[0]?.name).toBe('application')
  })

  test('requires expose to use property syntax', () => {
    const result = parse('network corporate { expose { apps: [] } }')

    expect(result.errors.map((error) => error.message)).toContain('Expected : after expose')
  })
})
