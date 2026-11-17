/**
 * Write a SwirlsFile AST back out as `.swirls` source.
 *
 * The output parses to the same AST, embedded code is kept byte for byte, and
 * serializing the result again changes nothing. It is not a formatter: the AST
 * does not hold `//` comments or the order blocks were written in, so those are
 * lost and blocks come out grouped by kind. Do not wire it to format-on-save.
 */

import type { FileRetention } from '@swirls/definition/file-values'
import { DEFAULT_AGENT_PROVIDER } from './agent/provider'
import type {
  ActionDecl,
  AgentContextDecl,
  AgentDecl,
  AgentProfileDecl,
  AgentSandboxDecl,
  AgentWalletDecl,
  AppDecl,
  AuthDecl,
  ClaimCondition,
  ComputerDecl,
  ConfigValue,
  ConnectionDecl,
  ConnectorDecl,
  DatabaseDecl,
  DiskDecl,
  EdgeDecl,
  FormDecl,
  McpDecl,
  MigrationDecl,
  NetworkDecl,
  NodeDecl,
  PolicyDecl,
  PolicyGrant,
  PostgresDecl,
  RoleDecl,
  ScheduleDecl,
  SchemaDecl,
  SecretsDecl,
  SkillDecl,
  StreamDecl,
  SwirlsFile,
  TriggerDecl,
  ViewDecl,
  WebhookDecl,
  WorkflowDecl,
} from './ast'
import type { ChannelDecl } from './channel/ast'
import type { MockDecl } from './mock/ast'
import type { OperationDecl } from './operation/ast'
import type {
  ExpectAssertion,
  ExpectDecl,
  JudgeDecl,
  PlaybookCaseDecl,
  PlaybookDecl,
  PlaybookEvalDecl,
} from './playbook/ast'
import type { QueryDecl } from './query/ast'

function escapeString(s: string): string {
  return (
    '"' +
    s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') +
    '"'
  )
}

/** Emit `secrets: [ KEY1, key2 ]` — bare identifiers when valid, else quoted. */
function serializeSecretKeys(keys: string[]): string {
  const parts = keys.map((k) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : escapeString(k),
  )
  return `[${parts.join(', ')}]`
}

/** Emit `secrets: { block: [ VAR1, VAR2 ] }` for root/node blocks. */
function serializeSecretsMap(map: Record<string, string[]>): string {
  const entries = Object.entries(map).map(([block, vars]) => {
    const blockKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(block)
      ? block
      : escapeString(block)
    return `      ${blockKey}: ${serializeSecretKeys(vars)}`
  })
  return `{\n${entries.join('\n')}\n    }`
}

function serializeObjectLiteral(
  obj: Record<string, unknown>,
  indent: string,
): string {
  const entries = Object.entries(obj).map(([k, v]) => {
    const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : escapeString(k)
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      return `${indent}  ${key}: ${serializeObjectLiteral(v as Record<string, unknown>, `${indent}  `)}`
    }
    if (Array.isArray(v)) {
      const items = v.map((item) =>
        typeof item === 'object' && item != null
          ? serializeObjectLiteral(
              item as Record<string, unknown>,
              `${indent}  `,
            )
          : typeof item === 'string'
            ? escapeString(item)
            : String(item),
      )
      return `${indent}  ${key}: [${items.join(', ')}]`
    }

    if (typeof v === 'string') {
      return `${indent}  ${key}: ${escapeString(v)}`
    }

    return `${indent}  ${key}: ${String(v)}`
  })

  return entries.length ? `{\n${entries.join('\n')}\n${indent}}` : '{}'
}

/** Serialize review config so schema can be @json { } and title/description/content as @ts { } when multi-line. */
function serializeReviewConfig(
  rc: Record<string, unknown>,
  indent: string,
): string {
  const codeLikeKeys = new Set([
    'title',
    'description',
    'content',
    'approvedOutput',
    'rejectedOutput',
  ])

  const entries: string[] = []

  for (const [k, v] of Object.entries(rc)) {
    const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : escapeString(k)
    const keyIndent = `${indent}  `

    if (k === 'schemaRef') {
      if (typeof v === 'string') {
        entries.push(`${keyIndent}schema: ${v}`)
      }
      continue
    }

    if (k === 'schema') {
      if (v != null && typeof v === 'object' && !Array.isArray(v)) {
        const json = JSON.stringify(v, null, 2)

        entries.push(
          `${keyIndent}schema: @json {\n${json
            .split('\n')
            .map((line) => `${keyIndent}  ${line}`)
            .join('\n')}\n${keyIndent}}`,
        )
      } else if (v === null) {
        entries.push(`${keyIndent}schema: null`)
      }
      continue
    }

    if (codeLikeKeys.has(k) && typeof v === 'string') {
      if (v.includes('\n')) {
        entries.push(`${keyIndent}${key}: ${fenced('ts', v, keyIndent)}`)
      } else {
        entries.push(`${keyIndent}${key}: ${escapeString(v)}`)
      }
      continue
    }

    if (Array.isArray(v)) {
      const items = v.map((item) =>
        typeof item === 'object' && item != null
          ? serializeObjectLiteral(item as Record<string, unknown>, keyIndent)
          : typeof item === 'string'
            ? escapeString(item)
            : String(item),
      )
      entries.push(`${keyIndent}${key}: [${items.join(', ')}]`)
      continue
    }

    if (v != null && typeof v === 'object') {
      entries.push(
        `${keyIndent}${key}: ${serializeObjectLiteral(v as Record<string, unknown>, keyIndent)}`,
      )
      continue
    }

    if (typeof v === 'string') {
      entries.push(`${keyIndent}${key}: ${escapeString(v)}`)
      continue
    }

    if (typeof v === 'boolean' || typeof v === 'number') {
      entries.push(`${keyIndent}${key}: ${String(v)}`)
    }
  }

  return entries.length ? `{\n${entries.join('\n')}\n${indent}}` : '{}'
}

/**
 * Marks a line of embedded code while the output is assembled, so a caller
 * that indents a whole block (an inline subgraph) leaves it alone. Removed
 * before `serialize` returns.
 */
const VERBATIM = '\u0000'

/**
 * Write an embedded block back exactly as it was read. The body is everything
 * between the braces, so it is emitted verbatim: re-indenting it would change
 * the text of any multi-line template string inside, and would grow by one
 * level on every round trip. Only the whitespace before the closing brace is
 * normalised. A body built in code (no leading newline) is laid out on its own
 * lines, or kept inline when it is a single line.
 */
function fenced(lang: string, code: string | undefined, indent: string): string {
  const body = (code ?? '').replace(/\s+$/, '')
  if (body.trim() === '') {
    return `@${lang} {\n${indent}}`
  }
  const sourceShaped = /^[ \t]*\r?\n/.test(body)
  if (sourceShaped) {
    const lines = body.replace(/^([ \t]*\r?\n)+/, '').split('\n')
    return `@${lang} {\n${lines.map((line) => VERBATIM + line).join('\n')}\n${indent}}`
  }
  if (!body.includes('\n')) {
    return `@${lang} { ${body.trim()} }`
  }
  return `@${lang} {\n${body}\n${indent}}`
}

function serializeConfigValue(value: ConfigValue, indent: string): string {
  switch (value.kind) {
    case 'string':
      return escapeString(value.value)
    case 'number':
      return String(value.value)
    case 'null':
      return 'null'
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'object': {
      const entries = Object.entries(value.value)
        .map(
          ([k, v]) =>
            `${indent}  ${k}: ${serializeConfigValue(v, `${indent}  `)}`,
        )
        .join('\n')
      return entries ? `{\n${entries}\n${indent}}` : '{}'
    }
    case 'array': {
      const items = value.value.map((v) =>
        serializeConfigValue(v, `${indent}  `),
      )

      return `[${items.join(', ')}]`
    }
    case 'ts_block': {
      return fenced('ts', value.code, indent)
    }
    case 'ts_file_ref':
      return `@ts ${escapeString(value.path)}`
    case 'sql_block': {
      return fenced('sql', value.code, indent)
    }
    default:
      return '""'
  }
}

