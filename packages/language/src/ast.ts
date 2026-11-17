/**
 * AST types for the .swirls DSL. All nodes carry source ranges for LSP diagnostics and navigation.
 */

import type { ActionDecl } from './action/ast'
import type { AgentDecl } from './agent/ast'
import type { AppDecl } from './app/ast'
import type { ChannelDecl } from './channel/ast'
import type { ComputerDecl } from './computer/ast'
import type { ConnectionDecl } from './connection/ast'
import type { ConnectorDecl } from './connector/ast'
import type { DatabaseDecl, MigrationDecl } from './database/ast'
import type { DiskDecl } from './disk/ast'
import type { McpDecl } from './mcp/ast'
import type { MockDecl } from './mock/ast'
import type { NetworkDecl } from './network/ast'
import type { OperationDecl } from './operation/ast'
import type { PlaybookDecl } from './playbook/ast'
import type { PostgresDecl } from './postgres/ast'
import type { QueryDecl } from './query/ast'
import type { PolicyDecl, RoleDecl } from './rbac/ast'
import type { SkillDecl } from './skill/ast'
import type { StreamDecl, StreamVersionDecl } from './stream/ast'
import type {
  ViewComputedColumnDecl,
  ViewDecl,
  ViewStreamRef,
} from './view/ast'

export type {
  AgentContextDecl,
  AgentDecl,
  AgentProfileDecl,
  AgentSandboxDecl,
  AgentWalletDecl,
} from './agent/ast'
export type { ComputerDecl, ComputerHarnessDecl } from './computer/ast'
export type { ConnectorDecl } from './connector/ast'
export type {
  DatabaseDecl,
  MigrationDecl,
  PrismaBlockInfo,
} from './database/ast'
export type { DiskDecl } from './disk/ast'
export type { McpAuthMode, McpDecl } from './mcp/ast'
export type {
  NetworkDatabaseExposureDecl,
  NetworkDecl,
  NetworkExposeDecl,
  NetworkNamedExposureRef,
} from './network/ast'
export type { OperationCommandDecl, OperationDecl } from './operation/ast'
export type {
  PostgresDecl,
  PostgresTableDecl,
  SqlBlock,
  TsBlock,
} from './postgres/ast'
export type {
  ClaimCondition,
  PolicyDecl,
  PolicyGrant,
  RoleDecl,
} from './rbac/ast'
export type { SkillDecl } from './skill/ast'

export type { StreamDecl, StreamVersionDecl }
export type { ViewComputedColumnDecl, ViewDecl, ViewStreamRef }

export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export interface SourceRange {
  start: SourcePosition
  end: SourcePosition
}

/** JSON Schema–like object literal (type, properties, required, items, etc.). */
export type JsonSchemaLiteral = Record<string, unknown>

/** Info for a schema defined via @json { } block (for LSP forwarding). */
export interface JsonBlockInfo {
  code: string
  innerRange: SourceRange
}

/** Review config literal (enabled, title, description, actions, etc.). */
export type ReviewConfigLiteral = Record<string, unknown>

export type ConfigValue =
  | { kind: 'null'; value: null; range: SourceRange }
  | { kind: 'string'; value: string; range: SourceRange }
  | { kind: 'number'; value: number; range: SourceRange }
  | { kind: 'boolean'; value: boolean; range: SourceRange }
  | { kind: 'object'; value: Record<string, ConfigValue>; range: SourceRange }
  | { kind: 'array'; value: ConfigValue[]; range: SourceRange }
  | {
      kind: 'ts_block'
      code: string
      range: SourceRange
      innerRange: SourceRange
    }
  | {
      kind: 'sql_block'
      code: string
      range: SourceRange
      innerRange: SourceRange
    }
  | {
      kind: 'ts_file_ref'
      path: string
      range: SourceRange
      /** Range of the path characters inside the quotes (for go-to-definition). */
      pathRange: SourceRange
    }

/** Top-level reusable JSON Schema (`schema name { label, description, schema: ... }`). */
export interface SchemaDecl {
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  /** Inline JSON Schema literal (when not using `schemaRef`). */
  schema?: JsonSchemaLiteral
  /** Set when schema was defined via @json { } block (for LSP). */
  schemaBlock?: JsonBlockInfo
  /** Body used `schema: other_name` instead of inline JSON. */
  schemaRef?: string
  schemaRefRange?: SourceRange
  range: SourceRange
}

/**
 * Whether a `form` block is publicly addressable through Triggers.
 *
 * - `public`: served by Triggers at `/triggers/forms/:projectId/:formName`.
 * - `internal`: not served by Triggers. The web/cloud dashboard can still
 *   read/edit the form, but Triggers refuses to render or accept submissions
 *   (returns 404 with the same body as form-not-found, no existence leak).
 *
 * The AST field is required: parsers default to `'internal'` when the keyword
 * is absent so that no code past the parser ever has to handle `undefined`.
 */
