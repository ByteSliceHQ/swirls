import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { parse } from '../parser'

const FIXTURES_DIR = path.join(import.meta.dir, '../__fixtures__')

function loadSource(file: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8')
}

describe('postgres block parsing', () => {
  test('valid-postgres.swirls parses without errors', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.postgres.length).toBe(1)
  })

  test('postgres block has correct name (no type: field)', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast } = parse(source)
    const p = ast.postgres[0]!
    expect(p.name).toBe('my_db')
  })

  test('postgres block has secrets reference', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast } = parse(source)
    const p = ast.postgres[0]!
    expect(p.secretsRef).toBe('db_credentials')
  })

  test('postgres block has connection as bare identifier', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast } = parse(source)
    const p = ast.postgres[0]!
    expect(p.connection).toBe('PG_CONNECTION_STRING')
    expect(p.connectionIsLiteral).toBe(false)
  })

  test('postgres block has two table declarations', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast } = parse(source)
    const p = ast.postgres[0]!
    expect(p.tables.length).toBe(2)
    expect(p.tables[0]?.name).toBe('leads')
    expect(p.tables[1]?.name).toBe('audit_log')
  })

  test('literal connection string', () => {
    const source = `
postgres local_db {
  connection: "postgres://localhost:5432/mydb"

  table items {
    schema: @json {
      { "type": "object", "properties": { "id": { "type": "integer" } } }
    }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const p = ast.postgres[0]!
    expect(p.connection).toBe('postgres://localhost:5432/mydb')
    expect(p.connectionIsLiteral).toBe(true)
    expect(p.secretsRef).toBeUndefined()
  })
})

describe('type: postgres nodes', () => {
  test('select node with params', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const graph = ast.workflows[0]!
    const node = graph.nodes.find((n) => n.name === 'check_existing')!
    expect(node.type).toBe('postgres')
    expect(node.configFields.postgres?.kind).toBe('string')
    expect((node.configFields.postgres as { value: string }).value).toBe('my_db')
    expect(node.configFields.select?.kind).toBe('sql_block')
    expect(node.configFields.params?.kind).toBe('ts_block')
  })

  test('insert node with condition and params', () => {
    const source = loadSource('valid-postgres.swirls')
    const { ast } = parse(source)
    const graph = ast.workflows[0]!
    const node = graph.nodes.find((n) => n.name === 'upsert_lead')!
    expect(node.type).toBe('postgres')
    expect(node.configFields.insert?.kind).toBe('sql_block')
    expect(node.configFields.condition?.kind).toBe('ts_block')
    expect(node.configFields.params?.kind).toBe('ts_block')
  })

  test('static select without params', () => {
    const source = `
postgres db {
  connection: PG
  table t { schema: @json { { "type": "object", "properties": {} } } }
}
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node q {
    type: postgres
    postgres: db
    select: @sql { SELECT 1 FROM t }
  }
  flow { root -> q }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const node = ast.workflows[0]!.nodes.find((n) => n.name === 'q')!
    expect(node.configFields.params).toBeUndefined()
  })
})