function serializeForm(f: FormDecl): string {
  const lines = [`  label: ${escapeString(f.label)}`]

  if (f.description != null) {
    lines.push(`  description: ${escapeString(f.description)}`)
  }

  if (f.enabled != null) {
    lines.push(`  enabled: ${f.enabled}`)
  }

  // Skip emitting the default ('internal') so unmodified .swirls files round-
  // trip without an extra field being injected on serialize.
  if (f.visibility !== 'internal') {
    lines.push(`  visibility: ${f.visibility}`)
  }

  if (f.authRef) {
    lines.push(`  auth: ${f.authRef.name}`)
  }

  if (f.schemaRef != null && f.schemaRef !== '') {
    lines.push(`  schema: ${f.schemaRef}`)
  } else if (f.schema != null) {
    if (f.schemaBlock != null) {
      lines.push(
        `  schema: ${fenced('json', f.schemaBlock.code, '  ')}`,
      )
    } else {
      lines.push(`  schema: ${serializeObjectLiteral(f.schema, '  ')}`)
    }
  }

  return `form ${f.name} {\n${lines.join('\n')}\n}\n`
}

function serializeWebhook(w: WebhookDecl): string {
  const lines = [`  label: ${escapeString(w.label)}`]
  if (w.description != null) {
    lines.push(`  description: ${escapeString(w.description)}`)
  }

  if (w.enabled != null) {
    lines.push(`  enabled: ${w.enabled}`)
  }

  if (w.schemaRef != null && w.schemaRef !== '') {
    lines.push(`  schema: ${w.schemaRef}`)
  } else if (w.schema != null) {
    if (w.schemaBlock != null) {
      lines.push(
        `  schema: ${fenced('json', w.schemaBlock.code, '  ')}`,
      )
    } else {
      lines.push(`  schema: ${serializeObjectLiteral(w.schema, '  ')}`)
    }
  }

  if (w.secretRef) {
    lines.push(`  secret: ${w.secretRef.blockName}.${w.secretRef.varName}`)
  }

  if (w.header) {
    lines.push(`  header: ${escapeString(w.header.value)}`)
  }

  return `webhook ${w.name} {\n${lines.join('\n')}\n}\n`
}

function serializeSchedule(s: ScheduleDecl): string {
  const lines = [
    `  label: ${escapeString(s.label)}`,
    `  cron: ${escapeString(s.cron)}`,
  ]

  if (s.description != null) {
    lines.push(`  description: ${escapeString(s.description)}`)
  }

  if (s.timezone != null) {
    lines.push(`  timezone: ${escapeString(s.timezone)}`)
  }

  if (s.enabled != null) {
    lines.push(`  enabled: ${s.enabled}`)
  }

  return `schedule ${s.name} {\n${lines.join('\n')}\n}\n`
}

function serializeSecrets(s: SecretsDecl): string {
  const lines: string[] = [`  label: ${escapeString(s.label)}`]
  if (s.description != null) {
    lines.push(`  description: ${escapeString(s.description)}`)
  }
  if (s.type != null) {
    lines.push(`  type: ${s.type}`)
  }
  lines.push(`  vars: ${serializeSecretKeys(s.vars)}`)
  return `secret ${s.name} {\n${lines.join('\n')}\n}\n`
}

function serializeAuth(a: AuthDecl): string {
  const lines: string[] = [`    label: ${escapeString(a.label)}`]
  if (a.description != null) {
    lines.push(`    description: ${escapeString(a.description)}`)
  }
  lines.push(`    type: ${a.authType}`)

  if (a.secretsRef != null && a.secretsRef !== '') {
    lines.push(`    secrets: ${a.secretsRef}`)
  }

  const keys = Object.keys(a.configFields).sort()
  for (const k of keys) {
    lines.push(`    ${k}: ${serializeConfigValue(a.configFields[k]!, '    ')}`)
  }

  return `auth ${a.name} {\n${lines.join('\n')}\n}\n`
}

function serializeConnection(c: ConnectionDecl): string {
  const lines: string[] = []
  if (c.label != null && c.label !== '') {
    lines.push(`  label: ${escapeString(c.label)}`)
  }
  if (c.description != null) {
    lines.push(`  description: ${escapeString(c.description)}`)
  }
  lines.push(`  provider: ${c.provider}`)
  if (c.baseUrl != null) {
    lines.push(`  base_url: ${escapeString(c.baseUrl)}`)
  }
  if (c.authRef != null) {
    lines.push(`  auth: ${c.authRef}`)
  }
  if (c.networkRef != null) {
    lines.push(`  network: ${c.networkRef}`)
  }
  return `connection ${c.name} {\n${lines.join('\n')}\n}\n`
}

