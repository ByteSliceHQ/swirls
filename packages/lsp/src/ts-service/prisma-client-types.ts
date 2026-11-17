import type * as DMMF from '@prisma/dmmf'
import { getDMMF, uncapitalize } from '@prisma/get-dmmf'
import {
  DATABASE_OPERATION_ACTIONS,
  PRISMA_SCHEMA_HEADER,
} from '@swirls/definition/managed-database'

/**
 * Renders TypeScript declaration text for a typed Prisma client surface
 * (`context.db.<dbName>.<model>.<action>(...)`) from a Swirls managed-database
 * `@prisma` schema island, using Prisma's DMMF.
 *
 * The output lands inside a module-scoped virtual `.ts` file that an in-process
 * `ts.LanguageService` compiles, powering autocomplete / type-checking of the
 * `@ts { }` blocks in `.swirls` files. Style mirrors {@link ./context-types.ts}:
 * no semicolons at statement level, single quotes, no `as` assertions.
 */

/** A single managed database block to type. */
export interface DbSchemaInput {
  /** database block name as written in the DSL, e.g. "app_db" */
  name: string
  /** models-only `@prisma` island text (no datasource/generator header) */
  schemaSource: string
}

/**
 * The capability scope the rendered client is narrowed to. Mirrors the
 * host-side enforcement in {@link DATABASE_OPERATION_ACTIONS}:
 * - `code` / `migration`: full actions, NO `$transaction`
 * - `query` / `insert` / `update` / `delete`: narrowed to that operation's actions
 * - `transaction`: exposes ONLY `$transaction<R>(fn)`; the `tx` client has all
 *   actions but no nested `$transaction`
 */
export type DbClientScopeKind =
  | 'code'
  | 'migration'
  | 'query'
  | 'insert'
  | 'update'
  | 'delete'
  | 'transaction'

// ---------------------------------------------------------------------------
// Scalar type maps
// ---------------------------------------------------------------------------

/**
 * Prisma scalar -> the TS type a user actually receives over the sandbox wire
 * codec on a model result. Decimal is serialized as a string, BigInt as a
 * native bigint, Bytes as a Uint8Array, DateTime as a Date, Json as unknown.
 */
const WIRE_SCALAR_TS: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'unknown',
  Bytes: 'Uint8Array',
  BigInt: 'bigint',
  Decimal: 'string',
}

/**
 * Prisma scalar -> the TS type accepted as *input* (where / data / orderBy).
 * Inputs are more permissive than outputs: DateTime accepts an ISO string,
 * BigInt / Decimal accept a plain number too.
 */
const INPUT_SCALAR_TS: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'Date | string',
  Json: 'unknown',
  Bytes: 'Uint8Array',
  BigInt: 'bigint | number',
  Decimal: 'string | number',
  Null: 'null',
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

/** True when a type string needs parentheses before appending `[]`. */
function needsParensForList(type: string): boolean {
  return type.includes(' ') || type.includes('|')
}

/** Apply a list suffix, parenthesizing unions / multi-token types. */
function applyList(type: string, isList: boolean): string {
  if (!isList) {
    return type
  }
  return needsParensForList(type) ? `(${type})[]` : `${type}[]`
}

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** An object-literal key, quoted only when it is not a valid identifier. */
function objectKey(name: string): string {
  return VALID_IDENTIFIER.test(name) ? name : JSON.stringify(name)
}

/** Sanitize a DSL db name into a valid identifier suffix (`Db$<sanitized>`). */
function sanitizeNamespace(name: string): string {
  return `Db$${name.replace(/[^A-Za-z0-9_]/g, '_')}`
}

// ---------------------------------------------------------------------------
// DMMF rendering
// ---------------------------------------------------------------------------

/** Render a datamodel enum or schema enum as a literal-union type alias. */
function renderEnum(name: string, values: readonly string[]): string {
  const union =
    values.length > 0 ? values.map((v) => `'${v}'`).join(' | ') : 'never'
  return `  export type ${name} = ${union}`
}

/** Render one alternative of an input field's `inputTypes`, or null to skip it. */
function renderInputTypeRef(ref: DMMF.InputTypeRef): string | null {
  switch (ref.location) {
    case 'scalar': {
      const mapped = INPUT_SCALAR_TS[ref.type]
      return mapped === undefined ? null : applyList(mapped, ref.isList)
    }
    case 'enumTypes':
    case 'inputObjectTypes':
      return applyList(ref.type, ref.isList)
    default:
      // outputObjectTypes / fieldRefTypes are not part of the user-facing input surface
      return null
  }
}

