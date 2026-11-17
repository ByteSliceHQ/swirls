import type { ConfigValue, SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  NetworkDatabaseExposureDecl,
  NetworkDecl,
  NetworkExposeDecl,
  NetworkNamedExposureRef,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseNamedExposureList(
  d: ResourceParserDelegate,
  owner: string,
  field: string,
): NetworkNamedExposureRef[] {
  const token = d.peek()

  if (!token) {
    d.error(`Network "${owner}" expose.${field} must be an array`, token)
    return []
  }

  const value = d.parseConfigValue(token)

  if (!value || value.kind !== 'array') {
    d.error(`Network "${owner}" expose.${field} must be an array`, token)
    return []
  }

  const refs: NetworkNamedExposureRef[] = []

  for (const item of value.value) {
    if (item.kind !== 'string' || item.value.trim() === '') {
      d.error(`Network "${owner}" expose.${field} entries must be resource names`, token)
      continue
    }

    refs.push({ name: item.value, range: item.range })
  }

  return refs
}

function configString(value: ConfigValue | undefined): string | undefined {
  return value?.kind === 'string' && value.value.trim() !== '' ? value.value : undefined
}

function parseDatabaseExposureList(
  d: ResourceParserDelegate,
  owner: string,
): NetworkDatabaseExposureDecl[] {
  const token = d.peek()

  if (!token) {
    d.error(`Network "${owner}" expose.databases must be an array`, token)
    return []
  }

  const value = d.parseConfigValue(token)

  if (!value || value.kind !== 'array') {
    d.error(`Network "${owner}" expose.databases must be an array`, token)
    return []
  }

  const databases: NetworkDatabaseExposureDecl[] = []

  for (const item of value.value) {
    if (item.kind !== 'object') {
      d.error(
        `Network "${owner}" expose.databases entries must be objects with database and connections`,
        token,
      )

      continue
    }

    const databaseValue = item.value.database
    const connectionsValue = item.value.connections
    const database = configString(databaseValue) ?? ''
    const connections: NetworkNamedExposureRef[] = []

    if (!database) {
      d.error(`Network "${owner}" database exposure requires database: <name>`, token)
    }

    if (!connectionsValue || connectionsValue.kind !== 'array') {
      d.error(`Network "${owner}" database exposure requires connections: [<name>, ...]`, token)
    } else {
      for (const connection of connectionsValue.value) {
        if (connection.kind !== 'string' || connection.value.trim() === '') {
          d.error(`Network "${owner}" database connection entries must be resource names`, token)
          continue
        }

        connections.push({ name: connection.value, range: connection.range })
      }
    }

    for (const key of Object.keys(item.value)) {
      if (key !== 'database' && key !== 'connections') {
        d.error(`Unknown network database exposure property "${key}"`, token)
      }
    }

    databases.push({
      database,
      databaseRange: databaseValue?.range,
      connections,
      range: item.range,
    })
  }

  return databases
}

function parseExposeBlock(d: ResourceParserDelegate, owner: string): NetworkExposeDecl | undefined {
  const start = d.peek()

  if (!start || start.value !== 'expose') {
    return undefined
  }

  d.advance()

  if (!d.expect('colon')) {
    d.error('Expected : after expose', d.peek() ?? start)
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after expose:', d.peek() ?? start)
    return undefined
  }

  const apps: NetworkNamedExposureRef[] = []
  const channels: NetworkNamedExposureRef[] = []
  const forms: NetworkNamedExposureRef[] = []
  const webhooks: NetworkNamedExposureRef[] = []
  const services: NetworkNamedExposureRef[] = []
  const databases: NetworkDatabaseExposureDecl[] = []
  const seenKeys = new Set<string>()

  while (!d.eof()) {
    const token = d.peek()

    if (!token || token.kind === 'rbrace') {
      break
    }

    if (token.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyToken = d.peek()
    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (seenKeys.has(key)) {
      d.error(`Duplicate network exposure property "${key}"`, keyToken)
    }

    seenKeys.add(key)

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek() ?? keyToken)
      break
    }

    switch (key) {
      case 'apps':
        apps.push(...parseNamedExposureList(d, owner, key))
        break
      case 'channels':
        channels.push(...parseNamedExposureList(d, owner, key))
        break
      case 'forms':
        forms.push(...parseNamedExposureList(d, owner, key))
        break
      case 'webhooks':
        webhooks.push(...parseNamedExposureList(d, owner, key))
        break
      case 'services':
        services.push(...parseNamedExposureList(d, owner, key))
        break
      case 'databases':
        databases.push(...parseDatabaseExposureList(d, owner))
        break

      default: {
        d.error(`Unknown network exposure property "${key}"`, keyToken)
        const value = d.peek()

        if (value) {
          d.parseConfigValue(value)
        }
      }
    }
  }

  const closing = d.expect('rbrace')

  if (!closing) {
    d.error('Expected } to close expose block', d.peek() ?? start)
  }

  return {
    apps,
    channels,
    forms,
    webhooks,
    services,
    databases,
    range: rangeFromTokens(start, closing ?? start),
  }
}

export function parseNetworkBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): NetworkDecl | null {
  const start = d.expect('keyword')

  if (!start || start.value !== 'network') {
    return null
  }

  const nameToken = d.advance()

  if (!nameToken || nameToken.kind !== 'identifier') {
    d.error('Expected network block name', nameToken)
    d.skipToNextBlock()
    return null
  }

  const name = nameToken.value as string

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let labelRange: SourceRange | undefined
  let description: string | undefined
  let descriptionRange: SourceRange | undefined
  let expose: NetworkExposeDecl | undefined
  const seenKeys = new Set<string>()

  while (!d.eof()) {
    const token = d.peek()

    if (!token || token.kind === 'rbrace') {
      break
    }

    if (token.kind === 'block_comment') {
      d.advance()
      continue
    }

    if ((token.kind === 'identifier' || token.kind === 'keyword') && token.value === 'expose') {
      if (seenKeys.has('expose')) {
        d.error('Duplicate network property "expose"', token)
      }

      seenKeys.add('expose')
      expose = parseExposeBlock(d, name)
      continue
    }

    const keyToken = d.peek()
    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (seenKeys.has(key)) {
      d.error(`Duplicate network property "${key}"`, keyToken)
    }

    seenKeys.add(key)

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek() ?? keyToken)
      break
    }

    if (key === 'label' || key === 'description') {
      const valueToken = d.peek()
      const value = d.parseValue()

      if (typeof value !== 'string') {
        d.error(`Network ${key} must be a quoted string`, valueToken)
      } else if (key === 'label') {
        label = value
        labelRange = valueToken?.range
      } else {
        description = value
        descriptionRange = valueToken?.range
      }

      continue
    }

    d.error(`Unknown network property "${key}"`, keyToken)
    d.parseValue()
  }

  const closing = d.expect('rbrace')

  if (!closing) {
    d.error('Expected } to close network block', d.peek() ?? start)
  }

  return {
    name,
    label,
    labelRange,
    description,
    descriptionRange,
    expose,
    docComment,
    range: rangeFromTokens(start, closing ?? nameToken),
  }
}