function serializeApp(a: AppDecl): string {
  const lines: string[] = []

  if (a.label != null) {
    lines.push(`  label: ${escapeString(a.label)}`)
  }
  if (a.description != null) {
    lines.push(`  description: ${escapeString(a.description)}`)
  }
  if (a.icon != null) {
    lines.push(`  icon: ${escapeString(a.icon)}`)
  }

  if (a.brand != null) {
    lines.push('  brand {')
    if (a.brand.accent != null) {
      lines.push(`    accent: ${escapeString(a.brand.accent)}`)
    }
    if (a.brand.logo != null) {
      lines.push(`    logo: ${escapeString(a.brand.logo)}`)
    }
    if (a.brand.theme != null) {
      lines.push(`    theme: ${escapeString(a.brand.theme)}`)
    }
    if (a.brand.tokens != null) {
      lines.push('    tokens {')
      for (const mode of ['light', 'dark'] as const) {
        const map = a.brand.tokens[mode]
        if (map === undefined) {
          continue
        }
        lines.push(`      ${mode} {`)
        for (const [key, entry] of Object.entries(map)) {
          if (entry === undefined) {
            continue
          }
          lines.push(`        ${key}: ${escapeString(entry.value)}`)
        }
        lines.push('      }')
      }
      lines.push('    }')
    }
    if (a.brand.avatar != null) {
      lines.push('    avatar {')
      if (a.brand.avatar.variant != null) {
        lines.push(`      variant: ${escapeString(a.brand.avatar.variant)}`)
      }
      if (a.brand.avatar.colors != null && a.brand.avatar.colors.length > 0) {
        lines.push(
          `      colors: [${a.brand.avatar.colors.map((color) => escapeString(color)).join(', ')}]`,
        )
      }
      if (a.brand.avatar.shape != null) {
        lines.push(`      shape: ${escapeString(a.brand.avatar.shape)}`)
      }
      lines.push('    }')
    }
    lines.push('  }')
  }

  if (a.audience != null) {
    lines.push('  audience {')
    lines.push(`    admission: ${a.audience.admission}`)
    if (a.audience.auth != null) {
      lines.push(`    auth: ${a.audience.auth}`)
    }
    if (a.audience.idp != null) {
      lines.push(`    idp: ${a.audience.idp}`)
    }
    if (a.audience.allowDomains != null && a.audience.allowDomains.length > 0) {
      lines.push(
        `    allow_domains: [${a.audience.allowDomains.map((d) => escapeString(d)).join(', ')}]`,
      )
    }
    if (a.audience.denyDomains != null && a.audience.denyDomains.length > 0) {
      lines.push(
        `    deny_domains: [${a.audience.denyDomains.map((d) => escapeString(d)).join(', ')}]`,
      )
    }
    lines.push('  }')
  }

  if (a.landing != null) {
    lines.push('  landing {')
    if (a.landing.layout != null) {
      lines.push(`    layout: ${a.landing.layout}`)
    }
    if (a.landing.image != null) {
      lines.push(`    image: ${escapeString(a.landing.image)}`)
    }
    if (a.landing.title != null) {
      lines.push(`    title: ${escapeString(a.landing.title)}`)
    }
    if (a.landing.subtitle != null) {
      lines.push(`    subtitle: ${escapeString(a.landing.subtitle)}`)
    }
    if (a.landing.signInTitle != null) {
      lines.push(`    sign_in_title: ${escapeString(a.landing.signInTitle)}`)
    }
    if (a.landing.signInHint != null) {
      lines.push(`    sign_in_hint: ${escapeString(a.landing.signInHint)}`)
    }
    if (a.landing.footer != null) {
      lines.push(`    footer: ${escapeString(a.landing.footer)}`)
    }
    if (a.landing.discover != null) {
      lines.push('    discover {')
      const discover = a.landing.discover
      if (discover.index != null) {
        lines.push(`      index: ${discover.index}`)
      }
      if (discover.metaTitle != null) {
        lines.push(`      meta_title: ${escapeString(discover.metaTitle)}`)
      }
      if (discover.metaDescription != null) {
        lines.push(
          `      meta_description: ${escapeString(discover.metaDescription)}`,
        )
      }
      if (discover.keywords != null && discover.keywords.length > 0) {
        lines.push(
          `      keywords: [${discover.keywords.map((k) => escapeString(k)).join(', ')}]`,
        )
      }
      if (discover.ogImage != null) {
        lines.push(`      og_image: ${escapeString(discover.ogImage)}`)
      }
      if (discover.canonical != null) {
        lines.push(`      canonical: ${escapeString(discover.canonical)}`)
      }
      if (discover.locale != null) {
        lines.push(`      locale: ${escapeString(discover.locale)}`)
      }
      if (discover.summary != null) {
        lines.push(`      summary: ${escapeString(discover.summary)}`)
      }
      if (discover.audience != null) {
        lines.push(`      audience: ${escapeString(discover.audience)}`)
      }
      if (discover.capabilities != null && discover.capabilities.length > 0) {
        lines.push(
          `      capabilities: [${discover.capabilities.map((c) => escapeString(c)).join(', ')}]`,
        )
      }
      if (discover.faq != null && discover.faq.items.length > 0) {
        lines.push('      faq {')
        for (const item of discover.faq.items) {
          lines.push('        item {')
          lines.push(`          question: ${escapeString(item.question)}`)
          lines.push(`          answer: ${escapeString(item.answer)}`)
          lines.push('        }')
        }
        lines.push('      }')
      }
      if (discover.organization != null) {
        lines.push(`      organization: ${escapeString(discover.organization)}`)
      }
      if (discover.organizationUrl != null) {
        lines.push(
          `      organization_url: ${escapeString(discover.organizationUrl)}`,
        )
      }
      if (discover.applicationCategory != null) {
        lines.push(
          `      application_category: ${escapeString(discover.applicationCategory)}`,
        )
      }
      lines.push('    }')
    }
    lines.push('  }')
  }

  if (a.shell != null) {
    lines.push('  shell {')
    if (a.shell.preset != null) {
      lines.push(`    preset: ${a.shell.preset}`)
    }
    for (const region of a.shell.regions) {
      lines.push(`    ${region.name} {`)
      for (const [key, val] of Object.entries(region.props)) {
        if (Array.isArray(val)) {
          lines.push(`      ${key}: [${val.join(', ')}]`)
        } else if (typeof val === 'boolean') {
          lines.push(`      ${key}: ${val}`)
        } else {
          lines.push(`      ${key}: ${escapeString(val)}`)
        }
      }
      lines.push('    }')
    }
    lines.push('  }')
  }

  if (a.nav != null) {
    lines.push('  nav {')
    for (const section of a.nav.sections) {
      lines.push(`    section ${escapeString(section.title)} {`)
      for (const entry of section.entries) {
        const nameRhs = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(entry.pageName)
          ? entry.pageName
          : escapeString(entry.pageName)
        const tail =
          entry.label != null ? ` { label: ${escapeString(entry.label)} }` : ''
        lines.push(`      page: ${nameRhs}${tail}`)
      }
      lines.push('    }')
    }
    lines.push('  }')
  }

  for (const page of a.pages) {
    lines.push(`  page ${page.name} {`)
    if (page.label != null) {
      lines.push(`    label: ${escapeString(page.label)}`)
    }
    if (page.icon != null) {
      lines.push(`    icon: ${escapeString(page.icon)}`)
    }
    if (page.viewport != null) {
      lines.push(`    viewport: ${page.viewport}`)
    }
    if (page.channel != null) {
      lines.push(`    channel: ${page.channel}`)
    }
    if (page.threads != null) {
      lines.push(`    threads: [${page.threads.join(', ')}]`)
    }
    if (page.reviews != null) {
      lines.push(`    reviews: [${page.reviews.join(', ')}]`)
    }
    if (page.render != null) {
      lines.push(`    render: @openui {${page.render.content}}`)
    }
    lines.push('  }')
  }

  return `app ${a.name} {\n${lines.join('\n')}\n}\n`
}

function serializeMcp(m: McpDecl): string {
  const lines: string[] = []
  if (m.label != null && m.label !== '') {
    lines.push(`  label: ${escapeString(m.label)}`)
  }
  if (m.description != null) {
    lines.push(`  description: ${escapeString(m.description)}`)
  }
  lines.push(`  url: ${escapeString(m.url)}`)
  if (m.auth != null) {
    lines.push(`  auth: ${m.auth}`)
  }
  if (m.networkRef != null) {
    lines.push(`  network: ${m.networkRef}`)
  }
  return `mcp ${m.name} {\n${lines.join('\n')}\n}\n`
}

function serializeNetwork(n: NetworkDecl): string {
  const lines: string[] = []
  if (n.label != null) {
    lines.push(`  label: ${escapeString(n.label)}`)
  }
  if (n.description != null) {
    lines.push(`  description: ${escapeString(n.description)}`)
  }

  if (n.expose != null) {
    lines.push('  expose: {')
    const named = [
      ['apps', n.expose.apps],
      ['channels', n.expose.channels],
      ['forms', n.expose.forms],
      ['webhooks', n.expose.webhooks],
      ['services', n.expose.services],
    ] as const
    for (const [kind, refs] of named) {
      if (refs.length > 0) {
        lines.push(`    ${kind}: [${refs.map((ref) => ref.name).join(', ')}]`)
      }
    }
    if (n.expose.databases.length > 0) {
      lines.push('    databases: [')
      for (const database of n.expose.databases) {
        lines.push('      {')
        lines.push(`        database: ${database.database}`)
        lines.push(
          `        connections: [${database.connections.map((ref) => ref.name).join(', ')}]`,
        )
        lines.push('      }')
      }
      lines.push('    ]')
    }
    lines.push('  }')
  }

  return `network ${n.name} {\n${lines.join('\n')}\n}\n`
}

function serializeConnector(c: ConnectorDecl): string {
  const lines: string[] = []
  if (c.label != null && c.label !== '') {
    lines.push(`  label: ${escapeString(c.label)}`)
  }
  if (c.description != null) {
    lines.push(`  description: ${escapeString(c.description)}`)
  }
  if (lines.length === 0) {
    return `connector ${c.name} {\n}\n`
  }
  return `connector ${c.name} {\n${lines.join('\n')}\n}\n`
}

function serializeActionSchemaField(
  key: 'input' | 'output',
  ref: string | undefined,
  schema: ActionDecl['input'],
  block: ActionDecl['inputBlock'],
  indent = '  ',
): string | undefined {
  if (ref != null && ref !== '') {
    return `${indent}${key}: ${ref}`
  }
  if (schema != null) {
    if (block != null) {
      return `${indent}${key}: ${fenced('json', block.code, indent)}`
    }
    return `${indent}${key}: ${serializeObjectLiteral(schema, indent)}`
  }
  return undefined
}