/** Render one input field (`SchemaArg`) as a `key?: T` member line. */
function renderInputField(field: DMMF.SchemaArg): string {
  const alternatives: string[] = []
  for (const ref of field.inputTypes) {
    const rendered = renderInputTypeRef(ref)
    if (rendered !== null && !alternatives.includes(rendered)) {
      alternatives.push(rendered)
    }
  }
  let value = alternatives.length > 0 ? alternatives.join(' | ') : 'never'
  if (field.isNullable) {
    value = `${value} | null`
  }
  const optional = field.isRequired ? '' : '?'
  return `${objectKey(field.name)}${optional}: ${value}`
}

/** Render a whole input object type (`UserWhereInput` etc.). */
function renderInputType(input: DMMF.InputType): string {
  if (input.fields.length === 0) {
    return `  export type ${input.name} = {}`
  }
  const members = input.fields
    .map((f) => `    ${renderInputField(f)}`)
    .join('\n')
  return `  export type ${input.name} = {\n${members}\n  }`
}

interface Relation {
  name: string
  relatedModel: string
  isList: boolean
  isRequired: boolean
}

/** Map a scalar / enum model field to its wire TS type (with null / list). */
function renderModelScalarField(field: DMMF.Field): string {
  const base =
    field.kind === 'enum'
      ? field.type
      : (WIRE_SCALAR_TS[field.type] ?? 'unknown')
  if (field.isList) {
    return applyList(base, true)
  }
  return field.isRequired ? base : `${base} | null`
}

/** Render the base scalar/output type for a model (relations excluded). */
function renderModelType(model: DMMF.Model): string {
  const scalarFields = model.fields.filter(
    (f) => f.kind === 'scalar' || f.kind === 'enum',
  )
  if (scalarFields.length === 0) {
    return `  export type ${model.name} = {}`
  }
  const members = scalarFields
    .map((f) => `    ${objectKey(f.name)}: ${renderModelScalarField(f)}`)
    .join('\n')
  return `  export type ${model.name} = {\n${members}\n  }`
}

/** The relations of a model, in declaration order. */
function modelRelations(model: DMMF.Model): Relation[] {
  return model.fields
    .filter((f) => f.kind === 'object')
    .map((f) => ({
      name: f.name,
      relatedModel: f.type,
      isList: f.isList,
      isRequired: f.isRequired,
    }))
}

/**
 * The payload expression for a related field inside a `GetPayload` mapped type.
 * `carrier` is `S` (select) or `I` (include); the field's args live at
 * `carrier[K]`, recursing into the related model's `GetPayload` when args are an
 * object, else falling back to the related base type.
 */
function relationPayloadExpr(rel: Relation, carrier: 'S' | 'I'): string {
  const src = `${carrier}[K]`
  const base = `(${src} extends object ? ${rel.relatedModel}GetPayload<${src}> : ${rel.relatedModel})`
  if (rel.isList) {
    return `${base}[]`
  }
  return rel.isRequired ? base : `${base} | null`
}

/** The truthy-key filter clause reused by both select and include mappings. */
const TRUTHY_FILTER = 'extends false | undefined | null ? never : K'

/**
 * Render `<M>GetPayload<A>`: a conditional/mapped type resolving the exact row
 * shape from a caller's `select` / `include` args, recursing into related
 * models. Terminates because user args nest finitely.
 */
function renderGetPayload(model: DMMF.Model, relations: Relation[]): string {
  const m = model.name

  const selectRelationBranches = relations
    .map(
      (rel) =>
        `        K extends '${rel.name}' ? ${relationPayloadExpr(rel, 'S')}\n        :`,
    )
    .join('\n')
  const includeRelationBranches = relations
    .map(
      (rel) =>
        `        K extends '${rel.name}' ? ${relationPayloadExpr(rel, 'I')}\n        :`,
    )
    .join('\n')

  const selectBody = `      [K in keyof S as S[K] ${TRUTHY_FILTER}]:
${selectRelationBranches ? `${selectRelationBranches}\n` : ''}        K extends keyof ${m} ? ${m}[K]
        : never`

  const includeBody = `      [K in keyof I as I[K] ${TRUTHY_FILTER}]:
${includeRelationBranches ? `${includeRelationBranches}\n` : ''}        never`

  return `  export type ${m}GetPayload<A> = A extends { select: infer S }
    ? {
${selectBody}
      }
    : ${m} & (A extends { include: infer I }
        ? {
${includeBody}
          }
        : {})`
}

