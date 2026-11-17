import { describe, expect, test } from 'bun:test'

import { parse, validate } from '../index'
import { extractSqlParams, isReadOnlySqlHeuristic } from './sql-params'

describe('query sql helpers', () => {
  test('extractSqlParams preserves order and dedupes', () => {
    expect(extractSqlParams('WHERE x = {{days}} AND y = {{stage}} AND z = {{days}}')).toEqual([
      'days',
      'stage',
    ])
  })

  test('isReadOnlySqlHeuristic rejects writes', () => {
    expect(isReadOnlySqlHeuristic('SELECT 1')).toBe(true)
    expect(isReadOnlySqlHeuristic('INSERT INTO t VALUES (1)')).toBe(false)
  })
})

describe('query block parsing', () => {
  test('parses database and sql fields', () => {
    const { ast, errors } = parse(`
database crm {
  label: "CRM"
  schema: @prisma { model Deal { id Int @id @@map("deals") } }
  connection app { label: "App" }
}

query open_pipeline {
  label: "Open pipeline"
  database: crm
  sql: @sql {
    SELECT COUNT(*)::int AS value FROM deals WHERE stage = {{stage}}
  }
}
`)

    expect(errors.length).toBe(0)
    const query = ast.queries[0]!
    expect(query.database).toBe('crm')
    expect(query.sql?.kind).toBe('sql_block')
    expect(validate(ast).filter((d) => d.severity === 'error')).toEqual([])
  })
})
