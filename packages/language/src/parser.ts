/**
 * Recursive descent parser for the .swirls DSL. Produces a SwirlsFile AST with source ranges.
 */

import { parseActionBlock } from './action/parser'
import { parseAgentBlock } from './agent/parser'
import { parseAppBlock } from './app/parser'
import type {
  AuthDecl,
  ConfigValue,
  EdgeDecl,
  FormDecl,
  FormVisibility,
  JsonBlockInfo,
  NodeDecl,
  ScheduleDecl,
  SchemaDecl,
  SecretsDecl,
  SourceRange,
  SwirlsFile,
  TriggerDecl,
  WebhookDecl,
  WorkflowDecl,
} from './ast'
import { parseChannelBlock } from './channel/parser'
import { parseComputerBlock } from './computer/parser'
import { parseConnectionBlock } from './connection/parser'
import { parseConnectorBlock } from './connector/parser'
import { parseDatabaseBlock, parseMigrationBlock } from './database/parser'
import { parseDecisionBlock } from './decision'
import { parseDiskBlock } from './disk/parser'
import type { Token } from './lexer'
import { Lexer } from './lexer'
import { parseMcpBlock } from './mcp/parser'
import { parseMockBlock } from './mock/parser'
import { parseNetworkBlock } from './network/parser'
import { parseOperationBlock } from './operation/parser'
import type { ResourceParserDelegate } from './parser-delegate'
import { parsePlaybookBlock } from './playbook/parser'
import { parsePostgresBlock } from './postgres/parser'
import { parseQueryBlock } from './query/parser'
import { parsePolicyBlock, parseRoleBlock } from './rbac/parser'
import { parseSkillBlock } from './skill/parser'
import { parseStreamBlock } from './stream/parser'
import { parseViewBlock } from './view/parser'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

export interface ParseError {
  message: string
  range: SourceRange
}

export interface ParseResult {
  ast: SwirlsFile
  errors: ParseError[]
}

/**
 * Every keyword that opens a top-level block. Doc-comment attachment, error
 * recovery and the "unexpected token" message all read this one list.
 */
const TOP_LEVEL_DECL_KEYWORDS = [
  'form',
  'webhook',
  'schedule',
  'graph',
  'workflow',
  'stream',
  'view',
  'trigger',
  'secret',
  'auth',
  'postgres',
  'database',
  'migration',
  'disk',
  'computer',
  'operation',
  'skill',
  'agent',
  'decision',
  'mcp',
  'network',
  'channel',
  'connection',
  'connector',
  'action',
  'app',
  'schema',
  'role',
  'policy',
  'mock',
  'playbook',
  'query',
] as const

class Parser {
  private tokens: Token[]
  private index = 0
  private errors: ParseError[] = []
  private lastBlockComment: string | undefined

  constructor(source: string) {
    this.tokens = new Lexer(source).tokenize()
  }

  private eof(): boolean {
    return this.index >= this.tokens.length
  }

  private peek(): Token | null {
    return this.index < this.tokens.length ? this.tokens[this.index]! : null
  }

  private advance(): Token | null {
    if (this.index >= this.tokens.length) {
      return null
    }

    return this.tokens[this.index++]!
  }

  private expect(kind: Token['kind']): Token | null {
    const t = this.peek()

    if (t && t.kind === kind) {
      return this.advance()
    }

    return null
  }

  private error(message: string, token?: Token | null): void {
    const t = token ?? this.peek()
    if (t) {
      this.errors.push({
        message,
        range: { ...t.range },
      })
    }
  }

  private delegate(): ResourceParserDelegate {
    return {
      eof: () => this.eof(),
      peek: () => this.peek(),
      advance: () => this.advance(),
      expect: (kind) => this.expect(kind),
      error: (message, token) => this.error(message, token),
      parseValue: () => this.parseValue(),
      parsePropertyKey: () => this.parsePropertyKey(),
      skipToNextBlock: () => this.skipToNextBlock(),
      parseConfigValue: (token) => this.parseConfigValue(token),
    }
  }

  private skipToNextBlock(): void {
    this.lastBlockComment = undefined
    let depth = 0
    while (!this.eof()) {
      const t = this.advance()

      if (!t) {
        break
      }

      if (t.kind === 'lbrace') {
        depth++
      } else if (t.kind === 'rbrace') {
        depth--
        if (depth < 0) {
          break
        }
      } else if (
        depth === 0 &&
        t.kind === 'keyword' &&
        (TOP_LEVEL_DECL_KEYWORDS as readonly string[]).includes(t.value as string)
      ) {
        this.index--
        break
      }
    }
  }

  parse(): ParseResult {
    const ast: SwirlsFile = {
      schemas: [],
      forms: [],
      webhooks: [],
      schedules: [],
      workflows: [],
      streams: [],
      views: [],
      triggers: [],
      secrets: [],
      auths: [],
      postgres: [],
      databases: [],
      migrations: [],
      disk: [],
      computer: [],
      operations: [],
      skill: [],
      agent: [],
      decisions: [],
      mcp: [],
      networks: [],
      channels: [],
      queries: [],
      connections: [],
      connector: [],
      actions: [],
      roles: [],
      policies: [],
      apps: [],
      mocks: [],
      playbooks: [],
    }

    while (!this.eof()) {
      const t = this.peek()

      if (!t) {
        break
      }

      if (t.kind === 'block_comment') {
        const next = this.tokens[this.index + 1]

        if (
          next?.kind === 'keyword' &&
          TOP_LEVEL_DECL_KEYWORDS.includes(
            next.value as (typeof TOP_LEVEL_DECL_KEYWORDS)[number],
          )
        ) {
          this.lastBlockComment = t.value as string
        }

        this.advance()
        continue
      }

      if (t.kind === 'keyword') {
        const kw = t.value as string

        if (kw === 'version') {
          this.advance()
          this.expect('colon')

          const num = this.advance()
          if (num && num.kind === 'number') {
            ast.version = num.value as number
          }

          continue
        }

        if (kw === 'form') {
          const decl = this.parseForm()

          if (decl) {
            ast.forms.push(decl)
          }

          continue
        }

        if (kw === 'webhook') {
          const decl = this.parseWebhook()
          if (decl) {
            ast.webhooks.push(decl)
          }
          continue
        }

        if (kw === 'schema') {
          const decl = this.parseSchemaDecl()

          if (decl) {
            ast.schemas.push(decl)
          }

          continue
        }

        if (kw === 'schedule') {
          const decl = this.parseSchedule()

          if (decl) {
            ast.schedules.push(decl)
          }

          continue
        }

        if (kw === 'graph' || kw === 'workflow') {
          const decl = this.parseWorkflow()

          if (decl) {
            ast.workflows.push(decl)
          }

          continue
        }

        if (kw === 'stream') {
          const afterStream = this.tokens[this.index + 1]
          if (afterStream?.kind === 'colon') {
            this.error(
              '"stream:" is only valid inside a node { } block (did you forget to close a brace?)',
              t,
            )
            this.advance()
            this.expect('colon')
            const vt = this.peek()
            if (vt) {
              this.parseConfigValue(vt)
            }
            continue
          }

          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseStreamBlock(this.delegate(), dc)

          if (decl) {
            ast.streams.push(decl)
          }

          continue
        }

        if (kw === 'view') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseViewBlock(this.delegate(), dc)

          if (decl) {
            ast.views.push(decl)
          }

          continue
        }

        if (kw === 'trigger') {
          const decl = this.parseTrigger()

          if (decl) {
            ast.triggers.push(decl)
          }

          continue
        }

        if (kw === 'secret') {
          const decl = this.parseSecretBlock()

          if (decl) {
            ast.secrets.push(decl)
          }

          continue
        }

        if (kw === 'auth') {
          const decl = this.parseAuth()

          if (decl) {
            ast.auths.push(decl)
          }

          continue
        }

        if (kw === 'postgres') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parsePostgresBlock(this.delegate(), dc)

          if (decl) {
            ast.postgres.push(decl)
          }

          continue
        }

        if (kw === 'database') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseDatabaseBlock(this.delegate(), dc)

          if (decl) {
            ast.databases.push(decl)
          }

          continue
        }