function serializeAction(a: ActionDecl): string {
  const lines: string[] = []
  if (a.label) {
    lines.push(`  label: ${escapeString(a.label)}`)
  }
  if (a.description != null) {
    lines.push(`  description: ${escapeString(a.description)}`)
  }
  if (a.provider) {
    lines.push(`  provider: ${a.provider}`)
  }
  if (a.method) {
    lines.push(`  method: ${a.method}`)
  }
  if (a.path) {
    lines.push(`  path: ${escapeString(a.path)}`)
  }
  if (a.encoding) {
    lines.push(`  encoding: ${a.encoding}`)
  }
  if (a.scopes?.length) {
    const scopeParts = a.scopes.map((s) => escapeString(s)).join(', ')
    lines.push(`  scopes: [${scopeParts}]`)
  }
  const inputLine = serializeActionSchemaField(
    'input',
    a.inputRef,
    a.input,
    a.inputBlock,
  )
  if (inputLine) {
    lines.push(inputLine)
  }
  const outputLine = serializeActionSchemaField(
    'output',
    a.outputRef,
    a.output,
    a.outputBlock,
  )
  if (outputLine) {
    lines.push(outputLine)
  }
  if (a.graphqlDocument) {
    lines.push(`  document: ${escapeString(a.graphqlDocument)}`)
  }
  return `action ${a.name} {\n${lines.join('\n')}\n}\n`
}

function serializeChannel(c: ChannelDecl): string {
  const lines: string[] = []
  if (c.label != null && c.label !== '') {
    lines.push(`  label: ${escapeString(c.label)}`)
  }
  if (c.description != null) {
    lines.push(`  description: ${escapeString(c.description)}`)
  }
  lines.push(`  platform: ${c.platform}`)
  if (c.agent) {
    lines.push(`  agent: ${c.agent}`)
  }
  if (c.workflows) {
    lines.push(`  workflows: [${c.workflows.join(', ')}]`)
  }
  if (c.enabled != null) {
    lines.push(`  enabled: ${c.enabled}`)
  }
  if (c.connection != null) {
    lines.push(`  connection: ${c.connection}`)
  }
  if (c.connector != null) {
    lines.push(`  connector: ${c.connector}`)
  }
  // `mode:` and the response-policy knobs are meaningless for MCP channels and
  // the validator forbids them, so omit them there to keep the serialized form
  // round-trip valid.
  if (c.platform !== 'mcp') {
    lines.push(`  mode: ${c.mode}`)
    if (c.engagementTimeout != null) {
      lines.push(`  engagement_timeout: ${escapeString(c.engagementTimeout)}`)
    }
    if (c.cooldown != null) {
      lines.push(`  cooldown: ${escapeString(c.cooldown)}`)
    }
    if (c.maxUnpromptedPerHour != null) {
      lines.push(`  max_unprompted_per_hour: ${c.maxUnpromptedPerHour}`)
    }
  }
  return `channel ${c.name} {\n${lines.join('\n')}\n}\n`
}

function serializeQuery(q: QueryDecl): string {
  const lines: string[] = []
  if (q.label != null && q.label !== '') {
    lines.push(`  label: ${escapeString(q.label)}`)
  }
  if (q.description != null) {
    lines.push(`  description: ${escapeString(q.description)}`)
  }
  if (q.enabled != null) {
    lines.push(`  enabled: ${q.enabled}`)
  }
  lines.push(`  database: ${q.database}`)
  if (q.sql) {
    lines.push(`  sql: ${serializeConfigValue(q.sql, '  ')}`)
  }
  return `query ${q.name} {\n${lines.join('\n')}\n}\n`
}

function serializeNodeType(type: string): string {
  return type === 'graph' ? 'workflow' : type
}

function serializeConfigFieldKey(key: string): string {
  return key === 'graph' ? 'workflow' : key
}

function serializeRoot(n: NodeDecl): string {
  const lines: string[] = [
    `    type: ${serializeNodeType(n.type)}`,
    `    label: ${escapeString(n.label)}`,
  ]

  if (n.description != null) {
    lines.push(`    description: ${escapeString(n.description)}`)
  }

  if (n.outputFormat != null && n.outputFormat !== '') {
    lines.push(`    format: ${n.outputFormat}`)
  }

  if (n.inputSchemaRef != null && n.inputSchemaRef !== '') {
    lines.push(`    inputSchema: ${n.inputSchemaRef}`)
  } else if (n.inputSchema != null) {
    if (n.inputSchemaBlock != null) {
      lines.push(
        `    inputSchema: ${fenced('json', n.inputSchemaBlock.code, '    ')}`,
      )
    } else {
      lines.push(
        `    inputSchema: ${serializeObjectLiteral(n.inputSchema, '    ')}`,
      )
    }
  }
  if (n.outputSchemaRef != null && n.outputSchemaRef !== '') {
    lines.push(`    outputSchema: ${n.outputSchemaRef}`)
  } else if (n.outputSchema != null) {
    if (n.outputSchemaBlock != null) {
      lines.push(
        `    outputSchema: ${fenced('json', n.outputSchemaBlock.code, '    ')}`,
      )
    } else {
      lines.push(
        `    outputSchema: ${serializeObjectLiteral(n.outputSchema, '    ')}`,
      )
    }
  }

  if (n.reviewConfig != null && typeof n.reviewConfig === 'object') {
    const rc = n.reviewConfig as Record<string, unknown>
    const keys = Object.keys(rc)

    if (keys.length === 1 && keys[0] === 'enabled' && rc.enabled === true) {
      lines.push('    review: true')
    } else {
      lines.push(`    review: ${serializeReviewConfig(rc, '    ')}`)
    }
  }

  if (n.secretsMap != null && Object.keys(n.secretsMap).length > 0) {
    lines.push(`    secrets: ${serializeSecretsMap(n.secretsMap)}`)
  }

  for (const [key, value] of Object.entries(n.configFields)) {
    if (
      key === 'type' ||
      key === 'label' ||
      key === 'description' ||
      key === 'inputSchema' ||
      key === 'outputSchema' ||
      key === 'format'
    ) {
      continue
    }

    lines.push(
      `    ${serializeConfigFieldKey(key)}: ${serializeConfigValue(value, '    ')}`,
    )
  }
  return `  root {\n${lines.join('\n')}\n  }\n`
}

function serializeNode(n: NodeDecl): string {
  const lines: string[] = [
    `    type: ${serializeNodeType(n.type)}`,
    `    label: ${escapeString(n.label)}`,
  ]

  if (n.description != null) {
    lines.push(`    description: ${escapeString(n.description)}`)
  }

  if (n.outputFormat != null && n.outputFormat !== '') {
    lines.push(`    format: ${n.outputFormat}`)
  }

  if (n.outputSchemaRef != null && n.outputSchemaRef !== '') {
    lines.push(`    schema: ${n.outputSchemaRef}`)
  } else if (n.outputSchema != null) {
    if (n.outputSchemaBlock != null) {
      lines.push(
        `    schema: ${fenced('json', n.outputSchemaBlock.code, '    ')}`,
      )
    } else {
      lines.push(
        `    schema: ${serializeObjectLiteral(n.outputSchema, '    ')}`,
      )
    }
  }

  if (n.reviewConfig != null && typeof n.reviewConfig === 'object') {
    const rc = n.reviewConfig as Record<string, unknown>
    const keys = Object.keys(rc)

    if (keys.length === 1 && keys[0] === 'enabled' && rc.enabled === true) {
      lines.push('    review: true')
    } else {
      lines.push(`    review: ${serializeReviewConfig(rc, '    ')}`)
    }
  }

  if (n.secretsMap != null && Object.keys(n.secretsMap).length > 0) {
    lines.push(`    secrets: ${serializeSecretsMap(n.secretsMap)}`)
  }

  for (const [key, value] of Object.entries(n.configFields)) {
    if (
      key === 'type' ||
      key === 'label' ||
      key === 'description' ||
      key === 'schema' ||
      key === 'format'
    ) {
      continue
    }

    lines.push(
      `    ${serializeConfigFieldKey(key)}: ${serializeConfigValue(value, '    ')}`,
    )
  }

  if (n.subgraph) {
    lines.push(serializeSubgraphBody(n.subgraph))
  }

  return `  node ${n.name} {\n${lines.join('\n')}\n  }\n`
}

