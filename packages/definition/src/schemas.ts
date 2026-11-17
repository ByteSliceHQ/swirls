import { decisionNodeConfigSchema } from './decision'
import { deviceSelectorSchema } from './device'

export { decisionNodeConfigSchema } from './decision'

import type { JSONSchema7, JSONSchema7Type, JSONSchema7TypeName } from 'json-schema'
import { z } from 'zod'

export const positionSchema = z.object({ x: z.number(), y: z.number() })

export const jsonSchemaSchema: z.ZodType<JSONSchema7, JSONSchema7> = z.lazy(() =>
  z.object({
    $schema: z.string().optional(),
    $id: z.string().optional(),
    $ref: z.string().optional(),
    $defs: z.record(z.string(), jsonSchemaSchema).optional(),
    type: z
      .union([z.custom<JSONSchema7TypeName>(), z.array(z.custom<JSONSchema7TypeName>())])
      .optional(),
    properties: z.record(z.string(), jsonSchemaSchema).optional(),
    required: z.array(z.string()).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    default: z.custom<JSONSchema7Type>().optional(),
    examples: z.array(z.custom<JSONSchema7Type>()).optional(),
    items: z.union([jsonSchemaSchema, z.array(jsonSchemaSchema)]).optional(),
    additionalProperties: z.union([z.boolean(), jsonSchemaSchema]).optional(),
    patternProperties: z.record(z.string(), jsonSchemaSchema).optional(),
    // General validations
    enum: z.array(z.custom<JSONSchema7Type>()).optional(),
    const: z.custom<JSONSchema7Type>().optional(),
    // Number validations
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    // String validations
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    /** RFC draft: hint for string encoding (e.g. text/markdown for markdown projection). */
    contentMediaType: z.string().optional(),
    // Array validations
    minItems: z.number().optional(),
    maxItems: z.number().optional(),
    uniqueItems: z.boolean().optional(),
    // Composition
    allOf: z.array(jsonSchemaSchema).optional(),
    anyOf: z.array(jsonSchemaSchema).optional(),
    oneOf: z.array(jsonSchemaSchema).optional(),
    not: jsonSchemaSchema.optional(),
    if: jsonSchemaSchema.optional(),
    else: jsonSchemaSchema.optional(),
    // oxlint-disable-next-line unicorn/no-thenable -- `then` is a JSON Schema keyword
    then: jsonSchemaSchema.optional(),
  }),
)

export const nodeTypeMap = {
  ai: 'ai',
  decision: 'decision',
  code: 'code',
  email: 'email',
  workflow: 'workflow',
  http: 'http',
  integration: 'integration',
  postgres: 'postgres',
  database: 'database',
  scrape: 'scrape',
  search: 'search',
  parallel: 'parallel',
  disk: 'disk',
  shell: 'shell',
  device: 'device',
  stream: 'stream',
  switch: 'switch',
  wait: 'wait',
  map: 'map',
  fanout: 'fanout',
  while: 'while',
  agent: 'agent',
} as const

export const nodeTypeSchema = z
  .union([z.enum(Object.values(nodeTypeMap)), z.literal('graph')])
  .transform((v) => (v === 'graph' ? nodeTypeMap.workflow : v))

/** Declared presentation format for node outputs (DSL `format:`). */
export const outputFormatSchema = z.enum([
  'markdown',
  'html',
  'text',
  'image',
  'video',
  'audio',
  'mixed',
  'json',
])

export type OutputFormat = z.infer<typeof outputFormatSchema>

/** How an executable config string was authored in the DSL (plain literal vs @ts/@sql). */
export const configValueKindSchema = z.enum(['literal', 'ts', 'sql'])

export type ConfigValueKind = z.infer<typeof configValueKindSchema>

export type Content =
  | { kind: 'text'; text: string; data?: unknown }
  | { kind: 'markdown'; markdown: string; data?: unknown }
  | { kind: 'html'; html: string; data?: unknown }
  | {
      kind: 'image'
      url: string
      mime?: string
      alt?: string
      data?: unknown
    }
  | {
      kind: 'video'
      url: string
      mime?: string
      poster?: string
      data?: unknown
    }
  | { kind: 'audio'; url: string; mime?: string; data?: unknown }
  | { kind: 'json'; value: unknown }
  | { kind: 'mixed'; parts: Content[] }