        if (kw === 'migration') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseMigrationBlock(this.delegate(), dc)

          if (decl) {
            ast.migrations.push(decl)
          }

          continue
        }

        if (kw === 'decision') {
          const decl = parseDecisionBlock(
            this.delegate(),
            this.lastBlockComment,
          )
          this.lastBlockComment = undefined
          if (decl) {
            ast.decisions!.push(decl)
          }
          continue
        }

        if (kw === 'agent') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseAgentBlock(this.delegate(), dc)

          if (decl) {
            ast.agent.push(decl)
          }

          continue
        }

        if (kw === 'mcp') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseMcpBlock(this.delegate(), dc)

          if (decl) {
            ast.mcp.push(decl)
          }

          continue
        }

        if (kw === 'network') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseNetworkBlock(this.delegate(), dc)

          if (decl) {
            ast.networks?.push(decl)
          }

          continue
        }

        if (kw === 'channel') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseChannelBlock(this.delegate(), dc)

          if (decl) {
            ast.channels.push(decl)
          }

          continue
        }

        if (kw === 'query') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseQueryBlock(this.delegate(), dc)

          if (decl) {
            ast.queries.push(decl)
          }

          continue
        }

        if (kw === 'connection') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseConnectionBlock(this.delegate(), dc)

          if (decl) {
            ast.connections.push(decl)
          }

          continue
        }

        if (kw === 'connector') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseConnectorBlock(this.delegate(), dc)

          if (decl) {
            ast.connector.push(decl)
          }

          continue
        }

        if (kw === 'action') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseActionBlock(this.delegate(), dc)

          if (decl) {
            ast.actions.push(decl)
          }

          continue
        }

        if (kw === 'app') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseAppBlock(this.delegate(), dc)

          if (decl) {
            ast.apps.push(decl)
          }

          continue
        }

        if (kw === 'disk') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseDiskBlock(this.delegate(), dc)

          if (decl) {
            ast.disk.push(decl)
          }

          continue
        }

        if (kw === 'computer') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseComputerBlock(this.delegate(), dc)

          if (decl) {
            ast.computer.push(decl)
          }

          continue
        }

        if (kw === 'operation') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseOperationBlock(this.delegate(), dc)

          if (decl) {
            ast.operations.push(decl)
          }

          continue
        }

        if (kw === 'skill') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseSkillBlock(this.delegate(), dc)

          if (decl) {
            ast.skill.push(decl)
          }

          continue
        }

        if (kw === 'role') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseRoleBlock(this.delegate(), dc)

          if (decl) {
            ast.roles.push(decl)
          }

          continue
        }

        if (kw === 'policy') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parsePolicyBlock(this.delegate(), dc)

          if (decl) {
            ast.policies.push(decl)
          }

          continue
        }

        if (kw === 'mock') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parseMockBlock(this.delegate(), dc)

          if (decl) {
            ast.mocks.push(decl)
          }

          continue
        }

        if (kw === 'playbook') {
          const dc = this.lastBlockComment
          this.lastBlockComment = undefined
          const decl = parsePlaybookBlock(this.delegate(), dc)

          if (decl) {
            ast.playbooks.push(decl)
          }

          continue
        }

        if (kw === 'review') {
          this.error(
            `"review" must appear inside a node block, not at top level`,
            t,
          )
          this.skipToNextBlock()
          continue
        }
      }

      this.error(
        `Unexpected token: expected ${TOP_LEVEL_DECL_KEYWORDS.slice(0, -1).join(', ')}, or ${TOP_LEVEL_DECL_KEYWORDS.at(-1)}`,
        t,
      )

      this.skipToNextBlock()
    }

    return { ast, errors: this.errors }
  }

  private parseForm(): FormDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'form') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected form name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    const {
      props,
      schemaBlock,
      schemaRef,
      schemaRefRange,
      visibility,
      visibilityRange,
      authRef,
    } = this.parseFormFields()
    const end = this.expect('rbrace') ?? this.peek()

    const form: FormDecl = {
      name: nameTok.value as string,
      label: (props.label as string) ?? '',
      description: props.description as string | undefined,
      docComment,
      enabled: props.enabled as boolean | undefined,
      schema: props.schema as FormDecl['schema'],
      schemaBlock,
      schemaRef,
      schemaRefRange,
      // Default-internal at the AST layer. Once parsing is done, every
      // `FormDecl` carries a concrete `visibility` value; downstream code
      // never needs to handle `undefined`.
      visibility: visibility ?? 'internal',
      visibilityRange,
      authRef,
      range: rangeFromTokens(start, end ?? nameTok),
    }

    return form
  }

  /**
   * Form-block field parser. Mirrors `parseResourceProps` but recognizes
   * `visibility: public | internal` as an enum-valued field whose value is a
   * bare identifier rather than a literal accepted by `parseValue()`, and
   * `auth: blockName` as a bareword reference to a top-level `auth` block.
   * Any other key falls through to `parseValue()` exactly like the shared
   * resource parser, so existing form fields are unaffected.
   */
  private parseFormFields(): {
    props: Record<string, unknown>
    schemaBlock?: JsonBlockInfo
    schemaRef?: string
    schemaRefRange?: SourceRange
    visibility?: FormVisibility
    visibilityRange?: SourceRange
    authRef?: FormDecl['authRef']
  } {
    const out: Record<string, unknown> = {}
    let schemaBlock: JsonBlockInfo | undefined
    let schemaRef: string | undefined
    let schemaRefRange: SourceRange | undefined
    let visibility: FormVisibility | undefined
    let visibilityRange: SourceRange | undefined
    let authRef: FormDecl['authRef'] | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (key === 'visibility') {
        // `visibility:` is a key:value pair matching the rest of the form
        // block. The value is a bare identifier — one of `public` or
        // `internal`. Anything else (including a quoted string like
        // `"public"`) is a parser error with the source range of the
        // offending token.
        if (!this.expect('colon')) {
          this.error('Expected `:` after `visibility`', this.peek())
          continue
        }
        const valTok = this.advance()
        if (!valTok || valTok.kind !== 'identifier') {
          this.error(
            'Expected `public` or `internal` after `visibility:`',
            valTok,
          )
          continue
        }
        const value = valTok.value
        if (
          typeof value !== 'string' ||
          (value !== 'public' && value !== 'internal')
        ) {
          this.error(
            `Invalid visibility "${String(value)}"; expected \`public\` or \`internal\``,
            valTok,
          )
          continue
        }
        // Discriminated narrowing: `value` is now `'public' | 'internal'` —
        // no `as` cast required.
        visibility = value
        visibilityRange = { ...valTok.range }
        continue
      }

      if (key === 'auth') {
        // `auth: blockName` references a top-level `auth` block by bare
        // identifier. Mirrors how nodes reference auth (also bareword) and
        // how forms reference named schemas via `schema: name`.
        if (!this.expect('colon')) {
          this.error('Expected `:` after `auth`', this.peek())
          continue
        }
        const valTok = this.advance()
        if (
          !valTok ||
          (valTok.kind !== 'identifier' && valTok.kind !== 'keyword') ||
          typeof valTok.value !== 'string'
        ) {
          this.error(
            'Expected auth block name (bare identifier) after `auth:`',
            valTok,
          )
          continue
        }
        authRef = { name: valTok.value, range: { ...valTok.range } }
        continue
      }

      if (!this.expect('colon')) {
        this.error('Expected :', this.peek())
        break
      }

      if (key === 'schema') {
        const next = this.peek()

        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()!
          let parsed: Record<string, unknown> = {}

          try {
            parsed = JSON.parse(tok.fencedContent ?? '{}') as Record<
              string,
              unknown
            >
          } catch {
            this.error('Invalid JSON in schema block', tok)
          }

          out.schema = parsed

          if (tok.fencedContentRange) {
            schemaBlock = {
              code: tok.fencedContent ?? '',
              innerRange: {
                start: { ...tok.fencedContentRange.start },
                end: { ...tok.fencedContentRange.end },
              },
            }
          }

          continue
        }

        if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          schemaRef = idTok.value as string
          schemaRefRange = { ...idTok.range }
          continue
        }
      }

      const value = this.parseValue()

      if (value !== undefined) {
        out[key] = value
      }
    }

    return {
      props: out,
      schemaBlock,
      schemaRef,
      schemaRefRange,
      visibility,
      visibilityRange,
      authRef,
    }
  }

  private parseWebhook(): WebhookDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'webhook') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected webhook name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    const { props, schemaBlock, schemaRef, schemaRefRange, secretRef, header } =
      this.parseWebhookProps()
    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      label: (props.label as string) ?? '',
      description: props.description as string | undefined,
      docComment,
      enabled: props.enabled as boolean | undefined,
      schema: props.schema as WebhookDecl['schema'],
      schemaBlock,
      schemaRef,
      schemaRefRange,
      secretRef,
      header,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseWebhookProps(): {
    props: Record<string, unknown>
    schemaBlock?: JsonBlockInfo
    schemaRef?: string
    schemaRefRange?: SourceRange
    secretRef?: WebhookDecl['secretRef']
    header?: WebhookDecl['header']
  } {
    const out: Record<string, unknown> = {}
    let schemaBlock: JsonBlockInfo | undefined
    let schemaRef: string | undefined
    let schemaRefRange: SourceRange | undefined
    let secretRef: WebhookDecl['secretRef'] | undefined
    let header: WebhookDecl['header'] | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        this.error('Expected :', this.peek())
        break
      }

      if (key === 'schema') {
        const next = this.peek()

        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()!
          let parsed: Record<string, unknown> = {}

          try {
            parsed = JSON.parse(tok.fencedContent ?? '{}') as Record<
              string,
              unknown
            >
          } catch {
            this.error('Invalid JSON in schema block', tok)
          }

          out.schema = parsed

          if (tok.fencedContentRange) {
            schemaBlock = {
              code: tok.fencedContent ?? '',
              innerRange: {
                start: { ...tok.fencedContentRange.start },
                end: { ...tok.fencedContentRange.end },
              },
            }
          }

          continue
        }

        if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          schemaRef = idTok.value as string
          schemaRefRange = { ...idTok.range }
          continue
        }
      }

      if (key === 'secret') {
        const blockTok = this.peek()

        if (
          blockTok &&
          (blockTok.kind === 'identifier' || blockTok.kind === 'keyword') &&
          typeof blockTok.value === 'string'
        ) {
          this.advance()
          const dot = this.expect('dot')

          if (!dot) {
            this.error('Expected "." after secret block name', this.peek())
            continue
          }

          const varTok = this.advance()

          if (
            varTok &&
            (varTok.kind === 'identifier' || varTok.kind === 'keyword') &&
            typeof varTok.value === 'string'
          ) {
            secretRef = {
              blockName: blockTok.value,
              varName: varTok.value,
              range: {
                start: { ...blockTok.range.start },
                end: { ...varTok.range.end },
              },
            }
          } else {
            this.error(
              'Expected secret var name after "."',
              varTok ?? this.peek(),
            )
          }
        } else {
          this.error(
            'Expected secret block name (e.g. my_secret.VAR)',
            blockTok,
          )
          this.parseValue()
        }

        continue
      }

      if (key === 'header') {
        const valTok = this.peek()

        if (
          valTok &&
          valTok.kind === 'string' &&
          typeof valTok.value === 'string'
        ) {
          this.advance()
          header = {
            value: valTok.value,
            range: { ...valTok.range },
          }
        } else {
          this.error('Expected quoted header name', valTok)
          this.parseValue()
        }

        continue
      }

      const value = this.parseValue()

      if (value !== undefined) {
        out[key] = value
      }
    }

    return {
      props: out,
      schemaBlock,
      schemaRef,
      schemaRefRange,
      secretRef,
      header,
    }
  }

  private parseSchemaDecl(): SchemaDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'schema') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected schema name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    const { props, schemaBlock, schemaRef, schemaRefRange } =
      this.parseResourceProps()
    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      label: (props.label as string) ?? '',
      description: props.description as string | undefined,
      docComment,
      schema: props.schema as SchemaDecl['schema'],
      schemaBlock,
      schemaRef,
      schemaRefRange,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseSchedule(): ScheduleDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'schedule') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected schedule name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    const { props } = this.parseResourceProps() as {
      props: Record<string, unknown> & { cron?: string; timezone?: string }
    }

    const end = this.expect('rbrace') ?? this.peek()
    const cron = props.cron

    if (typeof cron !== 'string') {
      this.error('Schedule must have cron', this.peek())
    }

    return {
      name: nameTok.value as string,
      label: (props.label as string) ?? '',
      description: props.description as string | undefined,
      docComment,
      cron: cron ?? '0 0 * * *',
      timezone: props.timezone as string | undefined,
      enabled: props.enabled as boolean | undefined,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseSecretBlock(): SecretsDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'secret') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected secret block name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    let vars: string[] = []
    let label = ''
    let description: string | undefined
    let secretType: SecretsDecl['type'] | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        this.error('Expected :', this.peek())
        break
      }

      if (key === 'vars') {
        const list = this.parseSecretKeysList()
        if (list) {
          vars = list
        }
      } else if (key === 'label') {
        const v = this.parseValue()
        if (typeof v === 'string') {
          label = v
        }
      } else if (key === 'description') {
        const v = this.parseValue()
        if (typeof v === 'string') {
          description = v
        }
      } else if (key === 'type') {
        const typeTok = this.advance()
        let typeVal: string | undefined
        if (
          typeTok &&
          (typeTok.kind === 'identifier' ||
            typeTok.kind === 'keyword' ||
            typeTok.kind === 'string')
        ) {
          typeVal = typeTok.value as string
        }
        if (typeVal === 'managed') {
          secretType = 'managed'
        } else if (typeVal !== undefined) {
          this.error(
            `Unknown secret type "${typeVal}" (expected managed)`,
            typeTok,
          )
        } else {
          this.error('Expected secret type identifier (managed)', typeTok)
        }
      } else {
        this.parseValue()
      }
    }

    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      label,
      description,
      type: secretType,
      vars,
      docComment,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseAuth(): AuthDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'auth') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected auth block name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    let authType = ''
    let secretsRef: string | undefined
    let secretsRefRange: SourceRange | undefined
    let label = ''
    let description: string | undefined
    const configFields: Record<string, ConfigValue> = {}

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        this.error('Expected :', this.peek())
        break
      }

      if (key === 'label') {
        const v = this.parseValue()
        if (typeof v === 'string') {
          label = v
        }
        continue
      }

      if (key === 'description') {
        const v = this.parseValue()
        if (typeof v === 'string') {
          description = v
        }
        continue
      }

      if (key === 'type') {
        const typeTok = this.advance()

        if (
          typeTok &&
          (typeTok.kind === 'identifier' || typeTok.kind === 'keyword')
        ) {
          authType = typeTok.value as string
        } else if (typeTok && typeTok.kind === 'string') {
          authType = typeTok.value as string
        }

        continue
      }

      if (key === 'secrets') {
        const refTok = this.advance()

        if (
          refTok &&
          (refTok.kind === 'identifier' || refTok.kind === 'keyword')
        ) {
          secretsRef = refTok.value as string
          secretsRefRange = { ...refTok.range }
        }

        continue
      }

      const valueToken = this.peek()
      const value = valueToken ? this.parseConfigValue(valueToken) : undefined

      if (value) {
        this.storeConfigField(configFields, key, value)
      }
    }

    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      label,
      description,
      authType,
      secretsRef,
      secretsRefRange,
      configFields,
      docComment,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseResourceProps(): {
    props: Record<string, unknown>
    schemaBlock?: JsonBlockInfo
    schemaRef?: string
    schemaRefRange?: SourceRange
  } {
    const out: Record<string, unknown> = {}
    let schemaBlock: JsonBlockInfo | undefined
    let schemaRef: string | undefined
    let schemaRefRange: SourceRange | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        this.error('Expected :', this.peek())
        break
      }

      if (key === 'schema') {
        const next = this.peek()

        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()!
          let parsed: Record<string, unknown> = {}

          try {
            parsed = JSON.parse(tok.fencedContent ?? '{}') as Record<
              string,
              unknown
            >
          } catch {
            this.error('Invalid JSON in schema block', tok)
          }

          out.schema = parsed

          if (tok.fencedContentRange) {
            schemaBlock = {
              code: tok.fencedContent ?? '',
              innerRange: {
                start: { ...tok.fencedContentRange.start },
                end: { ...tok.fencedContentRange.end },
              },
            }
          }

          continue
        }

        if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          schemaRef = idTok.value as string
          schemaRefRange = { ...idTok.range }
          continue
        }
      }

      const value = this.parseValue()

      if (value !== undefined) {
        out[key] = value
      }
    }

    return { props: out, schemaBlock, schemaRef, schemaRefRange }
  }

  private parsePropertyKey(): string | null {
    const t = this.advance()

    if (!t) {
      return null
    }

    if (t.kind === 'identifier' || t.kind === 'keyword') {
      return t.value as string
    }

    this.index--
    return null
  }

  private parseValue(): unknown {
    const t = this.peek()

    if (!t) {
      return undefined
    }

    if (t.kind === 'string') {
      this.advance()
      return t.value
    }
    if (t.kind === 'number') {
      this.advance()
      return t.value
    }
    if (t.kind === 'boolean') {
      this.advance()
      return t.value
    }
    if (t.kind === 'lbrace') {
      return this.parseObjectLiteral()
    }
    if (t.kind === 'lbracket') {
      return this.parseArrayLiteral()
    }
    if (t.kind === 'fenced_block') {
      const tok = this.advance()
      return tok?.fencedContent ?? ''
    }
    this.error(
      'Expected value (string, number, boolean, object, array, or @ts / @json / @sql block)',
      t,
    )
    return undefined
  }

  private parseObjectLiteral(): Record<string, unknown> | undefined {
    if (!this.expect('lbrace')) {
      return undefined
    }

    const out: Record<string, unknown> = {}
    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      const keyTok = this.advance()

      const key =
        keyTok?.kind === 'string'
          ? (keyTok.value as string)
          : keyTok?.kind === 'identifier' || keyTok?.kind === 'keyword'
            ? (keyTok.value as string)
            : null

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        break
      }

      const value = this.parseValue()

      if (value !== undefined) {
        out[key] = value
      }

      if (this.peek()?.kind === 'rbrace') {
        break
      }

      if (this.peek()?.kind === 'comma') {
        this.advance()
      }

      if (this.peek()?.kind === 'comma') {
        this.advance()
      }
    }
    this.expect('rbrace')
    return out
  }

  /**
   * Parse a review config object `{ enabled?, title?, description?, content?, schema?, actions?, ... }`.
   * Supports schema as @json { } block (parsed as object); other values via parseValue().
   */
  private parseReviewConfigObject():
    | { config: Record<string, unknown>; schemaRefRange?: SourceRange }
    | undefined {
    if (!this.expect('lbrace')) {
      return undefined
    }

    const out: Record<string, unknown> = {}
    let schemaRefRange: SourceRange | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        break
      }

      if (key === 'schema') {
        const next = this.peek()

        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()

          if (tok) {
            try {
              out.schema = JSON.parse(tok.fencedContent ?? '{}') as Record<
                string,
                unknown
              >
            } catch {
              this.error('Invalid JSON in review schema block', tok)
            }
          }
        } else if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          out.schemaRef = idTok.value as string
          schemaRefRange = { ...idTok.range }
        } else {
          const v = this.parseValue()

          if (
            v !== undefined &&
            typeof v === 'object' &&
            v !== null &&
            !Array.isArray(v)
          ) {
            out.schema = v
          } else if (v === null) {
            out.schema = null
          }
        }

        if (this.peek()?.kind === 'rbrace') {
          break
        }

        if (this.peek()?.kind === 'comma') {
          this.advance()
        }

        continue
      }

      const value = this.parseValue()

      if (value !== undefined) {
        out[key] = value
      }

      if (this.peek()?.kind === 'rbrace') {
        break
      }

      if (this.peek()?.kind === 'comma') {
        this.advance()
      }
    }
    this.expect('rbrace')
    return { config: out, schemaRefRange }
  }

  private parseArrayLiteral(): unknown[] | undefined {
    if (!this.expect('lbracket')) {
      return undefined
    }

    const arr: unknown[] = []
    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbracket') {
        break
      }

      const before = this.index
      const value = this.parseValue()

      if (value !== undefined) {
        arr.push(value)
      }

      if (this.peek()?.kind === 'rbracket') {
        break
      }

      if (this.peek()?.kind === 'comma') {
        this.advance()
        continue
      }

      // Recovery: if parseValue() couldn't consume the token (e.g. a bare
      // identifier that isn't a legal value), advance one token to avoid
      // looping forever.
      if (this.index === before) {
        this.advance()
      }
    }

    this.expect('rbracket')
    return arr
  }

  /**
   * Parse `secrets: [ KEY, "OTHER" ]` — elements must be string literals or identifiers.
   */
  private parseSecretKeysList(): string[] | undefined {
    if (!this.expect('lbracket')) {
      return undefined
    }

    const keys: string[] = []

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbracket') {
        break
      }

      if (t.kind === 'string') {
        this.advance()
        keys.push(t.value as string)
      } else if (t.kind === 'identifier' || t.kind === 'keyword') {
        this.advance()
        keys.push(t.value as string)
      } else {
        this.error('Expected string or identifier in secrets list', t)
        while (!this.eof()) {
          const u = this.peek()
          if (!u || u.kind === 'rbracket') {
            break
          }
          this.advance()
        }
        break
      }

      if (this.peek()?.kind === 'rbracket') {
        break
      }

      if (this.peek()?.kind === 'comma') {
        this.advance()
      }
    }

    this.expect('rbracket')
    return keys
  }

  /**
   * Parse `secrets: { blockName: [ VAR1, VAR2 ], other: [ X ] }`.
   */
  private parseSecretsMap():
    | {
        map: Record<string, string[]>
        blockRanges: { blockName: string; range: SourceRange }[]
      }
    | undefined {
    if (!this.expect('lbrace')) {
      return undefined
    }

    const map: Record<string, string[]> = {}
    const blockRanges: { blockName: string; range: SourceRange }[] = []

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      if (t.kind !== 'identifier' && t.kind !== 'keyword') {
        this.error('Expected secret block name in secrets map', t)
        while (!this.eof()) {
          const u = this.peek()
          if (!u || u.kind === 'rbrace' || u.kind === 'comma') {
            break
          }
          this.advance()
        }
        if (this.peek()?.kind === 'comma') {
          this.advance()
        }
        continue
      }

      const blockName = t.value as string
      const nameRange: SourceRange = { ...t.range }
      this.advance()

      if (!this.expect('colon')) {
        break
      }

      const list = this.parseSecretKeysList()

      if (list !== undefined) {
        map[blockName] = list
        blockRanges.push({ blockName, range: nameRange })
      }

      if (this.peek()?.kind === 'rbrace') {
        break
      }

      if (this.peek()?.kind === 'comma') {
        this.advance()
      }
    }

    this.expect('rbrace')
    return { map, blockRanges }
  }

  private normalizeNodeType(type: string): string {
    return type === 'graph' ? 'workflow' : type
  }

  private normalizeConfigFieldKey(key: string): string {
    return key === 'graph' ? 'workflow' : key
  }

  private storeConfigField(
    configFields: Record<string, ConfigValue>,
    key: string,
    value: ConfigValue,
  ): void {
    configFields[this.normalizeConfigFieldKey(key)] = value
  }

  /**
   * Parses the inner body of `workflow { }` or `subgraph { }`.
   * Subgraphs omit top-level `label` / `description`.
   */
  private parseWorkflowInnerBody(isSubgraph: boolean): {
    nodes: NodeDecl[]
    edges: EdgeDecl[]
    flowRange?: SourceRange
    label: string
    description?: string
    concurrency?: number
    executionTokenTtl?: string
  } {
    const nodes: NodeDecl[] = []
    const edges: EdgeDecl[] = []
    let label = ''
    let description: string | undefined
    let concurrency: number | undefined
    let executionTokenTtl: string | undefined
    let flowRange: SourceRange | undefined

    while (!this.eof()) {
      const t = this.peek()
      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        const next = this.tokens[this.index + 1]

        if (
          next?.kind === 'keyword' &&
          (next.value === 'node' || next.value === 'root')
        ) {
          this.lastBlockComment = t.value as string
        }

        this.advance()
        continue
      }

      if (t.kind === 'keyword' && t.value === 'root') {
        const rootNode = this.parseRoot()

        if (rootNode) {
          nodes.push(rootNode)
        }

        continue
      }

      if (
        t.kind === 'identifier' &&
        (t.value as string) === 'persistence' &&
        this.tokens[this.index + 1]?.kind === 'lbrace'
      ) {
        this.error(
          'persistence { } blocks have been removed — use a top-level stream block instead',
          t,
        )
        this.advance()
        let depth = 0
        while (!this.eof()) {
          const tok = this.advance()
          if (!tok) {
            break
          }
          if (tok.kind === 'lbrace') {
            depth++
          } else if (tok.kind === 'rbrace') {
            depth--
            if (depth === 0) {
              break
            }
          }
        }
        continue
      }

      if (t.kind === 'keyword' && t.value === 'node') {
        const node = this.parseNode()

        if (node) {
          nodes.push(node)
        }

        continue
      }

      if (t.kind === 'keyword' && t.value === 'label') {
        if (isSubgraph) {
          this.error('label is not valid inside subgraph { }', t)
        }
        this.advance()
        this.expect('colon')

        const v = this.parseValue()

        if (typeof v === 'string') {
          label = v
        }

        continue
      }

      if (t.kind === 'keyword' && t.value === 'description') {
        if (isSubgraph) {
          this.error('description is not valid inside subgraph { }', t)
        }
        this.advance()
        this.expect('colon')
        const v = this.parseValue()

        if (typeof v === 'string') {
          description = v
        }

        continue
      }

      if (t.kind === 'keyword' && t.value === 'concurrency') {
        if (isSubgraph) {
          this.error('concurrency is not valid inside subgraph { }', t)
        }
        this.advance()
        this.expect('colon')
        const v = this.parseValue()
        if (typeof v === 'number') {
          concurrency = v
        }
        continue
      }

      if (t.kind === 'keyword' && t.value === 'executionTokenTtl') {
        if (isSubgraph) {
          this.error('executionTokenTtl is not valid inside subgraph { }', t)
        }
        this.advance()
        this.expect('colon')
        const v = this.parseValue()
        if (typeof v === 'string') {
          executionTokenTtl = v
        } else {
          this.error(
            'executionTokenTtl must be a quoted duration like "150m"',
            t,
          )
        }
        continue
      }

      if (t.kind === 'keyword' && t.value === 'flow') {
        const result = this.parseFlowBlock()
        if (result) {
          edges.push(...result.edges)
          flowRange = result.flowRange
        }
        continue
      }

      if (t.kind === 'keyword' && t.value === 'stream') {
        const afterStream = this.tokens[this.index + 1]
        if (afterStream?.kind === 'colon') {
          this.error('"stream:" is only valid inside a node { } block', t)
          this.advance()
          this.expect('colon')
          const vt = this.peek()
          if (vt) {
            this.parseConfigValue(vt)
          }
          continue
        }
      }

      if (t.kind === 'identifier') {
        const arrow = this.tokens[this.index + 1]
        if (arrow?.kind === 'arrow' || arrow?.kind === 'labeled_arrow') {
          this.error('Edge declarations must be inside a flow { } block', t)
          this.advance()
          this.advance()
          this.advance()
          continue
        }
      }

      this.advance()
    }

    return {
      nodes,
      edges,
      flowRange,
      label,
      description,
      concurrency,
      executionTokenTtl,
    }
  }

  private parseWorkflow(): WorkflowDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')
    const startKw = start?.value as string
    if (!start || (startKw !== 'graph' && startKw !== 'workflow')) {
      return null
    }
    const nameTok = this.advance()
    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected workflow name', nameTok)
      this.skipToNextBlock()
      return null
    }
    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }
    const {
      nodes,
      edges,
      flowRange,
      label,
      description,
      concurrency,
      executionTokenTtl,
    } = this.parseWorkflowInnerBody(false)

    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      label: label || (nameTok.value as string),
      description,
      concurrency,
      executionTokenTtl,
      docComment,
      nodes,
      edges,
      flowRange,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseFlowBlock(): {
    edges: EdgeDecl[]
    flowRange: SourceRange
  } | null {
    const flowStart = this.advance()!
    if (!this.expect('lbrace')) {
      this.error('Expected { after flow', this.peek())
      return null
    }
    const flowEdges: EdgeDecl[] = []
    while (!this.eof()) {
      const t = this.peek()
      if (!t || t.kind === 'rbrace') {
        break
      }
      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }
      const isNodeName =
        t.kind === 'identifier' || (t.kind === 'keyword' && t.value === 'root')
      if (isNodeName) {
        const src = t.value as string
        const arrow = this.tokens[this.index + 1]

        if (arrow?.kind === 'arrow') {
          this.advance()
          this.advance()
          const targetTok = this.advance()
          const target =
            targetTok?.kind === 'identifier' ||
            (targetTok?.kind === 'keyword' && targetTok?.value === 'root')
              ? (targetTok.value as string)
              : ''
          if (target) {
            flowEdges.push({
              source: src,
              target,
              range: rangeFromTokens(t, targetTok ?? t),
            })
          }
          continue
        }
        if (arrow?.kind === 'labeled_arrow') {
          this.advance()
          this.advance()
          const targetTok = this.advance()
          const target =
            targetTok?.kind === 'identifier' ||
            (targetTok?.kind === 'keyword' && targetTok?.value === 'root')
              ? (targetTok.value as string)
              : ''
          const edgeLabel =
            typeof arrow.value === 'string' ? arrow.value : undefined
          if (target) {
            flowEdges.push({
              source: src,
              target,
              label: edgeLabel || undefined,
              range: rangeFromTokens(t, targetTok ?? t),
            })
          }
          continue
        }
      }
      this.advance()
    }
    const endTok = this.expect('rbrace') ?? this.peek()
    return {
      edges: flowEdges,
      flowRange: rangeFromTokens(flowStart, endTok ?? flowStart),
    }
  }

  private parseRoot(): NodeDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'root') {
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    const configFields: Record<string, ConfigValue> = {}
    let typeVal = 'code'
    let labelVal = 'root'
    let descriptionVal: string | undefined
    let inputSchema: Record<string, unknown> | undefined
    let outputSchema: Record<string, unknown> | undefined
    let inputSchemaBlock: JsonBlockInfo | undefined
    let outputSchemaBlock: JsonBlockInfo | undefined
    let inputSchemaRef: string | undefined
    let inputSchemaRefRange: SourceRange | undefined
    let outputSchemaRef: string | undefined
    let outputSchemaRefRange: SourceRange | undefined
    let reviewConfig: Record<string, unknown> | undefined
    let reviewSchemaRefRange: SourceRange | undefined
    let outputFormatVal: string | undefined
    let secretsMap: Record<string, string[]> | undefined
    let secretsMapBlockRanges:
      | { blockName: string; range: SourceRange }[]
      | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        break
      }

      if (key === 'type') {
        const typeTok = this.advance()

        if (
          typeTok &&
          (typeTok.kind === 'identifier' || typeTok.kind === 'keyword')
        ) {
          typeVal = this.normalizeNodeType(typeTok.value as string)
        }

        continue
      }

      if (key === 'label') {
        const v = this.parseValue()

        if (typeof v === 'string') {
          labelVal = v
        }

        continue
      }

      if (key === 'description') {
        const v = this.parseValue()

        if (typeof v === 'string') {
          descriptionVal = v
        }

        continue
      }

      if (key === 'format') {
        const fmtTok = this.advance()
        if (
          fmtTok &&
          (fmtTok.kind === 'identifier' || fmtTok.kind === 'keyword')
        ) {
          outputFormatVal = fmtTok.value as string
        }
        continue
      }

      if (key === 'secrets') {
        const next = this.peek()

        if (next?.kind === 'lbrace') {
          const parsedSecrets = this.parseSecretsMap()
          if (parsedSecrets) {
            secretsMap = parsedSecrets.map
            secretsMapBlockRanges = parsedSecrets.blockRanges
          }
        } else {
          this.error('Expected { after secrets:', next)
        }

        continue
      }

      if (key === 'inputSchema') {
        const next = this.peek()

        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()!

          try {
            inputSchema = JSON.parse(tok.fencedContent ?? '{}') as Record<
              string,
              unknown
            >
          } catch {
            this.error('Invalid JSON in inputSchema block', tok)
          }

          if (tok.fencedContentRange) {
            inputSchemaBlock = {
              code: tok.fencedContent ?? '',
              innerRange: {
                start: { ...tok.fencedContentRange.start },
                end: { ...tok.fencedContentRange.end },
              },
            }
          }
        } else if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          inputSchemaRef = idTok.value as string
          inputSchemaRefRange = { ...idTok.range }
        } else {
          const v = this.parseValue()

          if (v && typeof v === 'object' && !Array.isArray(v)) {
            inputSchema = v as Record<string, unknown>
          }
        }

        continue
      }
      if (key === 'outputSchema') {
        const next = this.peek()
        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()!

          try {
            outputSchema = JSON.parse(tok.fencedContent ?? '{}') as Record<
              string,
              unknown
            >
          } catch {
            this.error('Invalid JSON in outputSchema block', tok)
          }

          if (tok.fencedContentRange) {
            outputSchemaBlock = {
              code: tok.fencedContent ?? '',
              innerRange: {
                start: { ...tok.fencedContentRange.start },
                end: { ...tok.fencedContentRange.end },
              },
            }
          }
        } else if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          outputSchemaRef = idTok.value as string
          outputSchemaRefRange = { ...idTok.range }
        } else {
          const v = this.parseValue()

          if (v && typeof v === 'object' && !Array.isArray(v)) {
            outputSchema = v as Record<string, unknown>
          }
        }
        continue
      }
      if (key === 'review') {
        const next = this.peek()
        if (next?.kind === 'boolean' && next.value === true) {
          this.advance()
          reviewConfig = { enabled: true }
        } else if (next?.kind === 'lbrace') {
          const parsedReview = this.parseReviewConfigObject()
          if (parsedReview) {
            const obj = parsedReview.config
            reviewConfig = {
              ...obj,
              enabled: obj.enabled !== undefined ? obj.enabled : true,
            }
            reviewSchemaRefRange = parsedReview.schemaRefRange
          }
        } else {
          const v = this.parseValue()
          if (v === true) {
            reviewConfig = { enabled: true }
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            const obj = v as Record<string, unknown>
            reviewConfig = {
              ...obj,
              enabled: obj.enabled !== undefined ? obj.enabled : true,
            }
          }
        }

        continue
      }

      const valueToken = this.peek()
      const value = valueToken ? this.parseConfigValue(valueToken) : undefined

      if (value) {
        this.storeConfigField(configFields, key, value)
      }
    }

    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: 'root',
      type: typeVal,
      label: labelVal,
      description: descriptionVal,
      docComment,
      isRoot: true,
      configFields,
      inputSchema,
      outputSchema,
      inputSchemaBlock,
      outputSchemaBlock,
      inputSchemaRef,
      inputSchemaRefRange,
      outputSchemaRef,
      outputSchemaRefRange,
      reviewConfig,
      reviewSchemaRefRange,
      secretsMap,
      secretsMapBlockRanges,
      outputFormat: outputFormatVal,
      range: rangeFromTokens(start, end ?? start),
    }
  }

  private parseNode(): NodeDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'node') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected node name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    const configFields: Record<string, ConfigValue> = {}
    let typeVal = 'code'
    let labelVal = nameTok.value as string
    let descriptionVal: string | undefined
    let inputSchema: Record<string, unknown> | undefined
    let outputSchema: Record<string, unknown> | undefined
    let inputSchemaBlock: JsonBlockInfo | undefined
    let outputSchemaBlock: JsonBlockInfo | undefined
    let outputSchemaRef: string | undefined
    let outputSchemaRefRange: SourceRange | undefined
    let reviewConfig: Record<string, unknown> | undefined
    let reviewSchemaRefRange: SourceRange | undefined
    let outputFormatVal: string | undefined
    let secretsMap: Record<string, string[]> | undefined
    let secretsMapBlockRanges:
      | { blockName: string; range: SourceRange }[]
      | undefined
    let subgraph:
      | {
          nodes: NodeDecl[]
          edges: EdgeDecl[]
          flowRange?: SourceRange
          range: SourceRange
        }
      | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      const key = this.parsePropertyKey()

      if (!key) {
        break
      }

      /** `subgraph { ... }` has no colon (unlike other node properties). */
      if (key === 'subgraph') {
        const subKw = this.tokens[this.index - 1]
        if (!this.expect('lbrace')) {
          this.error('Expected { after subgraph', this.peek())
          this.skipToNextBlock()
          return null
        }
        const inner = this.parseWorkflowInnerBody(true)
        const endSg = this.expect('rbrace') ?? this.peek()
        subgraph = {
          nodes: inner.nodes,
          edges: inner.edges,
          flowRange: inner.flowRange,
          range: rangeFromTokens(subKw ?? start, endSg ?? start),
        }
        continue
      }

      if (!this.expect('colon')) {
        break
      }

      if (key === 'type') {
        const typeTok = this.advance()

        if (
          typeTok &&
          (typeTok.kind === 'identifier' || typeTok.kind === 'keyword')
        ) {
          typeVal = this.normalizeNodeType(typeTok.value as string)
        }

        continue
      }

      if (key === 'label') {
        const v = this.parseValue()

        if (typeof v === 'string') {
          labelVal = v
        }

        continue
      }

      if (key === 'description') {
        const v = this.parseValue()

        if (typeof v === 'string') {
          descriptionVal = v
        }

        continue
      }

      if (key === 'format') {
        const fmtTok = this.advance()
        if (
          fmtTok &&
          (fmtTok.kind === 'identifier' || fmtTok.kind === 'keyword')
        ) {
          outputFormatVal = fmtTok.value as string
        }
        continue
      }

      if (key === 'secrets') {
        const next = this.peek()

        if (next?.kind === 'lbrace') {
          const parsedSecrets = this.parseSecretsMap()
          if (parsedSecrets) {
            secretsMap = parsedSecrets.map
            secretsMapBlockRanges = parsedSecrets.blockRanges
          }
        } else {
          this.error('Expected { after secrets:', next)
        }

        continue
      }

      const keyToken = this.tokens[this.index - 1] ?? this.peek()

      if (key === 'inputSchema') {
        this.error(
          'inputSchema is only allowed in root { } blocks',
          keyToken ?? this.peek()!,
        )
        this.skipToNextBlock()
        return null
      }
      if (key === 'outputSchema') {
        this.error(
          'Use "schema" instead of "outputSchema" in node blocks',
          keyToken ?? this.peek()!,
        )
        this.skipToNextBlock()
        return null
      }
      if (key === 'schema') {
        const next = this.peek()
        if (next?.kind === 'fenced_block' && next.fencedLang === 'json') {
          const tok = this.advance()!

          try {
            outputSchema = JSON.parse(tok.fencedContent ?? '{}') as Record<
              string,
              unknown
            >
          } catch {
            this.error('Invalid JSON in schema block', tok)
          }

          if (tok.fencedContentRange) {
            outputSchemaBlock = {
              code: tok.fencedContent ?? '',
              innerRange: {
                start: { ...tok.fencedContentRange.start },
                end: { ...tok.fencedContentRange.end },
              },
            }
          }
        } else if (next?.kind === 'identifier') {
          const idTok = this.advance()!
          outputSchemaRef = idTok.value as string
          outputSchemaRefRange = { ...idTok.range }
        } else {
          const v = this.parseValue()

          if (v && typeof v === 'object' && !Array.isArray(v)) {
            outputSchema = v as Record<string, unknown>
          }
        }
        continue
      }
      if (key === 'review') {
        const next = this.peek()
        if (next?.kind === 'boolean' && next.value === true) {
          this.advance()
          reviewConfig = { enabled: true }
        } else if (next?.kind === 'lbrace') {
          const parsedReview = this.parseReviewConfigObject()
          if (parsedReview) {
            const obj = parsedReview.config
            reviewConfig = {
              ...obj,
              enabled: obj.enabled !== undefined ? obj.enabled : true,
            }
            reviewSchemaRefRange = parsedReview.schemaRefRange
          }
        } else {
          const v = this.parseValue()
          if (v === true) {
            reviewConfig = { enabled: true }
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            const obj = v as Record<string, unknown>
            reviewConfig = {
              ...obj,
              enabled: obj.enabled !== undefined ? obj.enabled : true,
            }
          }
        }

        continue
      }

      const valueToken = this.peek()
      const value = valueToken ? this.parseConfigValue(valueToken) : undefined

      if (value) {
        this.storeConfigField(configFields, key, value)
      }
    }

    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      type: typeVal,
      label: labelVal,
      description: descriptionVal,
      docComment,
      configFields,
      inputSchema,
      outputSchema,
      inputSchemaBlock,
      outputSchemaBlock,
      outputSchemaRef,
      outputSchemaRefRange,
      reviewConfig,
      reviewSchemaRefRange,
      secretsMap,
      secretsMapBlockRanges,
      outputFormat: outputFormatVal,
      subgraph,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }

  private parseConfigValue(prevToken: Token): ConfigValue | undefined {
    const t = prevToken

    if (t.kind === 'string') {
      this.advance()
      return { kind: 'string', value: t.value as string, range: t.range }
    }

    if (t.kind === 'number') {
      this.advance()
      return { kind: 'number', value: t.value as number, range: t.range }
    }

    if (t.kind === 'boolean') {
      this.advance()
      return { kind: 'boolean', value: t.value as boolean, range: t.range }
    }

    if (t.kind === 'identifier' && t.value === 'null') {
      this.advance()
      return { kind: 'null', value: null, range: t.range }
    }

    if (t.kind === 'identifier' || t.kind === 'keyword') {
      this.advance()
      return { kind: 'string', value: t.value as string, range: t.range }
    }

    if (t.kind === 'lbrace') {
      const start = t
      const obj = this.parseConfigObject()

      if (obj) {
        return {
          kind: 'object',
          value: obj,
          range: rangeFromTokens(start, this.peek() ?? start),
        }
      }

      return undefined
    }

    if (t.kind === 'lbracket') {
      const start = t
      const arr = this.parseConfigArray()

      if (arr) {
        return {
          kind: 'array',
          value: arr,
          range: rangeFromTokens(start, this.peek() ?? start),
        }
      }

      return undefined
    }

    if (t.kind === 'ts_path_ref') {
      const tok = this.advance()!

      return {
        kind: 'ts_file_ref',
        path: tok.value as string,
        range: tok.range,
        pathRange: tok.pathInnerRange ?? tok.range,
      }
    }

    // Script blocks belong to an `operation`. They are not a node config
    // value, so nothing here turns one into code that would be evaluated.
    if (
      t.kind === 'fenced_block' &&
      t.fencedLang !== 'json' &&
      t.fencedLang !== 'ps' &&
      t.fencedLang !== 'sh'
    ) {
      const tok = this.advance()

      if (tok && tok.kind === 'fenced_block') {
        const kind = tok.fencedLang === 'sql' ? 'sql_block' : 'ts_block'
        return {
          kind,
          code: tok.fencedContent ?? '',
          range: tok.range,
          innerRange: tok.fencedContentRange ?? tok.range,
        }
      }
    }
    return undefined
  }

  private parseConfigObject(): Record<string, ConfigValue> | undefined {
    if (!this.expect('lbrace')) {
      return undefined
    }

    const out: Record<string, ConfigValue> = {}

    while (!this.eof()) {
      const t = this.peek()
      if (!t || t.kind === 'rbrace') {
        break
      }

      const key = this.parsePropertyKey()
      if (!key) {
        break
      }

      if (!this.expect('colon')) {
        break
      }

      const value = this.parseConfigValue(this.peek()!)
      if (value) {
        out[key] = value
      }

      this.expect('comma')
    }
    this.expect('rbrace')
    return out
  }

  private parseConfigArray(): ConfigValue[] | undefined {
    if (!this.expect('lbracket')) {
      return undefined
    }

    const arr: ConfigValue[] = []

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbracket') {
        break
      }

      const value = this.parseConfigValue(t)
      if (value) {
        arr.push(value)
      }

      this.expect('comma')
    }

    this.expect('rbracket')
    return arr
  }

  private parseTrigger(): TriggerDecl | null {
    const docComment = this.lastBlockComment
    this.lastBlockComment = undefined
    const start = this.expect('keyword')

    if (!start || (start.value as string) !== 'trigger') {
      return null
    }

    const nameTok = this.advance()

    if (!nameTok || nameTok.kind !== 'identifier') {
      this.error('Expected trigger name', nameTok)
      this.skipToNextBlock()
      return null
    }

    if (!this.expect('lbrace')) {
      this.error('Expected {', this.peek())
      this.skipToNextBlock()
      return null
    }

    let resourceType: TriggerDecl['resourceType'] = 'form'
    let resourceName = ''
    let workflowName = ''
    let enabled: boolean | undefined

    while (!this.eof()) {
      const t = this.peek()

      if (!t || t.kind === 'rbrace') {
        break
      }

      if (t.kind === 'block_comment') {
        this.advance()
        continue
      }

      if (t.kind === 'keyword' && t.value === 'enabled') {
        this.advance()
        this.expect('colon')
        const v = this.parseValue()

        if (typeof v === 'boolean') {
          enabled = v
        }

        continue
      }

      if (
        t.kind === 'identifier' ||
        (t.kind === 'keyword' &&
          ['form', 'webhook', 'schedule'].includes(t.value as string))
      ) {
        const first = t.value as string
        const colon = this.tokens[this.index + 1]

        if (colon?.kind === 'colon') {
          this.advance()
          this.advance()

          const resNameTok = this.advance()
          const arrow = this.expect('arrow')
          const workflowTok = this.advance()

          if (
            ['form', 'webhook', 'schedule'].includes(first) &&
            resNameTok?.kind === 'identifier' &&
            arrow &&
            workflowTok?.kind === 'identifier'
          ) {
            resourceType = first as TriggerDecl['resourceType']
            resourceName = resNameTok.value as string
            workflowName = workflowTok.value as string
          }

          continue
        }
      }

      this.advance()
    }

    const end = this.expect('rbrace') ?? this.peek()

    return {
      name: nameTok.value as string,
      resourceType,
      resourceName,
      workflowName,
      docComment,
      enabled,
      range: rangeFromTokens(start, end ?? nameTok),
    }
  }
}

export function parse(source: string): ParseResult {
  return new Parser(source).parse()
}