/** Inline subgraph under a node (map/fanout/while): indent nested graph body by +4 spaces. */
function serializeSubgraphBody(sg: NonNullable<NodeDecl['subgraph']>): string {
  const nest = '    '
  const parts: string[] = [`${nest}subgraph {`]
  for (const node of sg.nodes) {
    const block = node.isRoot ? serializeRoot(node) : serializeNode(node)
    const indented = block
      .split('\n')
      .map((line) =>
        line.length > 0 && !line.startsWith(VERBATIM) ? nest + line : line,
      )
      .join('\n')
    parts.push(indented)
  }
  if (sg.edges.length > 0) {
    parts.push(`${nest}  flow {`)
    for (const e of sg.edges) {
      const inner = serializeEdge(e).trim()
      parts.push(`${nest}    ${inner}`)
    }
    parts.push(`${nest}  }`)
  }
  parts.push(`${nest}}`)
  return parts.join('\n')
}

function serializeEdge(e: EdgeDecl): string {
  const indent = '    '
  if (e.label != null && e.label !== '') {
    return `${indent}${e.source} -[${escapeString(e.label)}]-> ${e.target}\n`
  }
  return `${indent}${e.source} -> ${e.target}\n`
}

function serializePostgres(r: PostgresDecl): string {
  const lines: string[] = []

  if (r.label != null && r.label !== '') {
    lines.push(`  label: ${escapeString(r.label)}`)
  }

  if (r.secretsRef != null && r.secretsRef !== '') {
    lines.push(`  secrets: ${r.secretsRef}`)
  }

  if (r.connectionIsLiteral) {
    lines.push(`  connection: ${escapeString(r.connection)}`)
  } else if (r.connection) {
    lines.push(`  connection: ${r.connection}`)
  }

  if (r.networkRef != null) {
    lines.push(`  network: ${r.networkRef}`)
  }

  for (const t of r.tables) {
    const tableLines: string[] = []
    if (t.schemaBlock != null) {
      tableLines.push(
        `    schema: ${fenced('json', t.schemaBlock.code, '    ')}`,
      )
    } else if (t.schema != null) {
      const json = JSON.stringify(t.schema, null, 2)
      tableLines.push(
        '    schema: @json {\n' +
          json
            .split('\n')
            .map((line) => `      ${line}`)
            .join('\n') +
          '\n    }',
      )
    }
    lines.push(`\n  table ${t.name} {\n${tableLines.join('\n')}\n  }`)
  }

  return `postgres ${r.name} {\n${lines.join('\n')}\n}\n`
}

function serializeDatabase(d: DatabaseDecl): string {
  const lines: string[] = []

  if (d.label != null && d.label !== '') {
    lines.push(`  label: ${escapeString(d.label)}`)
  }

  if (d.description != null) {
    lines.push(`  description: ${escapeString(d.description)}`)
  }

  lines.push(
    `  schema: ${fenced('prisma', d.schemaSource, '  ')}`,
  )

  for (const connection of d.connections ?? []) {
    const connectionLines: string[] = []
    if (connection.label != null && connection.label !== '') {
      connectionLines.push(`    label: ${escapeString(connection.label)}`)
    }
    if (connection.description != null) {
      connectionLines.push(
        `    description: ${escapeString(connection.description)}`,
      )
    }
    lines.push(
      `\n  connection ${connection.name} {\n${connectionLines.join('\n')}\n  }`,
    )
  }

  return `database ${d.name} {\n${lines.join('\n')}\n}\n`
}

function serializeMigration(m: MigrationDecl): string {
  const lines: string[] = [`  database: ${m.database}`, `  order: ${m.order}`]

  if (m.operation != null) {
    lines.push(`  operation: ${serializeConfigValue(m.operation, '  ')}`)
  }

  return `migration ${m.name} {\n${lines.join('\n')}\n}\n`
}

function serializeIdentifierList(
  ids: string[] | undefined,
): string | undefined {
  if (!ids || ids.length === 0) {
    return undefined
  }
  return `[ ${ids.join(', ')} ]`
}

function serializeWallet(w: AgentWalletDecl, indent: string): string {
  const inner: string[] = []
  if (w.budget != null) {
    inner.push(`budget: ${w.budget}`)
  }
  if (w.cadence != null) {
    inner.push(`cadence: ${w.cadence}`)
  }
  if (w.maxPerCall != null) {
    inner.push(`maxPerCall: ${w.maxPerCall}`)
  }
  return `${indent}wallet: { ${inner.join(', ')} }`
}

function serializeContext(c: AgentContextDecl, indent: string): string {
  const inner: string[] = []
  if (c.budget != null) {
    inner.push(`budget: ${c.budget}`)
  }
  if (c.compactAt != null) {
    inner.push(`compact_at: ${c.compactAt}`)
  }
  if (c.keepRecentTurns != null) {
    inner.push(`keep_recent_turns: ${c.keepRecentTurns}`)
  }
  if (c.pruneToolResultsAfter != null) {
    inner.push(`prune_tool_results_after: ${c.pruneToolResultsAfter}`)
  }
  if (c.cacheRetention != null) {
    inner.push(`cache_retention: ${c.cacheRetention}`)
  }
  // An empty declaration still says something, namely that the author looked at
  // these knobs and chose the managed defaults, so it round-trips as an empty
  // block rather than disappearing from the formatted output.
  if (inner.length === 0) {
    return `${indent}context: { }`
  }
  return `${indent}context: { ${inner.join(', ')} }`
}

function serializeSandbox(s: AgentSandboxDecl, indent: string): string {
  const inner: string[] = []
  if (s.cpus != null) {
    inner.push(`cpus: ${s.cpus}`)
  }
  if (s.memoryMiB != null) {
    inner.push(`memoryMiB: ${s.memoryMiB}`)
  }
  if (s.diskGiB != null) {
    inner.push(`diskGiB: ${s.diskGiB}`)
  }
  if (s.autoStopMinutes != null) {
    inner.push(`autoStopMinutes: ${s.autoStopMinutes}`)
  }
  if (s.autoArchiveMinutes != null) {
    inner.push(`autoArchiveMinutes: ${s.autoArchiveMinutes}`)
  }
  if (s.autoDeleteMinutes != null) {
    inner.push(`autoDeleteMinutes: ${s.autoDeleteMinutes}`)
  }
  if (s.ephemeral != null) {
    inner.push(`ephemeral: ${s.ephemeral}`)
  }
  return `${indent}sandbox: { ${inner.join(', ')} }`
}

function serializeAgentProfile(profile: AgentProfileDecl): string {
  const lines: string[] = []
  if (profile.description) {
    lines.push(`    description: ${escapeString(profile.description)}`)
  }
  if (profile.systemCode?.trim()) {
    lines.push(`    system: ${fenced('ts', profile.systemCode, '    ')}`)
  }
  const tools = serializeIdentifierList(profile.tools)
  if (tools) {
    lines.push(`    tools: ${tools}`)
  }
  const skills = serializeIdentifierList(profile.skills)
  if (skills) {
    lines.push(`    skills: ${skills}`)
  }
  const mcp = serializeIdentifierList(profile.mcp)
  if (mcp) {
    lines.push(`    mcp: ${mcp}`)
  }
  if (profile.sandbox) {
    lines.push(serializeSandbox(profile.sandbox, '    '))
  }
  return `  profile ${profile.name} {\n${lines.join('\n')}\n  }\n`
}

