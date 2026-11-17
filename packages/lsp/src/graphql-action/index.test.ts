import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import {
  clearGraphqlSchemaCache,
  graphqlActionOutputTypeString,
  graphqlActionParamsTypeString,
  loadGraphqlSchemaFromContent,
  loadGraphqlSchemaFromContentCached,
  validateGraphqlActionOutput,
  validateGraphqlActionVariables,
} from './index'

const fixtureDir = join(import.meta.dir, '__fixtures__')

describe('@swirls/graphql-action', () => {
  test('derives params and output TS types from document + schema', async () => {
    const schemaRaw = await Bun.file(join(fixtureDir, 'users.graphql')).text()
    const schema = loadGraphqlSchemaFromContent(schemaRaw)
    const document = 'query user($id: ID!) { user(id: $id) { id name email createdAt role } }'

    const params = graphqlActionParamsTypeString(schema, document)
    expect(params).toContain('"id": string')

    const output = graphqlActionOutputTypeString(schema, document)
    expect(output).toContain('"id": string')
    expect(output).toContain('"name": string')
  })

  test('preserves list wrappers for connection nodes and edges', async () => {
    const schemaRaw = await Bun.file(join(fixtureDir, 'users.graphql')).text()
    const schema = loadGraphqlSchemaFromContent(schemaRaw)

    const document =
      'query users { users { edges { cursor } nodes { id name } pageInfo { hasNextPage endCursor } } }'

    const output = graphqlActionOutputTypeString(schema, document)
    expect(output).toContain('"nodes": ({ "id": string; "name": string })[]')
    expect(output).toContain('"edges": ({ "cursor": string })[]')
    expect(output).toContain('"pageInfo": { "hasNextPage": boolean; "endCursor": string | null }')
  })

  test('derives params for recursive graphql input types without stack overflow', async () => {
    const schemaRaw = await Bun.file(join(fixtureDir, 'users.graphql')).text()
    const schema = loadGraphqlSchemaFromContent(schemaRaw)

    const document =
      'query issues($first: Int, $filter: IssueFilter) { issues(first: $first, filter: $filter) { nodes { id } } }'

    const params = graphqlActionParamsTypeString(schema, document)
    expect(params).toBeDefined()
    expect(params).toContain('type IssueFilter =')
    expect(params).toContain('"filter"?: IssueFilter')
    expect(params).toContain('"first"?: number')
  })

  test('caches parsed graphql schemas by source key and content hash', async () => {
    clearGraphqlSchemaCache()
    const schemaRaw = await Bun.file(join(fixtureDir, 'users.graphql')).text()

    const first = loadGraphqlSchemaFromContentCached('users.graphql', schemaRaw)
    const second = loadGraphqlSchemaFromContentCached('users.graphql', schemaRaw)

    expect(first).toBe(second)
  })

  test('validates graphql variables and output values', async () => {
    const schemaRaw = await Bun.file(join(fixtureDir, 'users.graphql')).text()
    const schema = loadGraphqlSchemaFromContent(schemaRaw)
    const document = 'query user($id: ID!) { user(id: $id) { id name email createdAt role } }'

    const badVars = validateGraphqlActionVariables(schema, document, {})
    expect(badVars.ok).toBe(false)

    const goodVars = validateGraphqlActionVariables(schema, document, {
      id: '1',
    })

    expect(goodVars.ok).toBe(true)

    const badOut = validateGraphqlActionOutput(schema, document, { id: 1 })
    expect(badOut.ok).toBe(false)

    const goodOut = validateGraphqlActionOutput(schema, document, {
      id: '1',
      name: 'Ada',
      email: null,
      createdAt: '2024-01-01',
      role: 'ADMIN',
    })

    expect(goodOut.ok).toBe(true)
  })
})
