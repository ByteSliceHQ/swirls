import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from '../parser'
import { validate } from '../validator'
import { buildWorkspaceResourceIndex } from '../workspace/workspace-resources'

/** A workflow with a governed `type: database` node plus its `database` block. */
const SOURCE = `
database app_db {
  schema: @prisma {
    model User {
      id       Int    @id @default(autoincrement())
      lastSeen DateTime
    }
  }
}
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return { confirmed: true, cutoff: 0 } } }
  node purge {
    type: database
    label: "Purge"
    database: app_db
    operation: delete
    review: { enabled: true }
    condition: @ts { return context.nodes.root.output.confirmed === true }
    run: @ts {
      return context.db.app_db.user.deleteMany({
        where: { lastSeen: { lt: context.nodes.root.output.cutoff } },
      })
    }
  }
  flow { root -> purge }
}
`

function errorDiagnostics(source: string) {
  const { ast, errors } = parse(source)
  expect(errors).toEqual([])
  return validate(ast).filter((d) => d.severity !== 'warning')
}

describe('type: database node parsing', () => {
  test('a workflow with a database node parses its config fields', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors).toEqual([])

    const node = ast.workflows[0]?.nodes.find((n) => n.name === 'purge')
    expect(node?.type).toBe('database')
    expect(node?.configFields.database?.kind).toBe('string')
    expect(node?.configFields.operation?.kind).toBe('string')
    expect(node?.configFields.condition?.kind).toBe('ts_block')
    expect(node?.configFields.run?.kind).toBe('ts_block')
  })

  test('review parses on a database node like any other node', () => {
    const { ast } = parse(SOURCE)
    const node = ast.workflows[0]?.nodes.find((n) => n.name === 'purge')
    expect(node?.reviewConfig).toEqual({ enabled: true })
  })

  test('a valid database node produces no error diagnostics', () => {
    expect(errorDiagnostics(SOURCE)).toEqual([])
  })
})

describe('type: database node validation', () => {
  test('unknown database reference is reported', () => {
    const diags = errorDiagnostics(`
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node q {
    type: database
    database: nope
    operation: query
    run: @ts { return context.db.nope.user.findMany({}) }
  }
  flow { root -> q }
}
`)
    expect(
      diags.some((d) =>
        d.message.includes('references database "nope" which is not defined'),
      ),
    ).toBe(true)
  })

  test('invalid operation is reported', () => {
    const diags = errorDiagnostics(`
database app_db { schema: @prisma { model User { id Int @id } } }
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node q {
    type: database
    database: app_db
    operation: destroy
    run: @ts { return 1 }
  }
  flow { root -> q }
}
`)
    expect(
      diags.some((d) => d.message.includes('"operation" must be one of')),
    ).toBe(true)
  })

  test('missing run is reported as a required field', () => {
    const diags = errorDiagnostics(`
database app_db { schema: @prisma { model User { id Int @id } } }
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node q {
    type: database
    database: app_db
    operation: query
  }
  flow { root -> q }
}
`)
    expect(diags.some((d) => d.message.includes('requires "run"'))).toBe(true)
  })

  test('condition that is not a @ts block is reported', () => {
    const diags = errorDiagnostics(`
database app_db { schema: @prisma { model User { id Int @id } } }
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node q {
    type: database
    database: app_db
    operation: query
    condition: "always"
    run: @ts { return 1 }
  }
  flow { root -> q }
}
`)
    expect(
      diags.some((d) => d.message.includes('"condition" must be a @ts block')),
    ).toBe(true)
  })
})

describe('type: database node workspace resolution', () => {
  test('a database block declared in another file resolves the node ref', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-db-node-ws-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'consumer.swirls'),
        `version: 1
workflow g {
  label: "G"
  root { type: code label: "R" code: @ts { return {} } }
  node q {
    type: database
    database: remote_db
    operation: query
    run: @ts { return context.db.remote_db.user.findMany({}) }
  }
  flow { root -> q }
}
`,
        'utf-8',
      )
      fs.writeFileSync(
        path.join(dir, 'provider.swirls'),
        `version: 1
database remote_db {
  schema: @prisma { model User { id Int @id } }
}
`,
        'utf-8',
      )

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const consumer = fs.readFileSync(
        path.join(dir, 'consumer.swirls'),
        'utf-8',
      )
      const { ast, errors } = parse(consumer)
      expect(errors.length).toBe(0)

      // Local validation cannot see the other file, so it flags the ref.
      const diagsLocal = validate(ast)
      expect(
        diagsLocal.some((d) =>
          d.message.includes(
            'references database "remote_db" which is not defined',
          ),
        ),
      ).toBe(true)

      // With the workspace index the cross-file database block resolves.
      const diagsWs = validate(ast, { workspace }).filter(
        (d) => d.severity !== 'warning',
      )
      expect(
        diagsWs.some((d) =>
          d.message.includes('references database "remote_db"'),
        ),
      ).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