function serializeAgent(a: AgentDecl): string {
  const lines: string[] = []

  if (a.label != null && a.label !== '') {
    lines.push(`  label: ${escapeString(a.label)}`)
  }
  if (a.description) {
    lines.push(`  description: ${escapeString(a.description)}`)
  }

  if (
    a.provider &&
    (a.providerRange != null || a.provider !== DEFAULT_AGENT_PROVIDER)
  ) {
    lines.push(`  provider: ${a.provider}`)
  }
  if (a.model) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(a.model)) {
      lines.push(`  model: ${a.model}`)
    } else {
      lines.push(`  model: ${escapeString(a.model)}`)
    }
  }
  if (a.secretsRef) {
    lines.push(`  secrets: ${a.secretsRef}`)
  }
  if (a.systemCode?.trim()) {
    lines.push(`  system: ${fenced('ts', a.systemCode, '  ')}`)
  }
  if (a.temperature != null) {
    lines.push(`  temperature: ${a.temperature}`)
  }
  if (a.maxTokens != null) {
    lines.push(`  maxTokens: ${a.maxTokens}`)
  }
  if (a.maxSteps != null) {
    lines.push(`  maxSteps: ${a.maxSteps}`)
  }
  const agentTools = serializeIdentifierList(a.tools)
  if (agentTools) {
    lines.push(`  tools: ${agentTools}`)
  }
  const agentSkills = serializeIdentifierList(a.skills)
  if (agentSkills) {
    lines.push(`  skills: ${agentSkills}`)
  }
  const agentMcp = serializeIdentifierList(a.mcp)
  if (agentMcp) {
    lines.push(`  mcp: ${agentMcp}`)
  }
  const agentTeam = serializeIdentifierList(a.team)
  if (agentTeam) {
    lines.push(`  team: ${agentTeam}`)
  }
  if (a.computer) {
    lines.push(`  computer: ${a.computer}`)
  }
  const agentDisks = serializeIdentifierList(a.disks)
  if (agentDisks) {
    lines.push(`  disks: ${agentDisks}`)
  }
  if (a.sandbox) {
    lines.push(serializeSandbox(a.sandbox, '  '))
  }
  if (a.wallet) {
    lines.push(serializeWallet(a.wallet, '  '))
  }
  if (a.context) {
    lines.push(serializeContext(a.context, '  '))
  }
  if (a.suggestions?.length) {
    const items = a.suggestions
      .map(
        (s) =>
          `{ label: ${escapeString(s.label)}, message: ${escapeString(s.message)} }`,
      )
      .join(', ')
    lines.push(`  suggestions: [ ${items} ]`)
  }

  let body = lines.join('\n')
  const profileParts = (a.profiles ?? []).map((p) => serializeAgentProfile(p))
  if (profileParts.length > 0) {
    body = [body, ...profileParts].filter((s) => s.trim().length > 0).join('\n')
  }

  return `agent ${a.name} {\n${body}\n}\n`
}

function serializeSkill(s: SkillDecl): string {
  return `skill ${s.name} {\n  name: ${escapeString(s.skillName)}\n}\n`
}

function serializeComputer(computer: ComputerDecl): string {
  const lines: string[] = []
  if (computer.label) {
    lines.push(`  label: ${escapeString(computer.label)}`)
  }
  if (computer.description) {
    lines.push(`  description: ${escapeString(computer.description)}`)
  }
  if (computer.harness) {
    lines.push(
      `  harness: { type: ${computer.harness.type}, provider: ${computer.harness.provider} }`,
    )
  }
  if (computer.software && computer.software.length > 0) {
    const pins = computer.software
      .map((pin) => {
        const name = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pin.packageName)
          ? pin.packageName
          : escapeString(pin.packageName)
        return `${name}: ${escapeString(pin.pin)}`
      })
      .join(', ')
    lines.push(`  software: { ${pins} }`)
  }
  const disks = serializeIdentifierList(computer.disks)
  if (disks) {
    lines.push(`  disks: ${disks}`)
  }
  if (computer.resources) {
    const inner: string[] = []
    if (computer.resources.cpus != null) {
      inner.push(`cpus: ${computer.resources.cpus}`)
    }
    if (computer.resources.memoryMiB != null) {
      inner.push(`memoryMiB: ${computer.resources.memoryMiB}`)
    }
    if (computer.resources.diskGiB != null) {
      inner.push(`diskGiB: ${computer.resources.diskGiB}`)
    }
    if (inner.length > 0) {
      lines.push(`  resources: { ${inner.join(', ')} }`)
    }
  }
  const body = lines.join('\n')
  if (body.length === 0) {
    return `computer ${computer.name} {\n}\n`
  }
  return `computer ${computer.name} {\n${body}\n}\n`
}

function serializeOperation(operation: OperationDecl): string {
  const lines: string[] = []
  if (operation.label) {
    lines.push(`  label: ${escapeString(operation.label)}`)
  }
  if (operation.description) {
    lines.push(`  description: ${escapeString(operation.description)}`)
  }
  if (operation.platform) {
    lines.push(`  platform: ${operation.platform}`)
  }
  if (operation.runAs) {
    lines.push(`  runAs: ${operation.runAs}`)
  }
  if (operation.timeout != null) {
    lines.push(`  timeout: ${operation.timeout}`)
  }
  const schemas = [
    { key: 'inputSchema', schema: operation.inputSchema },
    { key: 'outputSchema', schema: operation.outputSchema },
  ]
  for (const { key, schema } of schemas) {
    if (schema) {
      const json = JSON.stringify(schema, null, 2)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
      lines.push(`  ${key}: @json {\n${json}\n  }`)
    }
  }
  const { command } = operation
  if (command?.path !== undefined) {
    lines.push(`  command: @${command.lang} ${escapeString(command.path)}`)
  } else if (command?.script !== undefined) {
    // The parser strips the indentation a block's lines share, so indenting
    // the script here does not change what it is read back as.
    const script = command.script
      .trimEnd()
      .split('\n')
      .map((line) => (line === '' ? '' : `    ${line}`))
      .join('\n')
    lines.push(`  command: @${command.lang} {\n${script}\n  }`)
  }
  return `operation ${operation.name} {\n${lines.join('\n')}\n}\n`
}

function serializeDisk(r: DiskDecl): string {
  const lines: string[] = []

  if (r.label != null && r.label !== '') {
    lines.push(`  label: ${escapeString(r.label)}`)
  }

  if (r.region != null && r.region !== '') {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(r.region)) {
      lines.push(`  region: ${r.region}`)
    } else {
      lines.push(`  region: ${escapeString(r.region)}`)
    }
  }

  const body = lines.join('\n')
  if (body.length === 0) {
    return `disk ${r.name} {\n}\n`
  }

  return `disk ${r.name} {\n${body}\n}\n`
}

function serializeSchemaDecl(s: SchemaDecl): string {
  const lines = [`  label: ${escapeString(s.label)}`]

  if (s.description != null) {
    lines.push(`  description: ${escapeString(s.description)}`)
  }

  if (s.schemaRef != null && s.schemaRef !== '') {
    lines.push(`  schema: ${s.schemaRef}`)
  } else if (s.schema != null) {
    if (s.schemaBlock != null) {
      lines.push(
        `  schema: ${fenced('json', s.schemaBlock.code, '  ')}`,
      )
    } else {
      lines.push(`  schema: ${serializeObjectLiteral(s.schema, '  ')}`)
    }
  }

  return `schema ${s.name} {\n${lines.join('\n')}\n}\n`
}

function serializeWorkflow(w: WorkflowDecl): string {
  const lines: string[] = [`  label: ${escapeString(w.label)}`]
  if (w.description != null) {
    lines.push(`  description: ${escapeString(w.description)}`)
  }
  if (w.concurrency != null) {
    lines.push(`  concurrency: ${w.concurrency}`)
  }
  if (w.executionTokenTtl != null) {
    lines.push(`  executionTokenTtl: ${escapeString(w.executionTokenTtl)}`)
  }

  for (const n of w.nodes) {
    lines.push(n.isRoot ? serializeRoot(n) : serializeNode(n))
  }

  if (w.edges.length > 0) {
    lines.push('  flow {')
    for (const e of w.edges) {
      lines.push(serializeEdge(e).trim())
    }
    lines.push('  }')
  }

  return `workflow ${w.name} {\n${lines.join('\n')}\n}\n`
}

function serializeStream(s: StreamDecl): string {
  const lines: string[] = []

  if (s.enabled != null) {
    lines.push(`  enabled: ${s.enabled}`)
  }

  lines.push(`  label: ${escapeString(s.label)}`)

  if (s.description != null) {
    lines.push(`  description: ${escapeString(s.description)}`)
  }

  const g = s.workflowName
  const workflowRhs = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(g) ? g : escapeString(g)
  lines.push(`  workflow: ${workflowRhs}`)

  const ver = s.version
  const rhs = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ver) ? ver : escapeString(ver)
  lines.push(`  version: ${rhs}`)

  lines.push('  versions: {')

  for (const vv of s.versions) {
    const keyRhs = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(vv.key)
      ? vv.key
      : escapeString(vv.key)

    lines.push(`    ${keyRhs} {`)

    if (vv.schemaRef != null && vv.schemaRef !== '') {
      lines.push(`      schema: ${vv.schemaRef}`)
    } else if (vv.schemaBlock != null) {
      lines.push(
        `      schema: ${fenced('json', vv.schemaBlock.code, '      ')}`,
      )
    } else if (vv.schema != null) {
      lines.push(`      schema: ${serializeObjectLiteral(vv.schema, '      ')}`)
    }

    if (vv.condition != null) {
      lines.push(
        `      condition: ${serializeConfigValue(vv.condition, '      ')}`,
      )
    }

    if (vv.prepare != null) {
      lines.push(`      prepare: ${serializeConfigValue(vv.prepare, '      ')}`)
    }

    lines.push('    }')
  }

  lines.push('  }')

  return `stream ${s.name} {\n${lines.join('\n')}\n}\n`
}