export const contentSchema: z.ZodType<Content> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal('text'),
      text: z.string(),
      data: z.unknown().optional(),
    }),
    z.object({
      kind: z.literal('markdown'),
      markdown: z.string(),
      data: z.unknown().optional(),
    }),
    z.object({
      kind: z.literal('html'),
      html: z.string(),
      data: z.unknown().optional(),
    }),
    z.object({
      kind: z.literal('image'),
      url: z.string(),
      mime: z.string().optional(),
      alt: z.string().optional(),
      data: z.unknown().optional(),
    }),
    z.object({
      kind: z.literal('video'),
      url: z.string(),
      mime: z.string().optional(),
      poster: z.string().optional(),
      data: z.unknown().optional(),
    }),
    z.object({
      kind: z.literal('audio'),
      url: z.string(),
      mime: z.string().optional(),
      data: z.unknown().optional(),
    }),
    z.object({
      kind: z.literal('json'),
      value: z.unknown(),
    }),
    z.object({
      kind: z.literal('mixed'),
      parts: z.array(contentSchema),
    }),
  ]),
)

/** True when value matches the persisted Content envelope shape (recursive). */
export function isContentEnvelope(value: unknown): value is Content {
  const parsed = contentSchema.safeParse(value)
  return parsed.success
}

/** AI node kind: text (plain), object (structured output), image, video, embed. */
export const aiKindSchema = z.enum(['text', 'object', 'image', 'video', 'embed'])

export const aiProviderSchema = z.enum(['openrouter', 'anthropic', 'openai', 'google'])

/** Kind-specific options only (image: n, size, aspectRatio; others: none for now). */
export const aiImageOptionsSchema = z.object({
  n: z.number().optional(),
  size: z.string().optional(),
  aspectRatio: z.string().optional(),
})

export const aiNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.ai),
  kind: aiKindSchema,
  /** Which upstream API to call for this node (defaults to openrouter). */
  provider: aiProviderSchema.optional(),
  /** Shared across kinds; at root. */
  model: z.string().optional(),
  prompt: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  /** Kind-specific options only (e.g. image: n, size, aspectRatio). */
  options: z.record(z.string(), z.unknown()).optional(),
})

export const codeNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.code),
  code: z.string().optional(),
})

export const httpNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.http),
  url: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  headers: z.string().optional(),
  body: z.string().optional(),
  /** Private connectivity realm selected by the authoring declaration. */
  network: z.string().optional(),
})

export const integrationNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.integration),
  connection: z.string().optional(),
  action: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  path: z.string().optional(),
  params: z.string().optional(),
  encoding: z.enum(['json', 'form', 'query', 'raw']).optional(),
  /** Resolved at deploy from the referenced action block's input schema. */
  actionInputSchema: jsonSchemaSchema.optional(),
  /** Resolved at deploy from the referenced action block's output schema. */
  actionOutputSchema: jsonSchemaSchema.optional(),
  /** Resolved at deploy from the referenced action block's GraphQL document. */
  actionGraphqlDocument: z.string().optional(),
})

export const streamNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.stream),
  /** Stream block name in the same .swirls file. */
  stream: z.string(),
  /** Persisted-schema version pin (reads versioned stream table). */
  version: z.string(),
  /** @ts code (evaluated at runtime) returning a StreamFilter object. */
  filter: z.string(),
})

export const emailNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.email),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  replyTo: z.string().optional(),
})

export const postgresNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.postgres),
  postgres: z.string().optional(),
  select: z.string().optional(),
  insert: z.string().optional(),
  update: z.string().optional(),
  delete: z.string().optional(),
  params: z.string().optional(),
  condition: z.string().optional(),
})

/**
 * Governed operation for a managed `database` node (RFC 0013). Each value mints
 * a capability-narrowed view of the injected Prisma client; `transaction` runs
 * its body inside one interactive transaction with the full client.
 */
export const databaseOperationSchema = z.enum([
  'query',
  'insert',
  'update',
  'delete',
  'transaction',
])

export type DatabaseOperation = z.infer<typeof databaseOperationSchema>

/**
 * `type: database` node: an opt-in governed mutation surface over a managed
 * `database` block. `database` names the block, `operation` narrows the injected
 * client's capabilities, `run` is the typed Prisma body (@ts), and `condition`
 * optionally gates execution the same way the postgres insert node does.
 */
export const databaseNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.database),
  database: z.string(),
  operation: databaseOperationSchema,
  condition: z.string().optional(),
  run: z.string(),
})