/** Signature generators keyed by Prisma action name, given model name `m`. */
function actionSignatures(m: string): Record<string, string> {
  const selectArg = `${m}SelectArg`
  const selectOnly = `${m}SelectOnlyArg`
  const findBase = `${m}FindManyBase`
  const payload = `${m}GetPayload<A>`
  return {
    findMany: `findMany<A extends ${selectArg}>(args?: A & ${findBase}): Promise<${payload}[]>`,
    findFirst: `findFirst<A extends ${selectArg}>(args?: A & ${findBase}): Promise<${payload} | null>`,
    findFirstOrThrow: `findFirstOrThrow<A extends ${selectArg}>(args?: A & ${findBase}): Promise<${payload}>`,
    findUnique: `findUnique<A extends ${selectArg}>(args: A & { where: ${m}WhereUniqueInput }): Promise<${payload} | null>`,
    findUniqueOrThrow: `findUniqueOrThrow<A extends ${selectArg}>(args: A & { where: ${m}WhereUniqueInput }): Promise<${payload}>`,
    count: `count(args?: ${findBase}): Promise<number>`,
    aggregate: `aggregate(args?: Record<string, unknown>): Promise<Record<string, unknown>>`,
    groupBy: `groupBy(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>`,
    create: `create<A extends ${selectArg}>(args: A & { data: ${m}CreateInput }): Promise<${payload}>`,
    createMany: `createMany(args: { data: ${m}CreateManyInput | ${m}CreateManyInput[] }): Promise<{ count: number }>`,
    createManyAndReturn: `createManyAndReturn<A extends ${selectOnly}>(args: A & { data: ${m}CreateInput | ${m}CreateInput[] }): Promise<${payload}[]>`,
    update: `update<A extends ${selectArg}>(args: A & { where: ${m}WhereUniqueInput; data: ${m}UpdateInput }): Promise<${payload}>`,
    updateMany: `updateMany(args: { where?: ${m}WhereInput; data: ${m}UpdateManyMutationInput }): Promise<{ count: number }>`,
    updateManyAndReturn: `updateManyAndReturn<A extends ${selectOnly}>(args: A & { where?: ${m}WhereInput; data: ${m}UpdateManyMutationInput }): Promise<${payload}[]>`,
    upsert: `upsert<A extends ${selectArg}>(args: A & { where: ${m}WhereUniqueInput; create: ${m}CreateInput; update: ${m}UpdateInput }): Promise<${payload}>`,
    delete: `delete<A extends ${selectArg}>(args: A & { where: ${m}WhereUniqueInput }): Promise<${payload}>`,
    deleteMany: `deleteMany(args?: { where?: ${m}WhereInput }): Promise<{ count: number }>`,
  }
}

/** Per-model helper arg types (select/include carriers + concrete bases). */
function renderModelArgTypes(model: DMMF.Model, relations: Relation[]): string {
  const m = model.name
  const scalarFields = model.fields.filter(
    (f) => f.kind === 'scalar' || f.kind === 'enum',
  )
  const selectMembers = [
    ...scalarFields.map((f) => `    ${objectKey(f.name)}?: boolean`),
    ...relations.map(
      (r) => `    ${objectKey(r.name)}?: boolean | ${r.relatedModel}FindArgs`,
    ),
  ].join('\n')
  const includeMembers =
    relations.length > 0
      ? relations
          .map(
            (r) =>
              `    ${objectKey(r.name)}?: boolean | ${r.relatedModel}FindArgs`,
          )
          .join('\n')
      : ''

  const findManyBase = `  export type ${m}FindManyBase = {
    where?: ${m}WhereInput
    orderBy?: ${m}OrderByWithRelationInput | ${m}OrderByWithRelationInput[]
    take?: number
    skip?: number
    cursor?: ${m}WhereUniqueInput
    distinct?: ${m}ScalarFieldEnum | ${m}ScalarFieldEnum[]
  }`

  return [
    `  export type ${m}Select = {\n${selectMembers}\n  }`,
    includeMembers
      ? `  export type ${m}Include = {\n${includeMembers}\n  }`
      : `  export type ${m}Include = {}`,
    `  export type ${m}SelectArg = { select?: ${m}Select | null; include?: ${m}Include | null }`,
    `  export type ${m}SelectOnlyArg = { select?: ${m}Select | null }`,
    findManyBase,
    `  export type ${m}FindArgs = ${m}SelectArg & ${m}FindManyBase`,
  ].join('\n')
}