export type FormVisibility = 'public' | 'internal'

export interface FormDecl {
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  enabled?: boolean
  schema?: JsonSchemaLiteral
  /** Set when schema was defined via @json { } block (for LSP). */
  schemaBlock?: JsonBlockInfo
  /** `schema: some_name` reference to a top-level `schema` block. */
  schemaRef?: string
  schemaRefRange?: SourceRange
  /**
   * Triggers exposure for this form. Required at the AST layer; the parser
   * fills `'internal'` (the secure default) when no `visibility` keyword is
   * present in the source.
   */
  visibility: FormVisibility
  /** Source range of the visibility value token (for LSP); absent when defaulted. */
  visibilityRange?: SourceRange
  /**
   * Optional HTTP Basic auth gate enforced by the Triggers service. References
   * a top-level `auth` block by name (DSL: `auth: portal`). The referenced
   * block must have `type: basic` and supply `username` / `password` vars from
   * a secret block; the Triggers form GET and POST handlers require an
   * `Authorization: Basic` header whose decoded `user:pass` matches the
   * decrypted secret values, returning 401 with
   * `WWW-Authenticate: Basic realm="<label>"` on miss. Visibility is enforced
   * first, so `auth:` is dead config on internal forms (which 404 before any
   * auth check runs).
   */
  authRef?: { name: string; range: SourceRange }
  range: SourceRange
}

export interface WebhookDecl {
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  enabled?: boolean
  schema?: JsonSchemaLiteral
  /** Set when schema was defined via @json { } block (for LSP). */
  schemaBlock?: JsonBlockInfo
  /** `schema: some_name` reference to a top-level `schema` block. */
  schemaRef?: string
  schemaRefRange?: SourceRange
  /** `secret: blockName.VAR` cross-reference to a project secret block var. */
  secretRef?: { blockName: string; varName: string; range: SourceRange }
  /** `header: "Name"` inbound HTTP header carrying the shared secret value. */
  header?: { value: string; range: SourceRange }
  range: SourceRange
}

export type { ActionDecl } from './action/ast'

export type {
  AppBrand,
  AppBrandTokenEntry,
  AppBrandTokenMap,
  AppBrandTokens,
  AppDecl,
  AppNav,
  AppNavEntry,
  AppNavSection,
  AppOpenUiBlock,
  AppPage,
  AppReservedField,
  AppReservedFieldName,
  AppShell,
  AppShellPreset,
  AppShellRegion,
} from './app/ast'
export { APP_SHELL_PRESETS, isAppShellPreset } from './app/ast'

export type {
  ChannelDecl,
  ChannelMode,
  ChannelPlatform,
} from './channel/ast'
export type { ConnectionDecl, ConnectionProvider } from './connection/ast'
export type { QueryDecl } from './query/ast'

export interface ScheduleDecl {
  id?: string
  name: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  cron: string
  timezone?: string
  enabled?: boolean
  range: SourceRange
}

export interface NodeDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  type: string
  label: string
  description?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  /** True when this node was defined with root { } syntax. */
  isRoot?: boolean
  configFields: Record<string, ConfigValue>
  inputSchema?: JsonSchemaLiteral
  outputSchema?: JsonSchemaLiteral
  /** Set when inputSchema was defined via @json { } block (for LSP). */
  inputSchemaBlock?: JsonBlockInfo
  /** Set when outputSchema was defined via @json { } block (for LSP). */
  outputSchemaBlock?: JsonBlockInfo
  /** `inputSchema: some_name` reference to a top-level `schema` block. */
  inputSchemaRef?: string
  inputSchemaRefRange?: SourceRange
  /** `schema:` / `outputSchema:` reference to a top-level `schema` block (node output schema). */
  outputSchemaRef?: string
  outputSchemaRefRange?: SourceRange
  reviewConfig?: ReviewConfigLiteral
  /**
   * Declared secret block → var subsets exposed as `context.secrets.<block>.<var>`
   * (DSL: `secrets: { blockName: [VAR1, VAR2] }`).
   */
  secretsMap?: Record<string, string[]>
  /**
   * Source range of each secret block name key in `secrets: { blockName: [...] }` (for LSP).
   */
  secretsMapBlockRanges?: { blockName: string; range: SourceRange }[]
  /** Range of the standalone schema name in `review: { schema: name }` (for LSP). */
  reviewSchemaRefRange?: SourceRange
  /** Presentation format for leaf outputs (`format: markdown`, etc.). */
  outputFormat?: string
  /**
   * Inline subgraph for `map` / `while` nodes: same structure as a graph body
   * (root, node, flow) without the outer `graph name { label }` wrapper.
   */
  subgraph?: {
    nodes: NodeDecl[]
    edges: EdgeDecl[]
    flowRange?: SourceRange
    range: SourceRange
  }
  range: SourceRange
}