/** Mounted disk: remote exec or copy_file from a file handle onto the disk. */
/** One bash command on a fresh guest of a named `computer`. */
export const shellNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.shell),
  /** DSL name of a top-level `computer` block. */
  computer: z.string(),
  /** Bash command (@ts snippet or quoted string). */
  command: z.string(),
})

/**
 * Longest a device node waits for a device to collect its run, and the
 * default. A workflow should not sit for a day on a machine that is off, so
 * this is much shorter than what a person can ask for from the dashboard.
 */
export const DEVICE_NODE_WAIT_SECONDS_MAX = 3_600
export const DEVICE_NODE_WAIT_SECONDS_DEFAULT = 300

/**
 * One `operation` run on an enrolled device, or on every device a selector
 * matches. Exactly one of `device` and `devices` is set; the deployment
 * definition checks that, since a member of this union cannot carry a refine.
 */
export const deviceNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.device),
  /** DSL name of a top-level `operation` block. */
  operation: z.string(),
  /** Id of one enrolled device (@ts snippet or quoted string). */
  device: z.string().optional(),
  /** Every active device with all of these tags and, when set, this os. */
  devices: deviceSelectorSchema.optional(),
  /** The operation's input: an object literal, or @ts returning an object. */
  input: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  /** Seconds to wait for a device to collect the run before giving up on it. */
  waitSeconds: z.number().int().min(30).max(DEVICE_NODE_WAIT_SECONDS_MAX).optional(),
})

export const diskNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.disk),
  operation: z.enum(['exec', 'copy_file']).optional(),
  /** DSL name of a top-level `disk` block. */
  disk: z.string(),
  /** Bash command (@ts snippet or inlined string body) for exec. */
  command: z.string().optional(),
  /** Relative destination path for copy_file. */
  path: z.string().optional(),
  /** @ts snippet or literal resolving to a ready file handle for copy_file. */
  file: z.string().optional(),
  overwrite: z.literal('replace').optional(),
})

/** LLM harness node: binds to a top-level `agent` block + optional tool subgraphs + roles. */
export const agentNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.agent),
  /** DSL name of a top-level `agent` block (deployment `agentBlocks`). */
  agent: z.string(),
  model: z.string().optional(),
  /** Inlined @ts prompt body */
  prompt: z.string().optional(),
  /** Capability profile to narrow the agent's tools/sandbox for this node. */
  profile: z.string().optional(),
  /** Legacy name for `profile`, still read from older deployment snapshots. */
  role: z.string().optional(),
  tools: z.array(z.string()).optional(),
  /** Per-call system prompt @ts override (optional). */
  system: z.string().optional(),
})

export const scrapeNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.scrape),
  url: z.string().optional(),
  onlyMainContent: z.boolean().optional(),
  formats: z.array(z.string()).optional(),
  maxAge: z.number().optional(),
  parsers: z.array(z.string()).optional(),
})

export const searchProviderSchema = z.enum(['firecrawl', 'telem'])

export const TELEM_UNSUPPORTED_SEARCH_FIELDS = [
  'categories',
  'location',
  'country',
  'tbs',
  'includeDomains',
  'excludeDomains',
  'scrapeFormats',
] as const

/** Web discovery. Omitting provider preserves Firecrawl behavior. */
export const searchNodeConfigSchema = z
  .object({
    type: z.literal(nodeTypeMap.search),
    provider: searchProviderSchema.optional(),
    /** Search query (literal or @ts returning string). */
    query: z.string().optional(),
    /** Firecrawl: per source; Telem: total unique results (default 5, max 20). */
    limit: z.number().optional(),
    /** Result source types: web, news, images. */
    sources: z.array(z.enum(['web', 'news', 'images'])).optional(),
    /** Category filters: github, research, pdf. */
    categories: z.array(z.enum(['github', 'research', 'pdf'])).optional(),
    location: z.string().optional(),
    country: z.string().optional(),
    /** Time-based search (e.g. `qdr:w`); applies to web results. */
    tbs: z.string().optional(),
    includeDomains: z.array(z.string()).optional(),
    excludeDomains: z.array(z.string()).optional(),
    /** When set, pass `scrapeOptions.formats` so results include page content. */
    scrapeFormats: z.array(z.string()).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.provider !== 'telem') {
      return
    }

    for (const field of TELEM_UNSUPPORTED_SEARCH_FIELDS) {
      if (config[field] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `Search "${field}" is not supported by Telem yet; use provider: firecrawl`,
        })
      }
    }

    if (
      config.sources !== undefined &&
      (config.sources.length !== 1 || config.sources[0] !== 'web')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message:
          'Telem search only supports sources: ["web"]; use provider: firecrawl for other sources',
      })
    }
  })