/** All delegate interfaces for one model, one per action-set. */
function renderModelDelegates(model: DMMF.Model): string {
  const m = model.name
  const signatures = actionSignatures(m)
  const blocks: string[] = []
  for (const [suffix, actions] of DELEGATE_SETS) {
    const methods = actions
      .map((action) => `    ${signatures[action]}`)
      .join('\n')
    blocks.push(`  export interface ${m}Delegate${suffix} {\n${methods}\n  }`)
  }
  return blocks.join('\n')
}

/** Client type aliases mapping each model's client property to its delegate. */
function renderClients(models: readonly DMMF.Model[]): string {
  const clientType = (suffix: string): string => {
    const members = models
      .map(
        (model) =>
          `${uncapitalize(model.name)}: ${model.name}Delegate${suffix}`,
      )
      .join('; ')
    return `  export type Client${suffix} = { ${members} }`
  }
  return [
    clientType('Full'),
    clientType('Query'),
    clientType('Insert'),
    clientType('Update'),
    clientType('Delete'),
    `  export type ClientTransaction = { $transaction<R>(fn: (tx: ClientFull) => Promise<R>): Promise<R> }`,
  ].join('\n')
}

/** Delegate suffix -> the Prisma action set it exposes. */
const DELEGATE_SETS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Full', DATABASE_OPERATION_ACTIONS.transaction],
  ['Query', DATABASE_OPERATION_ACTIONS.query],
  ['Insert', DATABASE_OPERATION_ACTIONS.insert],
  ['Update', DATABASE_OPERATION_ACTIONS.update],
  ['Delete', DATABASE_OPERATION_ACTIONS.delete],
]

/**
 * Render the interior of a database namespace from a parsed DMMF document.
 * Type/interface declarations hoist, so declaration order is for readability
 * only.
 */
function renderNamespaceBody(dmmf: DMMF.Document): string {
  const parts: string[] = []
  const emittedTypeNames = new Set<string>()

  // 1. Enums (datamodel first, then schema enums, deduped by name).
  for (const e of dmmf.datamodel.enums) {
    emittedTypeNames.add(e.name)
    parts.push(
      renderEnum(
        e.name,
        e.values.map((v) => v.name),
      ),
    )
  }
  const schemaEnums = [
    ...(dmmf.schema.enumTypes.prisma ?? []),
    ...(dmmf.schema.enumTypes.model ?? []),
  ]
  for (const e of schemaEnums) {
    if (emittedTypeNames.has(e.name)) {
      continue
    }
    emittedTypeNames.add(e.name)
    parts.push(renderEnum(e.name, e.values))
  }

  // 2. Base model (scalar/output) types.
  for (const model of dmmf.datamodel.models) {
    parts.push(renderModelType(model))
  }

  // 3. Input object types (where / data / orderBy / ...).
  const inputTypes = [
    ...(dmmf.schema.inputObjectTypes.prisma ?? []),
    ...(dmmf.schema.inputObjectTypes.model ?? []),
  ]
  for (const input of inputTypes) {
    parts.push(renderInputType(input))
  }

  // 4-7. Per-model select/include/args, GetPayload, delegates.
  for (const model of dmmf.datamodel.models) {
    const relations = modelRelations(model)
    parts.push(renderModelArgTypes(model, relations))
    parts.push(renderGetPayload(model, relations))
    parts.push(renderModelDelegates(model))
  }

  // 8. Clients.
  parts.push(renderClients(dmmf.datamodel.models))

  return parts.join('\n')
}

/**
 * Loose namespace body used when a schema fails DMMF: every client degrades to
 * an index-signature shape so `.db.<name>.<anything>(...)` stays permissive
 * instead of erroring on an unparseable schema.
 */