function serializeView(v: ViewDecl): string {
  const lines: string[] = []

  if (v.enabled != null) {
    lines.push(`  enabled: ${v.enabled}`)
  }

  lines.push(`  label: ${escapeString(v.label)}`)

  if (v.description != null) {
    lines.push(`  description: ${escapeString(v.description)}`)
  }

  const streamRhs = v.streams
    .map((s) =>
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s.name) ? s.name : escapeString(s.name),
    )
    .join(', ')
  lines.push(`  streams: [${streamRhs}]`)

  if (v.schemaRef != null && v.schemaRef !== '') {
    lines.push(`  schema: ${v.schemaRef}`)
  } else if (v.schemaBlock != null) {
    lines.push(
      `  schema: ${fenced('json', v.schemaBlock.code, '  ')}`,
    )
  } else if (v.schema != null) {
    lines.push(`  schema: ${serializeObjectLiteral(v.schema, '  ')}`)
  }

  if (v.columns != null) {
    lines.push(`  columns: ${serializeConfigValue(v.columns, '  ')}`)
  }

  if (v.computed.length > 0) {
    lines.push('  computed {')

    for (const col of v.computed) {
      const keyRhs = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)
        ? col.name
        : escapeString(col.name)

      lines.push(`    ${keyRhs} {`)

      const g = col.workflowName
      if (g) {
        const graphRhs = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(g)
          ? g
          : escapeString(g)
        lines.push(`      graph: ${graphRhs}`)
      }

      if (col.input != null) {
        lines.push(`      input: ${serializeConfigValue(col.input, '      ')}`)
      }

      if (col.output != null) {
        lines.push(
          `      output: ${serializeConfigValue(col.output, '      ')}`,
        )
      }

      lines.push('    }')
    }

    lines.push('  }')
  }

  return `view ${v.name} {\n${lines.join('\n')}\n}\n`
}

function serializeTrigger(t: TriggerDecl): string {
  const binding = `${t.resourceType}:${t.resourceName} -> ${t.workflowName}`
  const lines = [`  ${binding}`]

  if (t.enabled != null) {
    lines.push(`  enabled: ${t.enabled}`)
  }

  return `trigger ${t.name} {\n${lines.join('\n')}\n}\n`
}

function serializeClaimCondition(c: ClaimCondition): string {
  if (c.op === 'in') {
    const vals = c.values.map((v) => escapeString(v)).join(', ')
    return `    ${c.claim}: [ ${vals} ]`
  }
  return `    ${c.claim}: ${escapeString(c.values[0] ?? '')}`
}

function serializeRole(role: RoleDecl): string {
  const lines: string[] = []
  if (role.description) {
    lines.push(`  description: ${escapeString(role.description)}`)
  }
  if (role.match.length > 0) {
    const conds = role.match.map(serializeClaimCondition).join('\n')
    lines.push(`  match {\n${conds}\n  }`)
  }
  return `role ${role.name} {\n${lines.join('\n')}\n}\n`
}

function serializeGrant(g: PolicyGrant): string {
  const target =
    g.workflow !== undefined ? `workflow ${g.workflow}` : `agent ${g.agent}`
  const head = `  ${g.effect} ${g.role} -> ${target}`
  const body: string[] = []
  if (g.workflows && g.workflows.length > 0) {
    body.push(`    workflows: [ ${g.workflows.join(', ')} ]`)
  }
  if (g.tools && g.tools.length > 0) {
    body.push(`    tools: [ ${g.tools.join(', ')} ]`)
  }
  return body.length > 0 ? `${head} {\n${body.join('\n')}\n  }` : head
}

function serializeFileRetention(retention: FileRetention): string {
  if (retention.mode === 'forever') {
    return 'forever'
  }
  return `${retention.days}d`
}

function serializePolicy(p: PolicyDecl): string {
  const lines: string[] = []
  if (p.files) {
    lines.push(
      `  files {\n    retention: ${serializeFileRetention(p.files.retention)}\n  }`,
    )
  }
  lines.push(...p.grants.map(serializeGrant))
  return `policy {\n${lines.join('\n')}\n}\n`
}