export const parallelNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.parallel),
  operation: z.enum(['search', 'extract', 'findall']),
  objective: z.string().optional(),
  urls: z.string().optional(),
  searchQueries: z.string().optional(),
  mode: z.enum(['one-shot', 'agentic', 'fast']).optional(),
  /** Search: maps to API `excerpts.max_chars_per_result`. */
  excerptsMaxCharsPerResult: z.number().optional(),
  /** Search: maps to API `excerpts.max_chars_total`. */
  excerptsMaxCharsTotal: z.number().optional(),
  /** Extract: include relevant excerpts per URL. */
  excerpts: z.boolean().optional(),
  /** Extract: include full page content. */
  fullContent: z.boolean().optional(),
  /** FindAll: entity type string (@ts). */
  entityType: z.string().optional(),
  /** FindAll: generator tier. */
  generator: z.enum(['base', 'core', 'pro', 'preview']).optional(),
  /** FindAll: match conditions (@ts). */
  matchConditions: z.string().optional(),
  /** FindAll: match limit (API requires 5–1000). */
  matchLimit: z.number().optional(),
  /** FindAll: exclude list (@ts). */
  excludeList: z.string().optional(),
  /** FindAll: seconds between status polls (default 30). */
  pollInterval: z.number().optional(),
  pollIntervalUnit: z.enum(['seconds', 'minutes']).optional(),
  /** FindAll: max wall time before giving up (default 600). */
  pollTimeout: z.number().optional(),
  pollTimeoutUnit: z.enum(['seconds', 'minutes']).optional(),
})

export const waitNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.wait),
  amount: z.number().optional(),
  unit: z.enum(['seconds', 'minutes', 'hours', 'days']).optional(),
  secondsFromConfig: z.string().optional(),
})

const workflowNodeTypeSchema = z.union([z.literal(nodeTypeMap.workflow), z.literal('graph')])

export const subgraphNodeConfigSchema = z.object({
  type: workflowNodeTypeSchema,
  workflowId: z.uuid().optional(),
  workflow: z.string().optional(),
  graphId: z.uuid().optional(),
  graph: z.string().optional(),
  input: z.string().optional(),
})

/** Map node: iterate over items and run a child workflow per element (flattened to `workflow` ref). */
export const mapNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.map),
  items: z.string().optional(),
  maxItems: z.number().optional(),
  concurrency: z.number().optional(),
  workflowId: z.uuid().optional(),
  workflow: z.string().optional(),
  graphId: z.uuid().optional(),
  graph: z.string().optional(),
})

/** Fanout node: run independent child workflows with bounded concurrency. */
export const fanoutNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.fanout),
  items: z.string().optional(),
  maxItems: z.number().optional(),
  concurrency: z.number().optional(),
  workflowId: z.uuid().optional(),
  workflow: z.string().optional(),
  graphId: z.uuid().optional(),
  graph: z.string().optional(),
})

/** While node: repeated child workflow until condition is false or maxIterations. */
export const whileNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.while),
  input: z.string().optional(),
  condition: z.string().optional(),
  update: z.string().optional(),
  maxIterations: z.number().optional(),
  workflowId: z.uuid().optional(),
  workflow: z.string().optional(),
  graphId: z.uuid().optional(),
  graph: z.string().optional(),
})

export const switchNodeConfigSchema = z.object({
  type: z.literal(nodeTypeMap.switch),
  cases: z
    .array(
      z
        .string()
        .min(1, 'Case name is required')
        .regex(/^[a-zA-Z0-9_]+$/, 'Case must contain only letters, numbers, and underscores'),
    )
    .min(1, 'At least one case is required'),
  router: z.string().optional(),
})

export const reviewActionSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/, 'Action id must contain only letters, numbers, and underscores'),
  label: z.string().min(1, 'Label is required'),
  outcome: z.enum(['approve', 'reject']),
})

export const reviewConfigSchema = z.object({
  enabled: z.boolean(),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  approvedOutput: z.string().optional(),
  rejectedOutput: z.string().optional(),
  schema: jsonSchemaSchema.optional().nullable(),
  actions: z.array(reviewActionSchema).optional(),
})