export interface EdgeDecl {
  source: string
  target: string
  /** When set (deploy bundle), edge endpoints are these UUIDs instead of `source`/`target` names. */
  sourceNodeId?: string
  targetNodeId?: string
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  label?: string
  range: SourceRange
}

export interface WorkflowDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label: string
  description?: string
  concurrency?: number
  /** Lifetime of the execution authorization token (`executionTokenTtl:`). */
  executionTokenTtl?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  nodes: NodeDecl[]
  edges: EdgeDecl[]
  /** Source range of the flow { ... } block when present (for LSP). */
  flowRange?: SourceRange
  range: SourceRange
}

export type TriggerType = 'form' | 'webhook' | 'schedule'

export interface TriggerDecl {
  id?: string
  name: string
  resourceType: TriggerType
  resourceName: string
  workflowName: string
  /** Resolved UUIDs for deploy payloads; not produced by the parser. */
  resourceId?: string
  workflowId?: string
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  enabled?: boolean
  range: SourceRange
}

/** Valid auth block `type` values (DSL: `auth name { type: oauth | ... }`). */
export type AuthType = 'oauth' | 'api_key' | 'basic' | 'bearer'

/** DSL `secret` block `type:` — `managed` means platform supplies values (enterprise). */
export type SecretBlockType = 'managed'

/** Top-level named group of secret key identifiers (`secret name { vars: [KEY, ...] }`). */
export interface SecretsDecl {
  name: string
  label: string
  description?: string
  /**
   * When `managed`, values come from the platform (Enterprise `platform_keys`);
   * omit for user-provided vault values.
   */
  type?: SecretBlockType
  vars: string[]
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  range: SourceRange
}

/** Top-level auth configuration referencing a `secret` block (`auth name { type: ..., secrets: blockName, ... }`). */
export interface AuthDecl {
  name: string
  label: string
  description?: string
  authType: string
  /** Reference to a top-level `secret` block name. */
  secretsRef?: string
  /** Range of the secret block identifier after `secrets:` (for LSP navigation). */
  secretsRefRange?: SourceRange
  configFields: Record<string, ConfigValue>
  /** Doc comment (block-comment style) immediately above this declaration; shown on hover. */
  docComment?: string
  range: SourceRange
}

export interface SwirlsFile {
  decisions?: import('./decision').DecisionDecl[]
  version?: number
  schemas: SchemaDecl[]
  forms: FormDecl[]
  webhooks: WebhookDecl[]
  schedules: ScheduleDecl[]
  workflows: WorkflowDecl[]
  streams: StreamDecl[]
  /** Spreadsheet-like stream compositions (`view name { streams, columns, computed }`). */
  views: ViewDecl[]
  triggers: TriggerDecl[]
  secrets: SecretsDecl[]
  auths: AuthDecl[]
  postgres: PostgresDecl[]
  /** Swirls-managed Postgres databases declared with an `@prisma` schema island. */
  databases: DatabaseDecl[]
  /** Data-migration transforms run in order against a managed `database`. */
  migrations: MigrationDecl[]
  disk: DiskDecl[]
  /** Named Linux guest (`computer name { software, disks, resources }`). */
  computer: ComputerDecl[]
  /** Script that runs on an enrolled device (`operation name { command }`). */
  operations: OperationDecl[]
  /** Top-level knowledge skill declarations (`skill name { name: "…" }`). */
  skill: SkillDecl[]
  /** Top-level autonomous agent definitions (`agent name { … }`). */
  agent: AgentDecl[]
  /** Top-level MCP server slots (`mcp name { label, description }`). */
  mcp: McpDecl[]
  /** Project-scoped private connectivity requirements and ingress allowlists. */
  networks?: NetworkDecl[]
  /** Top-level chat platform bindings (`channel name { … }`). */
  channels: ChannelDecl[]
  /** Read-only SQL queries against managed databases (`query name { … }`). */
  queries: QueryDecl[]
  /** Top-level outbound OAuth connection slots (`connection name { provider: … }`). */
  connections: ConnectionDecl[]
  /** Top-level inbound OAuth application slots (`connector name { label, description }`). */
  connector: ConnectorDecl[]
  /** Top-level integration actions (`action name { provider, method, path, … }`). */
  actions: ActionDecl[]
  /** Identity-scoped access roles (`role name { match { … } }`). */
  roles: RoleDecl[]
  /** Role-to-resource grants (`policy { allow <role> -> agent … }`). A policy
   * with grants opts the deployment into deny-by-default enforcement. */
  policies: PolicyDecl[]
  /** Bespoke OpenUI-backed interfaces (`app name { shell, nav, page … }`). */
  apps: AppDecl[]
  /** Side-effect stubs for playbook runs (`mock name { … }`). */
  mocks: MockDecl[]
  /** Hosted test suites (`playbook name { case / eval … }`). */
  playbooks: PlaybookDecl[]
}

export interface Diagnostic {
  message: string
  range: SourceRange
  severity?: 'error' | 'warning'
}
