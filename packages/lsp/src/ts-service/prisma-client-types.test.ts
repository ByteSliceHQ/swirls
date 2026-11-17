import { describe, expect, test } from 'bun:test'

import { createLanguageServiceFromMap } from './host'
import {
  type DbClientScopeKind,
  type DbSchemaInput,
  renderDbContextField,
} from './prisma-client-types'

const RICH_SCHEMA = `
enum Role {
  ADMIN
  USER
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  createdAt DateTime @default(now())
  meta      Json?
  balance   Decimal
  views     BigInt
  avatar    Bytes?
  role      Role
  posts     Post[]
}

model Post {
  id        Int     @id @default(autoincrement())
  title     String
  published Boolean @default(false)
  author    User    @relation(fields: [authorId], references: [id])
  authorId  Int
}
`

const APP_DB: DbSchemaInput = { name: 'app_db', schemaSource: RICH_SCHEMA }

/**
 * Build a virtual TS file = rendered declarations + a `db` const of the field
 * type + a usage snippet, then return its error-category semantic diagnostics.
 */
function diagnose(
  usage: string,
  scope: DbClientScopeKind,
  databases: DbSchemaInput[] = [APP_DB],
): { count: number; messages: string[] } {
  const rendered = renderDbContextField(databases, scope)

  if (rendered === null) {
    throw new Error('expected non-null rendered client')
  }

  const fileName = '__prisma_client_block.ts'

  const content = `${rendered.declarations}
declare const db: ${rendered.dbType}
async function _run() {
${usage}
}
void _run
export {}
`

  const map = new Map<string, string>([[fileName, content]])
  const ls = createLanguageServiceFromMap(map)
  const errors = ls.getSemanticDiagnostics(fileName).filter((d) => d.category === 1)
  return {
    count: errors.length,
    messages: errors.map((d) =>
      typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText,
    ),
  }
}

describe('renderDbContextField', () => {
  test('returns null for an empty database list', () => {
    expect(renderDbContextField([], 'code')).toBeNull()
  })

  test('dbType is keyed by the original db name and references the scoped client', () => {
    const rendered = renderDbContextField([APP_DB], 'query')
    expect(rendered).not.toBeNull()
    expect(rendered?.dbType).toBe('{ app_db: Db$app_db.ClientQuery }')
    expect(rendered?.declarations.startsWith('namespace Db$app_db {')).toBe(true)
  })

  test('1. valid findMany with where / relation-filter / orderBy / take compiles clean (code scope)', () => {
    const result = diagnose(
      `await db.app_db.user.findMany({
        where: { email: { contains: 'x' }, posts: { some: { published: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })`,
      'code',
    )

    expect(result.messages).toEqual([])
    expect(result.count).toBe(0)
  })

  test('2. select narrows the payload: selected field ok, unselected field errors', () => {
    const ok = diagnose(
      `const r = await db.app_db.user.findMany({ select: { email: true } })
       const e: string = r[0]!.email
       void e`,
      'code',
    )

    expect(ok.count).toBe(0)

    const bad = diagnose(
      `const r = await db.app_db.user.findMany({ select: { email: true } })
       const i = r[0]!.id
       void i`,
      'code',
    )

    expect(bad.count).toBeGreaterThan(0)
  })

  test('3. include hydrates a relation with its typed rows', () => {
    const result = diagnose(
      `const r = await db.app_db.user.findMany({ include: { posts: true } })
       const t: string = r[0]!.posts[0]!.title
       void t`,
      'code',
    )

    expect(result.messages).toEqual([])
    expect(result.count).toBe(0)
  })

  test('4. scalar wire types: DateTime->Date, BigInt->bigint, Decimal->string, Bytes->Uint8Array | null', () => {
    const ok = diagnose(
      `const u = (await db.app_db.user.findMany())[0]!
       const d: Date = u.createdAt
       const b: bigint = u.views
       const dec: string = u.balance
       const av: Uint8Array | null = u.avatar
       void [d, b, dec, av]`,
      'code',
    )

    expect(ok.messages).toEqual([])
    expect(ok.count).toBe(0)

    const bad = diagnose(
      `const u = (await db.app_db.user.findMany())[0]!
       const wrong: string = u.createdAt
       void wrong`,
      'code',
    )

    expect(bad.count).toBeGreaterThan(0)
  })

  test('5. scope narrowing: query cannot create; code has no $transaction; transaction only via tx', () => {
    const queryCreate = diagnose(
      `await db.app_db.user.create({ data: { email: 'a', balance: '1', views: 1n, role: 'USER' } })`,
      'query',
    )

    expect(queryCreate.count).toBeGreaterThan(0)

    const codeTransaction = diagnose(`await db.app_db.$transaction(async () => 1)`, 'code')
    expect(codeTransaction.count).toBeGreaterThan(0)

    const txReachable = diagnose(
      `await db.app_db.$transaction(async (tx) => {
        await tx.user.create({ data: { email: 'a', balance: '1', views: 1n, role: 'USER' } })
      })`,
      'transaction',
    )

    expect(txReachable.messages).toEqual([])
    expect(txReachable.count).toBe(0)

    const txNoDirectModel = diagnose(`await db.app_db.user.findMany()`, 'transaction')
    expect(txNoDirectModel.count).toBeGreaterThan(0)
  })

  test('6. an invalid where field name is a type error', () => {
    const result = diagnose(`await db.app_db.user.findMany({ where: { nonexistent: 1 } })`, 'code')
    expect(result.count).toBeGreaterThan(0)
  })

  test('7. repeated calls with identical input return referentially-equal declarations', () => {
    const a = renderDbContextField([APP_DB], 'code')
    const b = renderDbContextField([APP_DB], 'code')
    expect(a).not.toBeNull()
    expect(a?.declarations).toBe(b?.declarations ?? '')
    // Same underlying object => referential equality on the string.
    expect(a?.declarations === b?.declarations).toBe(true)
  })

  test('8. a broken schema degrades to a loose entry without dropping a valid db', () => {
    const broken: DbSchemaInput = {
      name: 'broken_db',
      schemaSource: 'model X { id Strin }',
    }

    expect(() => renderDbContextField([APP_DB, broken], 'code')).not.toThrow()
    const rendered = renderDbContextField([APP_DB, broken], 'code')
    expect(rendered).not.toBeNull()
    expect(rendered?.dbType).toContain('app_db: Db$app_db.ClientFull')
    expect(rendered?.dbType).toContain('broken_db: Db$broken_db.ClientFull')

    // The valid db still type-checks; the broken db stays permissive.
    const result = diagnose(
      `await db.app_db.user.findMany({ where: { email: { contains: 'x' } } })
       await db.broken_db.anything.doWhatever({ any: 'thing' })`,
      'code',
      [APP_DB, broken],
    )

    expect(result.messages).toEqual([])
    expect(result.count).toBe(0)
  })

  test('all-broken input still renders a loose db entry', () => {
    // A schema is routinely invalid mid-keystroke; `context.db` must degrade
    // to loose typing rather than vanish (which would flag every use of
    // `context.db` with a phantom "Property 'db' does not exist").
    const broken: DbSchemaInput = {
      name: 'broken_db',
      schemaSource: 'model X { id Strin }',
    }

    const rendered = renderDbContextField([broken], 'code')
    expect(rendered).not.toBeNull()
    expect(rendered?.dbType).toContain('broken_db: Db$broken_db.ClientFull')
  })
})
