import { describe, expect, test } from 'bun:test'

import { parse, type SwirlsFile } from '@swirls/language'

import { computeDefinitionHash } from './definition-hash'

describe('computeDefinitionHash', () => {
  test('empty file shape is stable across calls', () => {
    const empty: SwirlsFile = {
      schemas: [],
      forms: [],
      webhooks: [],
      schedules: [],
      workflows: [],
      streams: [],
      views: [],
      triggers: [],
      secrets: [],
      auths: [],
      postgres: [],
      databases: [],
      migrations: [],
      disk: [],
      computer: [],
      operations: [],
      skill: [],
      agent: [],
      mcp: [],
      channels: [],
      queries: [],
      connections: [],
      connector: [],
      actions: [],
      roles: [],
      policies: [],
      apps: [],
      mocks: [],
      playbooks: [],
    }

    const h1 = computeDefinitionHash(empty)
    const h2 = computeDefinitionHash(empty)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[a-f0-9]{64}$/)
  })

  test('different top-level keys order still hashes same after canonicalization', () => {
    // SwirlsFile always has all keys; simulate two objects that serialize equivalently
    // after canonicalize by using same logical content via spread
    const a: SwirlsFile = {
      schemas: [],
      forms: [],
      webhooks: [],
      schedules: [],
      workflows: [],
      streams: [],
      views: [],
      triggers: [],
      secrets: [],
      auths: [],
      postgres: [],
      databases: [],
      migrations: [],
      disk: [],
      computer: [],
      operations: [],
      skill: [],
      agent: [],
      mcp: [],
      channels: [],
      queries: [],
      connections: [],
      connector: [],
      actions: [],
      roles: [],
      policies: [],
      apps: [],
      mocks: [],
      playbooks: [],
      version: 1,
    }

    const b: SwirlsFile = {
      version: 1,
      schemas: [],
      forms: [],
      webhooks: [],
      schedules: [],
      workflows: [],
      streams: [],
      views: [],
      triggers: [],
      secrets: [],
      auths: [],
      postgres: [],
      databases: [],
      migrations: [],
      disk: [],
      computer: [],
      operations: [],
      skill: [],
      agent: [],
      mcp: [],
      channels: [],
      queries: [],
      connections: [],
      connector: [],
      actions: [],
      roles: [],
      policies: [],
      apps: [],
      mocks: [],
      playbooks: [],
    }

    expect(computeDefinitionHash(a)).toBe(computeDefinitionHash(b))
  })

  test('covers database + migration blocks in the hash', () => {
    const source = `
database my_db {
  schema: @prisma {
    model User { id Int @id }
  }
}

migration m1 {
  database: my_db
  order: 1
  operation: @ts { return 1 }
}
`

    expect(computeDefinitionHash(parse(source).ast)).toBe(computeDefinitionHash(parse(source).ast))
  })

  test('database schema text change produces a different hash', () => {
    const base = parse(`
database my_db {
  schema: @prisma {
    model User { id Int @id }
  }
}
`).ast

    const changed = parse(`
database my_db {
  schema: @prisma {
    model User { id Int @id
      email String @unique }
  }
}
`).ast

    expect(computeDefinitionHash(base)).not.toBe(computeDefinitionHash(changed))
  })
})