/** Failure policy when a node execution throws (used by durable DAG engine). */
export const failurePolicySchema = z.object({
  strategy: z.enum(['fail', 'retry', 'skip', 'fallback']),
  maxRetries: z.number().optional(),
  backoffMs: z.number().optional(),
  fallbackValue: z.unknown().optional(),
})

export const workflowNodeConfigSchema = z.intersection(
  z.discriminatedUnion('type', [
    aiNodeConfigSchema,
    decisionNodeConfigSchema,
    codeNodeConfigSchema,
    emailNodeConfigSchema,
    subgraphNodeConfigSchema,
    mapNodeConfigSchema,
    fanoutNodeConfigSchema,
    whileNodeConfigSchema,
    httpNodeConfigSchema,
    integrationNodeConfigSchema,
    postgresNodeConfigSchema,
    databaseNodeConfigSchema,
    diskNodeConfigSchema,
    shellNodeConfigSchema,
    deviceNodeConfigSchema,
    agentNodeConfigSchema,
    scrapeNodeConfigSchema,
    searchNodeConfigSchema,
    parallelNodeConfigSchema,
    streamNodeConfigSchema,
    switchNodeConfigSchema,
    waitNodeConfigSchema,
  ]),
  z.object({
    failurePolicy: failurePolicySchema.optional(),
  }),
)

export const triggerTypeMap = {
  form: 'form',
  webhook: 'webhook',
  schedule: 'schedule',
} as const

export const triggerTypeSchema = z.enum(Object.values(triggerTypeMap))
export type TriggerType = keyof typeof triggerTypeMap

export const formTriggerConfigSchema = z.object({
  type: z.literal(triggerTypeMap.form),
})

export const webhookTriggerConfigSchema = z.object({
  type: z.literal(triggerTypeMap.webhook),
})

export const scheduleTriggerConfigSchema = z.object({
  type: z.literal(triggerTypeMap.schedule),
  cron: z.string(),
  timezone: z.string().optional(),
})

export const triggerConfigSchema = z.discriminatedUnion('type', [
  formTriggerConfigSchema,
  webhookTriggerConfigSchema,
  scheduleTriggerConfigSchema,
])

export type {
  JSONSchema7 as JsonSchema,
  JSONSchema7Definition as JsonSchemaDefinition,
  JSONSchema7Type as JsonSchemaType,
  JSONSchema7TypeName as JsonSchemaTypeName,
} from 'json-schema'

export type AINodeConfig = z.infer<typeof aiNodeConfigSchema>
export type AIKind = z.infer<typeof aiKindSchema>
export type DiskNodeConfig = z.infer<typeof diskNodeConfigSchema>
export type ShellNodeConfig = z.infer<typeof shellNodeConfigSchema>
export type DeviceNodeConfig = z.infer<typeof deviceNodeConfigSchema>
export type AgentNodeConfig = z.infer<typeof agentNodeConfigSchema>
export type NodeType = keyof typeof nodeTypeMap
export type HTTPNodeConfig = z.infer<typeof httpNodeConfigSchema>
export type IntegrationNodeConfig = z.infer<typeof integrationNodeConfigSchema>
export type WorkflowNodeConfig = z.infer<typeof workflowNodeConfigSchema>
/** @deprecated Use `WorkflowNodeConfig` */
export type GraphNodeConfig = WorkflowNodeConfig
export type SubgraphNodeConfig = z.infer<typeof subgraphNodeConfigSchema>
export type CodeNodeConfig = z.infer<typeof codeNodeConfigSchema>
export type DatabaseNodeConfig = z.infer<typeof databaseNodeConfigSchema>
export type EmailNodeConfig = z.infer<typeof emailNodeConfigSchema>
export type ScrapeNodeConfig = z.infer<typeof scrapeNodeConfigSchema>
export type SearchNodeConfig = z.infer<typeof searchNodeConfigSchema>
export type ParallelNodeConfig = z.infer<typeof parallelNodeConfigSchema>
export type StreamNodeConfig = z.infer<typeof streamNodeConfigSchema>
export type SwitchNodeConfig = z.infer<typeof switchNodeConfigSchema>
export type WaitNodeConfig = z.infer<typeof waitNodeConfigSchema>
export type FailurePolicy = z.infer<typeof failurePolicySchema>
export type ReviewAction = z.infer<typeof reviewActionSchema>
export type ReviewConfig = z.infer<typeof reviewConfigSchema>
export type FormTriggerConfig = z.infer<typeof formTriggerConfigSchema>
export type WebhookTriggerConfig = z.infer<typeof webhookTriggerConfigSchema>
export type ScheduleTriggerConfig = z.infer<typeof scheduleTriggerConfigSchema>
export type TriggerConfig = z.infer<typeof triggerConfigSchema>
export type Position = z.infer<typeof positionSchema>

