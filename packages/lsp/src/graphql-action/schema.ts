import { createHash } from 'node:crypto'

import { buildClientSchema, buildSchema, type GraphQLSchema } from 'graphql'

import { GRAPHQL_SCHEMA_JSON_FILENAME, GRAPHQL_SCHEMA_SDL_FILENAME } from './constants'

function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function hashContent(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

const schemaCache = new Map<string, GraphQLSchema>()

export function clearGraphqlSchemaCache(): void {
  schemaCache.clear()
}

export function loadGraphqlSchemaFromContent(raw: string): GraphQLSchema {
  const json = tryParseJson(raw)

  if (json && typeof json === 'object' && 'data' in json) {
    const data = (json as { data?: { __schema?: unknown } }).data

    if (data?.__schema) {
      return buildClientSchema(data as Parameters<typeof buildClientSchema>[0])
    }
  }

  const trimmed = raw.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    throw new Error('GraphQL content is not a valid introspection result')
  }

  return buildSchema(raw)
}

export function loadGraphqlSchemaFromContentCached(sourceKey: string, raw: string): GraphQLSchema {
  const cacheKey = `${sourceKey}:${hashContent(raw)}`
  const cached = schemaCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const schema = loadGraphqlSchemaFromContent(raw)
  schemaCache.set(cacheKey, schema)
  return schema
}

export function siblingGraphqlSchemaPaths(actionRelativePath: string): {
  jsonPath: string
  sdlPath: string
} {
  const normalized = actionRelativePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const dir = slash >= 0 ? normalized.slice(0, slash) : ''
  const prefix = dir ? `${dir}/` : ''
  return {
    jsonPath: `${prefix}${GRAPHQL_SCHEMA_JSON_FILENAME}`,
    sdlPath: `${prefix}${GRAPHQL_SCHEMA_SDL_FILENAME}`,
  }
}

export function readSiblingGraphqlSchemaContent(args: {
  actionRelativePath: string
  readFile: (relativePath: string) => string | undefined
}): string | undefined {
  const paths = siblingGraphqlSchemaPaths(args.actionRelativePath)
  return args.readFile(paths.sdlPath) ?? args.readFile(paths.jsonPath) ?? undefined
}

function loadGraphqlSchemaFromRaw(sourceKey: string, raw: string): GraphQLSchema | undefined {
  try {
    return loadGraphqlSchemaFromContentCached(sourceKey, raw)
  } catch {
    return undefined
  }
}

export function loadSiblingGraphqlSchema(args: {
  actionRelativePath: string
  readFile: (relativePath: string) => string | undefined
}): GraphQLSchema | undefined {
  const paths = siblingGraphqlSchemaPaths(args.actionRelativePath)
  const raw = readSiblingGraphqlSchemaContent(args)

  if (!raw) {
    return undefined
  }

  return loadGraphqlSchemaFromRaw(paths.sdlPath, raw)
}

export function providerGraphqlSchemaContentPaths(provider: string): {
  jsonPath: string
  sdlPath: string
} {
  const prefix = `swirls/integrations/${provider}`
  return {
    jsonPath: `${prefix}/${GRAPHQL_SCHEMA_JSON_FILENAME}`,
    sdlPath: `${prefix}/${GRAPHQL_SCHEMA_SDL_FILENAME}`,
  }
}

export function readProviderGraphqlSchemaContent(args: {
  provider: string
  readFile: (relativePath: string) => string | undefined
}): string | undefined {
  const paths = providerGraphqlSchemaContentPaths(args.provider)
  return args.readFile(paths.sdlPath) ?? args.readFile(paths.jsonPath) ?? undefined
}

export function loadProviderGraphqlSchema(args: {
  provider: string
  readFile: (relativePath: string) => string | undefined
}): GraphQLSchema | undefined {
  const paths = providerGraphqlSchemaContentPaths(args.provider)
  const raw = readProviderGraphqlSchemaContent(args)

  if (!raw) {
    return undefined
  }

  return loadGraphqlSchemaFromRaw(paths.sdlPath, raw)
}
