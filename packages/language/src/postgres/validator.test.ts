import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type { Diagnostic } from '../ast'
import { parse } from '../parser'
import { validate } from '../validator'

const FIXTURES_DIR = path.join(import.meta.dir, '../__fixtures__')

function loadAndParse(file: string) {
  const source = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8')
  return parse(source)
}

function parseAndValidate(source: string): Diagnostic[] {
  const { ast, errors } = parse(source)
  expect(errors).toEqual([])
  return validate(ast)
}

function hasDiag(diags: Diagnostic[], substring: string): boolean {
  return diags.some((d) => d.message.includes(substring))
}

describe('postgres block validation', () => {
  test('valid-postgres.swirls produces zero diagnostics', () => {
    const { ast, errors } = loadAndParse('valid-postgres.swirls')
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(diags).toEqual([])
  })

  test('duplicate postgres name', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: X
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
postgres db {
  connection: Y
  table t2 { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
`)

    expect(hasDiag(diags, 'Duplicate postgres block name "db"')).toBe(true)
  })

  test('undefined secret block reference', () => {
    const diags = parseAndValidate(`
postgres db {
  secrets: nonexistent
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
`)

    expect(hasDiag(diags, 'references undefined secret block "nonexistent"')).toBe(true)
  })

  test('connection references nonexistent var in secret block', () => {
    const diags = parseAndValidate(`
secret creds {
  label: "Creds"
  vars: [OTHER_KEY]
}
postgres db {
  secrets: creds
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
`)

    expect(hasDiag(diags, 'must reference a var from secret block "creds"')).toBe(true)
  })

  test('literal connection string produces warning', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: "postgres://localhost/mydb"
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
`)

    const warning = diags.find((d) => d.message.includes('plaintext string'))
    expect(warning).toBeDefined()
    expect(warning?.severity).toBe('warning')
  })

  test('no tables produces error', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
}
`)

    expect(hasDiag(diags, 'must declare at least one table')).toBe(true)
  })

  test('duplicate table name in postgres block', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
  table t { schema: @json { { "type": "object", "properties": { "b": { "type": "string" } } } } }
}
`)

    expect(hasDiag(diags, 'Duplicate table name "t" in postgres block')).toBe(true)
  })

  test('table without schema produces error', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { {} } }
}
`)

    expect(hasDiag(diags, 'requires a schema')).toBe(true)
  })
})

describe('type: postgres node validation', () => {
  test('postgres node without postgres field', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    label: "Q"
    select: @sql { SELECT * FROM t }
  }
}
`)

    expect(hasDiag(diags, 'requires a "postgres" field')).toBe(true)
  })

  test('postgres node references undefined block', () => {
    const diags = parseAndValidate(`
workflow g {
  label: "G"
  root {
    type: postgres
    label: "Q"
    postgres: nonexistent
    select: @sql { SELECT * FROM t }
  }
}
`)

    expect(hasDiag(diags, 'references undefined postgres block "nonexistent"')).toBe(true)
  })

  test('both select and insert', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    select: @sql { SELECT 1 FROM t }
    insert: @sql { INSERT INTO t (a) VALUES ('x') }
    params: @ts { return { a: 1 } }
  }
}
`)

    expect(
      hasDiag(
        diags,
        'requires exactly one of "select", "insert", "update", or "delete"; found more than one',
      ),
    ).toBe(true)
  })

  test('neither select nor insert', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    label: "Q"
  }
}
`)

    expect(
      hasDiag(diags, 'requires exactly one of "select", "insert", "update", or "delete"'),
    ).toBe(true)
  })

  test('select with non-SELECT SQL', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    select: @sql { INSERT INTO t (a) VALUES ('x') }
  }
}
`)

    expect(hasDiag(diags, 'must be a SELECT statement')).toBe(true)
  })

  test('insert without params', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES ('x') }
  }
}
`)

    expect(hasDiag(diags, 'requires a "params"')).toBe(true)
  })

  test('condition on select node', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    select: @sql { SELECT 1 FROM t }
    condition: @ts { return true }
  }
}
`)

    expect(
      hasDiag(diags, 'condition is only valid on postgres write nodes (insert, update, delete)'),
    ).toBe(true)
  })

  test('undeclared table in select SQL', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table items { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    select: @sql { SELECT * FROM unknown_table }
  }
}
`)

    expect(hasDiag(diags, 'not declared in postgres block "db"')).toBe(true)
  })

  test('insert placeholder name may differ from column; maps by VALUES position', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES ({{typo}}) }
    params: @ts { return { typo: "" } }
  }
}
`)

    expect(
      hasDiag(diags, 'Placeholder "{{typo}}" is not declared on table "t" in postgres block "db"'),
    ).toBe(false)
  })

  test('insert params object may include keys not named like table columns', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES ({{a}}) }
    params: @ts { return { a: "", extra: 1 } }
  }
}
`)

    expect(
      hasDiag(diags, 'Params key "extra" is not declared on table "t" in postgres block "db"'),
    ).toBe(false)
  })

  test('insert explicit column must exist in table schema', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (wrong_col) VALUES ({{wrong_col}}) }
    params: @ts { return { wrong_col: "" } }
  }
}
`)

    expect(
      hasDiag(diags, 'Column "wrong_col" is not declared on table "t" in postgres block "db"'),
    ).toBe(true)
  })

  test('insert VALUES row must open with parenthesis after VALUES', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES {{x}} }
    params: @ts { return { x: "" } }
  }
}
`)

    expect(
      hasDiag(diags, 'Postgres INSERT VALUES clause must wrap row values in parentheses'),
    ).toBe(true)
  })

  test('insert VALUES with parentheses passes VALUES shape check', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES ({{x}}) }
    params: @ts { return { x: "" } }
  }
}
`)

    expect(
      hasDiag(diags, 'Postgres INSERT VALUES clause must wrap row values in parentheses'),
    ).toBe(false)
  })

  test('valid update node with params and condition produces no diagnostics', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" }, "b": { "type": "number" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    condition: @ts { return true }
    update: @sql { UPDATE t SET b = {{b}} WHERE a = {{a}} }
    params: @ts { return { a: "", b: 1 } }
  }
}
`)

    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    expect(diags.filter((d) => d.severity === 'warning')).toEqual([])
  })

  test('valid delete node produces no diagnostics', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    delete: @sql { DELETE FROM t WHERE a = {{a}} }
    params: @ts { return { a: "" } }
  }
}
`)

    expect(diags).toEqual([])
  })

  test('update with non-UPDATE SQL', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    update: @sql { DELETE FROM t WHERE a = 'x' }
  }
}
`)

    expect(hasDiag(diags, 'Postgres update must be an UPDATE statement')).toBe(true)
  })

  test('delete with non-DELETE SQL', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    delete: @sql { UPDATE t SET a = 'x' WHERE a = 'y' }
  }
}
`)

    expect(hasDiag(diags, 'Postgres delete must be a DELETE statement')).toBe(true)
  })

  test('update without WHERE warns about whole-table write', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    update: @sql { UPDATE t SET a = {{a}} }
    params: @ts { return { a: "" } }
  }
}
`)

    const warning = diags.find((d) => d.message.includes('Postgres UPDATE has no WHERE clause'))
    expect(warning?.severity).toBe('warning')
  })

  test('delete without WHERE warns about whole-table write', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    delete: @sql { DELETE FROM t }
  }
}
`)

    const warning = diags.find((d) => d.message.includes('Postgres DELETE has no WHERE clause'))
    expect(warning?.severity).toBe('warning')
  })

  test('update with placeholders requires params', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    update: @sql { UPDATE t SET a = {{a}} WHERE a = 'x' }
  }
}
`)

    expect(
      hasDiag(
        diags,
        'Postgres update node requires a "params" (@ts block) when the SQL uses {{key}} placeholders',
      ),
    ).toBe(true)
  })

  test('delete with placeholders requires params', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    delete: @sql { DELETE FROM t WHERE a = {{a}} }
  }
}
`)

    expect(
      hasDiag(
        diags,
        'Postgres delete node requires a "params" (@ts block) when the SQL uses {{key}} placeholders',
      ),
    ).toBe(true)
  })

  test('static delete without placeholders does not require params', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    delete: @sql { DELETE FROM t WHERE a = 'stale' }
  }
}
`)

    expect(diags).toEqual([])
  })

  test('update SET column must exist in table schema', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    update: @sql { UPDATE t SET wrong_col = {{v}} WHERE a = {{a}} }
    params: @ts { return { v: "", a: "" } }
  }
}
`)

    expect(
      hasDiag(diags, 'Column "wrong_col" is not declared on table "t" in postgres block "db"'),
    ).toBe(true)
  })

  test('update against undeclared table', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table items { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    update: @sql { UPDATE unknown_table SET a = 'x' WHERE a = 'y' }
  }
}
`)

    expect(hasDiag(diags, 'not declared in postgres block "db"')).toBe(true)
  })

  test('update placeholder without matching params key', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    update: @sql { UPDATE t SET a = {{missing}} WHERE a = {{a}} }
    params: @ts { return { a: "" } }
  }
}
`)

    expect(
      hasDiag(diags, 'SQL placeholder "{{missing}}" has no matching key in params return object'),
    ).toBe(true)
  })

  test('upsert ON CONFLICT DO UPDATE does not trip the update table heuristic', () => {
    const diags = parseAndValidate(`
postgres db {
  connection: PG_URL
  table t { schema: @json { { "type": "object", "properties": { "a": { "type": "string" } } } } }
}
workflow g {
  label: "G"
  root {
    type: postgres
    postgres: db
    insert: @sql { INSERT INTO t (a) VALUES ({{a}}) ON CONFLICT (a) DO UPDATE SET a = EXCLUDED.a }
    params: @ts { return { a: "" } }
  }
}
`)

    expect(diags).toEqual([])
  })
})