/** Alphanumeric + underscores only (snake_case-friendly). Used for graph, form, webhook, node, folder, etc. names. */
export const resourceNameSchema = z
  .string()
  .min(1, 'Name is required')
  .regex(/^[a-zA-Z0-9_]+$/, 'Name must contain only letters, numbers, and underscores')

export const formSubmissionResponseSchema = z.object({
  message: z.string(),
  executionIds: z.array(z.string()),
})

/**
 * Tier for AI model classification. Used to charge different credit amounts
 * based on the cost the model has on the upstream provider (OpenRouter).
 */
export type AIModelTier = 'embed' | 'cheap' | 'mid' | 'frontier' | 'image' | 'video'

/**
 * Credit policy for a node type. The shape varies by how the node is priced:
 *
 * - `flat`: same credit cost every execution.
 * - `vendor`: separate credit costs depending on whether the customer brought
 *   their own vendor key (BYOK) or used the platform default.
 * - `ai`: vendor-style discount layered on top of a tier picked from the AI
 *   model name and kind.
 */
export type NodeCreditPolicy =
  | { kind: 'flat'; credits: number }
  | { kind: 'vendor'; platform: number; byok: number }
  | {
      kind: 'ai'
      tiers: Record<AIModelTier, { platform: number; byok: number }>
    }

/**
 * Source of truth for per-node credit pricing. The executor calls
 * `computeNodeCredits` with the runtime context for each successful execution.
 * The pricing page reads this same constant to render the public table, so the
 * marketing copy and the billing system can never drift.
 */
export const NODE_CREDIT_POLICIES: Record<NodeType, NodeCreditPolicy> = {
  decision: { kind: 'vendor', platform: 25, byok: 25 },
  ai: {
    kind: 'ai',
    tiers: {
      embed: { platform: 25, byok: 25 },
      cheap: { platform: 25, byok: 25 },
      mid: { platform: 25, byok: 25 },
      frontier: { platform: 25, byok: 25 },
      image: { platform: 25, byok: 25 },
      video: { platform: 25, byok: 25 },
    },
  },
  agent: {
    kind: 'ai',
    tiers: {
      embed: { platform: 25, byok: 25 },
      cheap: { platform: 25, byok: 25 },
      mid: { platform: 25, byok: 25 },
      frontier: { platform: 25, byok: 25 },
      image: { platform: 25, byok: 25 },
      video: { platform: 25, byok: 25 },
    },
  },
  scrape: { kind: 'vendor', platform: 25, byok: 25 },
  search: { kind: 'vendor', platform: 25, byok: 25 },
  parallel: { kind: 'vendor', platform: 25, byok: 25 },
  disk: { kind: 'vendor', platform: 25, byok: 25 },
  // Guest time is unmetered until organization billing for computers is decided.
  shell: { kind: 'flat', credits: 0 },
  // Charged once per node, however many devices the run reaches.
  device: { kind: 'flat', credits: 1 },
  email: { kind: 'vendor', platform: 15, byok: 15 },
  stream: { kind: 'flat', credits: 5 },
  code: { kind: 'flat', credits: 1 },
  workflow: { kind: 'flat', credits: 1 },
  map: { kind: 'flat', credits: 0 },
  fanout: { kind: 'flat', credits: 0 },
  while: { kind: 'flat', credits: 0 },
  http: { kind: 'flat', credits: 1 },
  integration: { kind: 'flat', credits: 1 },
  postgres: { kind: 'flat', credits: 1 },
  database: { kind: 'flat', credits: 1 },
  switch: { kind: 'flat', credits: 0 },
  wait: { kind: 'flat', credits: 0 },
}

/**
 * Credits charged for one interactive agent chat turn: a single user message
 * that runs the agent. Mirrors the flat `agent` node charge so a turn costs the
 * same whether the agent runs inside a workflow or in a direct conversation.
 * One turn is billed once at the conversation entry point, regardless of how
 * many sub-agents it delegates to or tools it calls.
 */
export const AGENT_TURN_CREDITS = 25