function serializeMock(m: MockDecl): string {
  const lines: string[] = [`mock ${m.name} {`]
  if (m.mode) {
    lines.push(`  mode: ${m.mode}`)
  }
  if (m.only?.length) {
    lines.push(`  only: [${m.only.join(', ')}]`)
  }
  if (m.except?.length) {
    lines.push(`  except: [${m.except.join(', ')}]`)
  }
  if (m.action) {
    lines.push(`  action: ${m.action}`)
  }
  if (m.workflow) {
    lines.push(`  workflow: ${m.workflow}`)
  }
  if (m.node) {
    lines.push(`  node: ${m.node}`)
  }
  if (m.output) {
    lines.push(`  output: ${fenced('json', m.output.code, '  ')}`)
  } else if (m.outputLiteral) {
    lines.push(`  output: ${JSON.stringify(m.outputLiteral)}`)
  }
  if (m.generate === true) {
    lines.push('  generate: true')
  } else if (m.generate && typeof m.generate === 'object') {
    const parts: string[] = []
    if (m.generate.provider) {
      parts.push(`provider: ${m.generate.provider}`)
    }
    if (m.generate.model) {
      parts.push(`model: ${JSON.stringify(m.generate.model)}`)
    }
    if (m.generate.instructions) {
      parts.push(`instructions: ${JSON.stringify(m.generate.instructions)}`)
    }
    lines.push(`  generate: { ${parts.join(', ')} }`)
  }
  if (m.review) {
    lines.push('  review: {')
    lines.push(`    auto: ${m.review.auto}`)
    if (m.review.formData) {
      lines.push(
        `    formData: ${fenced('json', m.review.formData.code, '    ')}`,
      )
    }
    lines.push('  }')
  }
  if (m.ai) {
    const parts: string[] = []
    if (m.ai.provider) {
      parts.push(`provider: ${m.ai.provider}`)
    }
    if (m.ai.model) {
      parts.push(`model: ${JSON.stringify(m.ai.model)}`)
    }
    if (m.ai.instructions) {
      parts.push(`instructions: ${JSON.stringify(m.ai.instructions)}`)
    }
    lines.push(`  ai: { ${parts.join(', ')} }`)
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

function serializeExpect(expect: ExpectDecl, indent: string): string {
  const lines = [`${indent}expect {`]
  for (const a of expect.assertions) {
    lines.push(...serializeAssertion(a, `${indent}  `))
  }
  lines.push(`${indent}}`)
  return lines.join('\n')
}

function serializeAssertion(a: ExpectAssertion, indent: string): string[] {
  switch (a.kind) {
    case 'status':
      return [`${indent}status: ${a.status}`]
    case 'duration':
      return [`${indent}duration: { max: ${JSON.stringify(a.max)} }`]
    case 'output':
      return a.value
        ? [`${indent}output: ${fenced('json', a.value.code, indent)}`]
        : [`${indent}output: ${JSON.stringify(a.literal ?? {})}`]
    case 'nodeOutput':
      return a.value
        ? [
            `${indent}node ${a.node}.output: ${fenced('json', a.value.code, indent)}`,
          ]
        : [`${indent}node ${a.node}.output: ${JSON.stringify(a.literal ?? {})}`]
    case 'nodeStatus':
      return [`${indent}node ${a.node}.status: ${a.status}`]
    case 'includes':
      return [`${indent}includes: ${JSON.stringify(a.value)}`]
    case 'matches':
      return [`${indent}matches: ${JSON.stringify(a.value)}`]
    case 'equals':
      return a.value
        ? [`${indent}equals: ${fenced('json', a.value.code, indent)}`]
        : [`${indent}equals: ${JSON.stringify(a.literal)}`]
    case 'similar':
      return [
        `${indent}similar: { to: ${JSON.stringify(a.to)}, min: ${a.min} }`,
      ]
    case 'events':
      return [`${indent}events: [${a.events.join(', ')}]`]
    case 'called':
      return [`${indent}called: [${a.names.join(', ')}]`]
    case 'notCalled':
      return [`${indent}notCalled: [${a.names.join(', ')}]`]
    case 'order':
      return [`${indent}order: [${a.names.join(', ')}]`]
    case 'path':
      return [`${indent}path: [${a.names.join(', ')}]`]
    case 'budget': {
      const parts: string[] = []
      if (a.duration) {
        parts.push(`duration: ${JSON.stringify(a.duration)}`)
      }
      if (a.tokens != null) {
        parts.push(`tokens: ${a.tokens}`)
      }
      if (a.cost != null) {
        parts.push(`cost: ${a.cost}`)
      }
      return [`${indent}budget: { ${parts.join(', ')} }`]
    }
    default: {
      const _exhaustive: never = a
      return _exhaustive
    }
  }
}

function serializeJudge(judge: JudgeDecl, indent: string): string {
  if (judge.ts?.kind === 'ts_block') {
    return `${indent}judge: ${fenced('ts', judge.ts.code, indent)}`
  }
  const parts: string[] = []
  if (judge.rubric) {
    parts.push(`rubric: ${judge.rubric}`)
  }
  if (judge.criteria) {
    parts.push(`criteria: ${JSON.stringify(judge.criteria)}`)
  }
  if (judge.minScore != null) {
    parts.push(`minScore: ${judge.minScore}`)
  }
  if (judge.severity) {
    parts.push(`severity: ${judge.severity}`)
  }
  if (judge.label) {
    parts.push(`label: ${JSON.stringify(judge.label)}`)
  }
  if (judge.model) {
    parts.push(`model: ${JSON.stringify(judge.model)}`)
  }
  return `${indent}judge: { ${parts.join(', ')} }`
}

function serializeCaseOrEvalBody(
  entry: PlaybookCaseDecl | PlaybookEvalDecl,
  indent: string,
): string[] {
  const lines: string[] = []
  lines.push(`${indent}workflow: ${entry.workflow}`)
  if (entry.input) {
    lines.push(
      `${indent}input: ${fenced('json', entry.input.code, indent)}`,
    )
  } else if (entry.inputLiteral) {
    lines.push(`${indent}input: ${JSON.stringify(entry.inputLiteral)}`)
  }
  if (entry.dataset) {
    lines.push(
      `${indent}dataset: ${fenced('json', entry.dataset.code, indent)}`,
    )
  }
  if (entry.timeout) {
    lines.push(`${indent}timeout: ${JSON.stringify(entry.timeout)}`)
  }
  if (entry.tags?.length) {
    lines.push(`${indent}tags: [${entry.tags.join(', ')}]`)
  }
  if (entry.skip) {
    lines.push(`${indent}skip: ${JSON.stringify(entry.skip)}`)
  }
  if ('retries' in entry && entry.retries != null) {
    lines.push(`${indent}retries: ${entry.retries}`)
  }
  if ('judge' in entry && entry.judge) {
    lines.push(serializeJudge(entry.judge, indent))
  }
  if (entry.expect) {
    lines.push(serializeExpect(entry.expect, indent))
  }
  return lines
}

function serializePlaybook(p: PlaybookDecl): string {
  const lines: string[] = [`playbook ${p.name} {`]
  if (p.label) {
    lines.push(`  label: ${JSON.stringify(p.label)}`)
  }
  if (p.description) {
    lines.push(`  description: ${JSON.stringify(p.description)}`)
  }
  if (p.mocks) {
    lines.push(`  mocks: ${p.mocks}`)
  }
  if (p.tags?.length) {
    lines.push(`  tags: [${p.tags.join(', ')}]`)
  }
  for (const c of p.cases) {
    lines.push(`  case ${c.name} {`)
    lines.push(...serializeCaseOrEvalBody(c, '    '))
    lines.push('  }')
  }
  for (const e of p.evals) {
    lines.push(`  eval ${e.name} {`)
    lines.push(...serializeCaseOrEvalBody(e, '    '))
    lines.push('  }')
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

export function serialize(ast: SwirlsFile): string {
  const parts: string[] = []

  if (ast.version != null) {
    parts.push(`version: ${ast.version}\n`)
  }

  for (const sch of ast.schemas ?? []) {
    parts.push(serializeSchemaDecl(sch))
  }

  for (const f of ast.forms) {
    parts.push(serializeForm(f))
  }

  for (const w of ast.webhooks) {
    parts.push(serializeWebhook(w))
  }

  for (const s of ast.schedules) {
    parts.push(serializeSchedule(s))
  }

  for (const sec of ast.secrets ?? []) {
    parts.push(serializeSecrets(sec))
  }

  for (const a of ast.auths ?? []) {
    parts.push(serializeAuth(a))
  }

  for (const c of ast.connections ?? []) {
    parts.push(serializeConnection(c))
  }

  for (const c of ast.connector ?? []) {
    parts.push(serializeConnector(c))
  }

  for (const a of ast.actions ?? []) {
    parts.push(serializeAction(a))
  }

  for (const r of ast.postgres ?? []) {
    parts.push(serializePostgres(r))
  }

  for (const d of ast.databases ?? []) {
    parts.push(serializeDatabase(d))
  }

  for (const m of ast.migrations ?? []) {
    parts.push(serializeMigration(m))
  }

  for (const r of ast.disk ?? []) {
    parts.push(serializeDisk(r))
  }

  for (const computer of ast.computer ?? []) {
    parts.push(serializeComputer(computer))
  }

  for (const operation of ast.operations ?? []) {
    parts.push(serializeOperation(operation))
  }

  for (const s of ast.skill ?? []) {
    parts.push(serializeSkill(s))
  }

  for (const r of ast.agent ?? []) {
    parts.push(serializeAgent(r))
  }

  for (const m of ast.mcp ?? []) {
    parts.push(serializeMcp(m))
  }

  for (const network of ast.networks ?? []) {
    parts.push(serializeNetwork(network))
  }

  for (const ch of ast.channels ?? []) {
    parts.push(serializeChannel(ch))
  }

  for (const q of ast.queries ?? []) {
    parts.push(serializeQuery(q))
  }

  for (const g of ast.workflows) {
    parts.push(serializeWorkflow(g))
  }

  for (const st of ast.streams ?? []) {
    parts.push(serializeStream(st))
  }

  for (const v of ast.views ?? []) {
    parts.push(serializeView(v))
  }

  for (const t of ast.triggers) {
    parts.push(serializeTrigger(t))
  }

  for (const role of ast.roles ?? []) {
    parts.push(serializeRole(role))
  }

  for (const p of ast.policies ?? []) {
    parts.push(serializePolicy(p))
  }

  for (const a of ast.apps ?? []) {
    parts.push(serializeApp(a))
  }

  for (const m of ast.mocks ?? []) {
    parts.push(serializeMock(m))
  }

  for (const p of ast.playbooks ?? []) {
    parts.push(serializePlaybook(p))
  }

  for (const d of ast.decisions ?? []) {
    parts.push(
      `decision ${d.name} {\n${Object.entries(d.fields)
        .map(
          ([k, v]) =>
            `  ${k}: ${k === 'secrets' ? (Array.isArray(v) ? `[${v.join(', ')}]` : String(v)) : k === 'inputSchema' && typeof v === 'string' ? String(v) : JSON.stringify(v)}`,
        )
        .join('\n')}\n}\n`,
    )
  }
  return parts.join('\n').replaceAll(VERBATIM, '')
}