// The schema is invalid (routinely true mid-keystroke), so the whole client
// degrades to fully-permissive typing: calls AND their results must not
// produce follow-on TS errors — the only diagnostic the user should see is
// the Prisma one inside the @prisma island. Hence `any`, not `unknown`.
const FALLBACK_NAMESPACE_BODY = `  type LooseDelegate = { [action: string]: (...args: any[]) => Promise<any> }
  export type ClientFull = { [model: string]: LooseDelegate }
  export type ClientQuery = ClientFull
  export type ClientInsert = ClientFull
  export type ClientUpdate = ClientFull
  export type ClientDelete = ClientFull
  export type ClientTransaction = { $transaction<R>(fn: (tx: ClientFull) => Promise<R>): Promise<R> }`

/** Scope -> the client type alias exposed as the db field. */
const SCOPE_CLIENT: Record<DbClientScopeKind, string> = {
  code: 'ClientFull',
  migration: 'ClientFull',
  query: 'ClientQuery',
  insert: 'ClientInsert',
  update: 'ClientUpdate',
  delete: 'ClientDelete',
  transaction: 'ClientTransaction',
}

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

const MAX_CACHE_ENTRIES = 16

/** getDMMF is the expensive (WASM) step; cache its rendered body per source. */
const bodyCache = new Map<string, string>()
/** Full-result cache so repeated identical calls return referentially-equal output. */
const resultCache = new Map<string, { declarations: string; dbType: string }>()

/** Read from an LRU-ordered map, refreshing recency on hit. */
function lruGet<V>(cache: Map<string, V>, key: string): V | undefined {
  const value = cache.get(key)
  if (value !== undefined) {
    cache.delete(key)
    cache.set(key, value)
  }
  return value
}

/** Write to an LRU-ordered map, evicting the oldest entry past the cap. */
function lruSet<V>(cache: Map<string, V>, key: string, value: V): void {
  cache.set(key, value)
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
}

/** Compile a single schema source to its rendered namespace body (cached). */
function renderBodyForSource(schemaSource: string): string {
  const cached = lruGet(bodyCache, schemaSource)
  if (cached !== undefined) {
    return cached
  }

  let body: string
  try {
    const dmmf = getDMMF({ datamodel: PRISMA_SCHEMA_HEADER + schemaSource })
    body = 'type' in dmmf ? FALLBACK_NAMESPACE_BODY : renderNamespaceBody(dmmf)
  } catch {
    // getDMMF can throw on some invalid schemas rather than returning an error.
    body = FALLBACK_NAMESPACE_BODY
  }

  lruSet(bodyCache, schemaSource, body)
  return body
}

/** Stable cache key over the scope and the ordered (name, source) list. */
function resultCacheKey(
  databases: readonly DbSchemaInput[],
  scope: DbClientScopeKind,
): string {
  const dbSig = databases.map((d) => `${d.name}${d.schemaSource}`).join('')
  return `${scope}\u0000${dbSig}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render namespace declarations plus the `db` field type for a set of managed
 * databases at a given capability scope.
 *
 * Returns `null` only when `databases` is empty. A database whose schema fails
 * DMMF (routinely true mid-keystroke) gets a loose namespace + `dbType` entry
 * rather than being dropped, so `context.db` never vanishes while editing.
 *
 * @returns `declarations` - one `namespace Db$<sanitizedName> { ... }` block per
 *   database; `dbType` - an inline object type keyed by the original db name.
 */
export function renderDbContextField(
  databases: DbSchemaInput[],
  scope: DbClientScopeKind,
): { declarations: string; dbType: string } | null {
  if (databases.length === 0) {
    return null
  }

  const key = resultCacheKey(databases, scope)
  const cachedResult = lruGet(resultCache, key)
  if (cachedResult !== undefined) {
    return cachedResult
  }

  const clientTypeName = SCOPE_CLIENT[scope]
  const namespaceBlocks: string[] = []
  const dbTypeEntries: string[] = []

  // A schema that fails DMMF (routinely true mid-keystroke while the user
  // edits the @prisma island) still gets its loose fallback namespace, so
  // `context.db` never disappears from TS blocks and produces phantom
  // "Property 'db' does not exist" errors.
  for (const database of databases) {
    const body = renderBodyForSource(database.schemaSource)
    const namespaceName = sanitizeNamespace(database.name)
    namespaceBlocks.push(`namespace ${namespaceName} {\n${body}\n}`)
    dbTypeEntries.push(
      `${objectKey(database.name)}: ${namespaceName}.${clientTypeName}`,
    )
  }

  const result = {
    declarations: namespaceBlocks.join('\n'),
    dbType: `{ ${dbTypeEntries.join('; ')} }`,
  }
  lruSet(resultCache, key, result)
  return result
}
