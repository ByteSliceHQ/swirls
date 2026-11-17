import { z } from 'zod'
import { appAudiencePolicySchema } from './app-audience'
import { appAvatarSchema } from './app-avatar'
import { appBrandTokensSchema } from './app-brand-tokens'
import { APP_THEMES } from './app-themes'
import { connectionModePairError } from './connection-mode'
import { decisionDefinitionSchema } from './decision'
import { deviceOsSchema } from './device'
import {
  aiProviderSchema,
  configValueKindSchema,
  jsonSchemaSchema,
  outputFormatSchema,
  reviewConfigSchema,
  triggerTypeSchema,
  workflowNodeConfigSchema,
} from './schemas'

const uuidLike = z.string().uuid()

export const deploymentDefinitionNamedSchemaSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  schema: jsonSchemaSchema,
})

export const deploymentDefinitionFormSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  schema: jsonSchemaSchema.optional().nullable(),
  enabled: z.boolean().optional(),
  /**
   * Triggers exposure for this form. Defaults to `'internal'` when reading
   * older deployment snapshots that pre-date the visibility feature, so the
   * field is forward-compatible without requiring a snapshot rewrite.
   */
  visibility: z.enum(['public', 'internal']).default('internal'),
  /**
   * Optional HTTP Basic auth gate. Names a top-level DSL `auth` block of
   * `type: basic`; Triggers loads the matching `auth_snapshots` row at
   * request time and resolves `username`/`password` vars from the linked
   * secret block. Absent (undefined) when the form has no auth gate.
   */
  authName: z.string().optional(),
})

export const agentWalletCadenceSchema = z.enum(['daily', 'weekly', 'monthly'])

export const deploymentDefinitionAgentWalletSchema = z.object({
  budget: z.number(),
  cadence: agentWalletCadenceSchema,
  maxPerCall: z.number().optional(),
})

export const agentCacheRetentionSchema = z.enum(['none', 'short', 'long'])

/**
 * Context-engine overrides declared by the `context { }` block (RFC 0021).
 * Every field is optional and every one of them overrides a managed default,
 * so an absent block and an empty block are equivalent: the engine decides.
 */
export const deploymentDefinitionAgentContextSchema = z.object({
  /** Working-set token cap for a turn; default derives from the model window. */
  budget: z.number().int().positive().optional(),
  /** Fraction of the budget at which compaction runs. */
  compactAt: z.number().gt(0).max(1).optional(),
  /** Turns kept verbatim on the far side of a compaction checkpoint. */
  keepRecentTurns: z.number().int().nonnegative().optional(),
  /** Tool results older than this many tool uses are pruned to pointers. */
  pruneToolResultsAfter: z.number().int().min(1).optional(),
  /** Prompt-cache retention tier applied to the session's model calls. */
  cacheRetention: agentCacheRetentionSchema.optional(),
})

export const deploymentDefinitionAgentSandboxSchema = z.object({
  cpus: z.number().optional(),
  memoryMiB: z.number().optional(),
  diskGiB: z.number().optional(),
  autoStopMinutes: z.number().optional(),
  autoArchiveMinutes: z.number().optional(),
  autoDeleteMinutes: z.number().optional(),
  ephemeral: z.boolean().optional(),
})

export const deploymentDefinitionSkillReferenceSchema = z.object({
  /** Swirls `skill` block handle (for profile narrowing). */
  blockName: z.string(),
  /** On-disk slug under `.agents/skills/<name>/`. */
  name: z.string(),
  checksum: z.string().length(64),
  kind: z.literal('knowledge'),
  description: z.string().optional(),
  skillMdPath: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number().int().nonnegative(),
    }),
  ),
})

export const deploymentDefinitionSkillRefOrBlockNameSchema = z.union([
  z.string(),
  deploymentDefinitionSkillReferenceSchema,
])

export const deploymentDefinitionAgentRoleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  systemCode: z.string().optional(),
  tools: z.array(z.string()).optional(),
  /** Skill block handles at bundle time; resolved references after deploy ingest. */
  skills: z.array(deploymentDefinitionSkillRefOrBlockNameSchema).optional(),
  /** MCP block handles bound to server URLs and credentials in Cloud. */
  mcp: z.array(z.string()).optional(),
  sandbox: deploymentDefinitionAgentSandboxSchema.optional(),
})

export const deploymentDefinitionSkillBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  skillName: z.string(),
})

export const AGENT_SUGGESTION_LIMITS = {
  maxCount: 6,
  maxLabelLength: 40,
  maxMessageLength: 500,
} as const

export const deploymentDefinitionAgentSuggestionSchema = z.object({
  label: z.string().min(1).max(AGENT_SUGGESTION_LIMITS.maxLabelLength),
  message: z.string().min(1).max(AGENT_SUGGESTION_LIMITS.maxMessageLength),
})

export const deploymentDefinitionAgentBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  provider: aiProviderSchema,
  model: z.string(),
  secretsRef: z.string().optional(),
  /** Vars from the referenced secret block at bundle time (for runtime vault keys). */
  secretVars: z.array(z.string()).optional(),
  defaultSystemCode: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  maxSteps: z.number().optional(),
  tools: z.array(z.string()).optional(),
  team: z.array(z.string()).optional(),
  /** Skill block handles at bundle time; resolved references after deploy ingest. */
  skills: z.array(deploymentDefinitionSkillRefOrBlockNameSchema).optional(),
  /** MCP block handles bound to server URLs and credentials in Cloud. */
  mcp: z.array(z.string()).optional(),
  /** Top-level `computer` block whose guest runs this agent's workspace tools. Exclusive with `disks` and `sandbox`. */
  computer: z.string().optional(),
  /** Top-level shared `disk` block names mounted into this agent's sandbox. */
  disks: z.array(z.string()).optional(),
  sandbox: deploymentDefinitionAgentSandboxSchema.optional(),
  wallet: deploymentDefinitionAgentWalletSchema.optional(),
  /** Context-engine overrides; absent means the managed defaults apply. */
  context: deploymentDefinitionAgentContextSchema.optional(),
  roles: z.array(deploymentDefinitionAgentRoleSchema).optional(),
  suggestions: z
    .array(deploymentDefinitionAgentSuggestionSchema)
    .max(AGENT_SUGGESTION_LIMITS.maxCount)
    .optional(),
})

/**
 * When the bound agent takes a turn. `ambient` hands the decision to the
 * context engine's gate (RFC 0021) and is accepted for `platform: swirls`
 * first; the language validator is where that platform constraint is enforced.
 */
export const channelModeSchema = z.enum(['mention', 'dm', 'all', 'ambient'])

/**
 * Outer bounds for the channel response-policy knobs. Both duration ceilings
 * sit at a day: a longer engagement or cooldown is almost always a unit slip
 * (`"3000m"` for `"30m"`), and a channel the agent is meant to stay out of is
 * expressed with `mode`, not with an unreachable timer.
 */
export const CHANNEL_RESPONSE_POLICY_LIMITS = {
  maxEngagementTimeoutSeconds: 24 * 60 * 60,
  maxCooldownSeconds: 24 * 60 * 60,
} as const

export const deploymentDefinitionChannelBlockSchema = z
  .object({
    id: uuidLike,
    name: z.string(),
    label: z.string(),
    description: z.string().optional(),
    platform: z.preprocess(
      (value) => (value === 'portal' ? 'swirls' : value),
      z.enum(['slack', 'linear', 'discord', 'web', 'mcp', 'swirls']),
    ),
    agent: z.string().optional(),
    workflows: z.array(z.string().min(1)).optional(),
    enabled: z.boolean().optional(),
    /** Name of a top-level `connection` block supplying the OAuth credential. */
    connectionRef: z.string().optional(),
    /**
     * Name of a top-level `connector` block (inbound OAuth application). Set on
     * `platform: mcp` channels; the inbound counterpart to `connectionRef`.
     */
    connectorRef: z.string().optional(),
    mode: channelModeSchema.optional(),
    /**
     * Response-policy overrides (RFC 0021), normalized from the DSL's duration
     * literals to whole seconds at bundle time so the engine never re-parses
     * surface syntax. Absent means the managed default applies.
     */
    engagementTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .max(CHANNEL_RESPONSE_POLICY_LIMITS.maxEngagementTimeoutSeconds)
      .optional(),
    cooldownSeconds: z
      .number()
      .int()
      .nonnegative()
      .max(CHANNEL_RESPONSE_POLICY_LIMITS.maxCooldownSeconds)
      .optional(),
    /** Ceiling on posts made without being addressed; `0` silences them entirely. */
    maxUnpromptedPerHour: z.number().int().nonnegative().optional(),
  })
  .superRefine((channel, ctx) => {
    if (channel.platform === 'mcp') {
      if (!channel.agent && !channel.workflows?.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'MCP channel requires an agent or workflows',
        })
      }
      if (!channel.connectorRef) {
        ctx.addIssue({
          code: 'custom',
          message: 'MCP channel requires a connector',
        })
      }
    } else {
      if (!channel.agent) {
        ctx.addIssue({ code: 'custom', message: 'Channel requires an agent' })
      }
      if (channel.workflows !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only MCP channels publish workflows',
        })
      }
    }
    if (
      channel.workflows?.some(
        (name, index, names) =>
          ['send_message', 'get_execution'].includes(name) ||
          names.indexOf(name) !== index,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'MCP workflow tool names must be unique and not reserved',
      })
    }
  })

export const deploymentDefinitionConnectionBlockSchema = z
  .object({
    id: uuidLike,
    name: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    /** OAuth provider this connection brokers (slack, linear, ...). */
    provider: z.string(),
    /**
     * Self-managed mode: absolute API origin. Must be set together with
     * `authRef`. When present, credentials come from the vault auth profile
     * instead of Fabric-brokered OAuth.
     */
    baseUrl: z.string().url().optional(),
    /** Self-managed mode: name of a deployment `auth` block. */
    authRef: z.string().min(1).optional(),
    /** Optional private connectivity realm for the self-managed origin. */
    networkRef: z.string().min(1).optional(),
  })
  .superRefine((block, ctx) => {
    const message = connectionModePairError(
      block.name,
      block.baseUrl,
      block.authRef,
    )
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    }
  })

export const deploymentDefinitionMcpBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  /** Declared in DSL on new deployments; absent on older snapshots. */
  url: z.string().optional(),
  /**
   * Credential acquisition. New bundles always emit `static` | `interactive`.
   * Absent on legacy snapshots → treat as static at runtime.
   */
  auth: z.enum(['static', 'interactive']).optional(),
  /** Optional private connectivity realm for the remote MCP server. */
  networkRef: z.string().min(1).optional(),
})

export const deploymentDefinitionNetworkDatabaseExposureSchema = z.object({
  database: z.string().min(1),
  connections: z.array(z.string().min(1)).min(1),
})

export const deploymentDefinitionNetworkBlockSchema = z.object({
  id: uuidLike,
  name: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  expose: z.object({
    apps: z.array(z.string().min(1)),
    channels: z.array(z.string().min(1)),
    forms: z.array(z.string().min(1)),
    webhooks: z.array(z.string().min(1)),
    services: z.array(z.string().min(1)),
    databases: z.array(deploymentDefinitionNetworkDatabaseExposureSchema),
  }),
})

/**
 * Inbound OAuth application slot (`connector name { label, description }`). The
 * Swirls-managed OAuth application external MCP clients authenticate against;
 * the application and per-end-client credentials are provisioned in Cloud. No
 * secrets in the snapshot.
 */
export const deploymentDefinitionConnectorBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
})

export const deploymentDefinitionActionBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  provider: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string(),
  encoding: z.enum(['json', 'form', 'query', 'raw']).optional(),
  scopes: z.array(z.string()).optional(),
  inputSchema: jsonSchemaSchema.optional(),
  outputSchema: jsonSchemaSchema.optional(),
})

export const deploymentDefinitionWebhookSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  schema: jsonSchemaSchema.optional().nullable(),
  enabled: z.boolean().optional(),
  secretRefBlock: z.string().optional(),
  secretRefVar: z.string().optional(),
  headerName: z.string().optional(),
})

export const deploymentDefinitionScheduleSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  cron: z.string(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
})

export const deploymentDefinitionNodeSchema = z.object({
  id: uuidLike,
  name: z.string(),
  type: z.string(),
  label: z.string(),
  description: z.string().optional(),
  isRoot: z.boolean().optional(),
  config: workflowNodeConfigSchema,
  reviewConfig: reviewConfigSchema.nullable().optional(),
  inputSchema: jsonSchemaSchema.nullable().optional(),
  outputSchema: jsonSchemaSchema.nullable().optional(),
  secretsMap: z.record(z.string(), z.array(z.string())).optional(),
  /** HTTP node: top-level `auth` block name from DSL. */
  authRef: z.string().optional(),
  /** HTTP node: top-level `connection` block name from DSL (Swirls-brokered OAuth). */
  connectionRef: z.string().optional(),
  /** Integration node: top-level `action` block name from DSL. */
  actionRef: z.string().optional(),
  /** Presentation format for leaf outputs (`format:` in .swirls). */
  outputFormat: outputFormatSchema.optional(),
  /**
   * Per-field DSL value kind for executable string fields (`command`, `url`, …).
   * When `literal`, runtime uses the stored string as-is; `ts`/`sql` run the sandbox.
   */
  configValueKinds: z.record(z.string(), configValueKindSchema).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
})

export const deploymentDefinitionSecretBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** When `managed`, platform supplies values (Enterprise); omit for user vault. */
  type: z.literal('managed').optional(),
  vars: z.array(z.string()),
})

export const deploymentDefinitionAuthBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  authType: z.string(),
  secretBlockName: z.string().optional(),
  /** String fields from the auth block (token_url, grant_type, header, etc.). */
  config: z.record(z.string(), z.string()),
})

export const deploymentDefinitionPostgresBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  secretsRef: z.string().optional(),
  connection: z.string(),
  connectionIsLiteral: z.boolean(),
  /** Optional private connectivity realm for this external database. */
  networkRef: z.string().min(1).optional(),
  tables: z.array(
    z.object({
      name: z.string(),
      schema: z.record(z.string(), z.unknown()),
    }),
  ),
})

export const deploymentDefinitionDatabaseConnectionSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
})

/**
 * A Swirls-managed Postgres database. The `schema` is the `@prisma` island
 * source verbatim; `schemaChecksum` is the sha256 hex of that text, used by the
 * post-deploy migration workflow to detect schema drift.
 */
export const deploymentDefinitionDatabaseBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  /** `@prisma` island source, verbatim. */
  schema: z.string(),
  /** sha256 hex of the schema text. */
  schemaChecksum: z.string(),
  /** Declared named connections for direct application access. */
  connections: z
    .array(deploymentDefinitionDatabaseConnectionSchema)
    .default([]),
})

/**
 * A declared data migration for a managed `database`. `operationCode` is the
 * typed Prisma data-migration `@ts` body; migrations run in ascending `order`
 * per database after the schema migration.
 */
export const deploymentDefinitionDatabaseMigrationSchema = z.object({
  id: uuidLike,
  name: z.string(),
  /** Name of the `database` block this migration targets. */
  database: z.string(),
  order: z.number().int().nonnegative(),
  /** `@ts` data-migration body. */
  operationCode: z.string(),
})

export const deploymentDefinitionDiskBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string().optional(),
  region: z.string().optional(),
})

export const deploymentDefinitionComputerHarnessSchema = z.object({
  type: z.string(),
  provider: z.string(),
  runtime: z.string(),
})

export const deploymentDefinitionComputerBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Author `software:` pins. Baseline packages are not listed. */
  software: z.record(z.string(), z.string()),
  disks: z.array(z.string()),
  resources: z.object({
    cpus: z.number(),
    memoryMiB: z.number(),
    diskGiB: z.number().optional(),
  }),
  needsMountTooling: z.boolean(),
  /**
   * The `harness: { type, provider }` block plus the base-image runtime the
   * recipe was compiled for. Absent on computers without a harness. Names are
   * strings here because the catalog lives in `@swirls/language`; the API
   * checks them against it and recomputes the recipe hash on ingest.
   */
  harness: deploymentDefinitionComputerHarnessSchema.optional(),
  recipeHash: z.string(),
})

/**
 * A script that runs on an enrolled device (`operation name { … }`).
 *
 * `script` is the exact text a reviewer saw in source, and `scriptSha256` is
 * the hash of its UTF-8 bytes. The API recomputes the hash on ingest, and the
 * same hash is what each signed dispatch commits to, so the bytes a device
 * runs are the bytes that were deployed.
 */
export const deploymentDefinitionOperationBlockSchema = z.object({
  id: uuidLike,
  /** Travels inside the signed dispatch, so it follows the wire id rule. */
  name: z
    .string()
    .regex(
      /^[A-Za-z0-9._-]{1,128}$/,
      'must be 1-128 characters of A-Za-z0-9._-',
    ),
  label: z.string(),
  description: z.string().optional(),
  interpreter: z.enum(['powershell', 'sh']),
  /** When set, the operation only runs on devices with this system. */
  platform: deviceOsSchema.optional(),
  runAs: z.enum(['system', 'signed_in_user']),
  script: z
    .string()
    .min(1)
    .max(512_000)
    .refine((value) => !value.includes('\u0000'), 'must not contain NUL'),
  scriptSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Validated against the node's input before anything is signed. */
  inputSchema: jsonSchemaSchema.optional(),
  /**
   * When set, the script's standard output is parsed as JSON, checked
   * against this schema, and returned as the run's `result`.
   */
  outputSchema: jsonSchemaSchema.optional(),
  timeoutSeconds: z.number().int().min(1).max(3_600),
})

const deploymentDefinitionStreamVersionSchema = z.object({
  schema: jsonSchemaSchema,
  conditionCode: z.string().optional(),
  prepareCode: z.string(),
})

export const deploymentDefinitionStreamSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  workflowName: z.string(),
  /** Active writer version (must exist as key in versions). */
  version: z.string(),
  versions: z.record(z.string(), deploymentDefinitionStreamVersionSchema),
})

/** One computed column on a view: runs a graph per row via Temporal. */
export const deploymentDefinitionViewComputedColumnSchema = z.object({
  name: z.string(),
  /** Workflow (graph) executed to compute this column. */
  workflowName: z.string(),
  /** @ts body mapping the view row into the graph trigger input. */
  inputCode: z.string(),
  /** Optional @ts body mapping the graph output into the cell value. */
  outputCode: z.string().optional(),
})

export const deploymentDefinitionQueryBlockSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  database: z.string(),
  sql: z.string(),
  /** Ordered unique `{{name}}` placeholders from the SQL body. */
  params: z.array(z.string()),
})

export const deploymentDefinitionViewSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  /** Stream names composed by this view (exposed as context.streams.<name> in columnsCode). */
  streams: z.array(z.string()),
  /** JSON Schema for the mapped (non-computed) row shape. */
  schema: jsonSchemaSchema,
  /** @ts body mapping stream rows into row values. */
  columnsCode: z.string(),
  computed: z.array(deploymentDefinitionViewComputedColumnSchema).optional(),
})

/** One page inside an `app` block (RFC 0022). */
export const deploymentDefinitionAppPageSchema = z
  .object({
    name: z.string(),
    label: z.string().optional(),
    /** Curated icon name rendered by app navigation. */
    icon: z.string().optional(),
    /** Remove page chrome and let OpenUI own the full main viewport. */
    viewport: z.literal('full').optional(),
    /** Authoring-time OpenUI Lang source (deterministic; no LLM at runtime). */
    openui: z.string().optional(),
    /** Portal channel for a full-viewport room chat page (exclusive with openui). */
    channel: z.string().optional(),
    /** Agent backing the channel page, resolved at deploy from the channel block. */
    agent: z.string().optional(),
    /** Portal channels for an app-wide thread center page. */
    threads: z.array(z.string()).min(1).optional(),
    /** Workflows whose pending reviews are shown on this page. */
    reviews: z.array(z.string()).min(1).optional(),
  })
  .refine(
    (page) =>
      [page.openui, page.channel, page.threads, page.reviews].filter(
        (body) => body !== undefined,
      ).length === 1,
    {
      message:
        'App page must declare exactly one of openui, channel, threads, or reviews',
    },
  )

export const deploymentDefinitionAppNavSectionSchema = z.object({
  title: z.string(),
  entries: z.array(
    z.object({
      pageName: z.string(),
      label: z.string().optional(),
    }),
  ),
})

export const deploymentDefinitionAppShellRegionSchema = z.object({
  name: z.enum(['topbar', 'leftbar', 'rightbar']),
  props: z.record(
    z.string(),
    z.union([z.string(), z.boolean(), z.array(z.string())]),
  ),
})

export const deploymentDefinitionAppLandingDiscoverSchema = z.object({
  index: z.boolean().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  ogImage: z.string().optional(),
  canonical: z.string().optional(),
  locale: z.string().optional(),
  summary: z.string().optional(),
  audience: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  faq: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .optional(),
  organization: z.string().optional(),
  organizationUrl: z.string().optional(),
  applicationCategory: z.string().optional(),
})

export const deploymentDefinitionAppLandingSchema = z.object({
  layout: z.enum(['centered', 'split', 'cover']).optional(),
  image: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  signInTitle: z.string().optional(),
  signInHint: z.string().optional(),
  footer: z.string().optional(),
  discover: deploymentDefinitionAppLandingDiscoverSchema.optional(),
})

export const deploymentDefinitionAppSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  brand: z
    .object({
      accent: z.string().optional(),
      logo: z.string().optional(),
      theme: z.enum(APP_THEMES).optional(),
      tokens: appBrandTokensSchema.optional(),
      avatar: appAvatarSchema.optional(),
    })
    .optional(),
  landing: deploymentDefinitionAppLandingSchema.optional(),
  audience: appAudiencePolicySchema.optional(),
  shell: z
    .object({
      preset: z.enum(['sidebar', 'topnav', 'chat', 'canvas']).optional(),
      regions: z.array(deploymentDefinitionAppShellRegionSchema).optional(),
    })
    .optional(),
  nav: z
    .object({
      sections: z.array(deploymentDefinitionAppNavSectionSchema),
    })
    .optional(),
  pages: z.array(deploymentDefinitionAppPageSchema),
})

export const deploymentDefinitionEdgeSchema = z.object({
  id: uuidLike,
  sourceNodeId: uuidLike,
  targetNodeId: uuidLike,
  label: z.string().optional(),
})

export const deploymentDefinitionWorkflowSchema = z.object({
  id: uuidLike,
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  concurrency: z.number().int().min(1).max(64).optional(),
  executionTokenTtlSeconds: z.number().int().min(300).max(86_400).optional(),
  nodes: z.array(deploymentDefinitionNodeSchema),
  edges: z.array(deploymentDefinitionEdgeSchema),
  /**
   * Set on graphs synthesized from inline `map`/`fanout`/`while` subgraphs. These are
   * resolved at runtime via `preloadedWorkflows` and are NOT persisted as
   * workflow snapshots, so they never appear in the workflow list / UI.
   */
  synthetic: z.boolean().optional(),
})

export const deploymentDefinitionTriggerSchema = z.object({
  id: uuidLike,
  name: z.string(),
  resourceType: triggerTypeSchema,
  resourceId: uuidLike,
  workflowId: uuidLike,
  enabled: z.boolean().optional(),
})

/** One condition inside a role's `match { }` (eq for scalar, in for list). */
export const deploymentDefinitionClaimConditionSchema = z.object({
  claim: z.string(),
  op: z.enum(['eq', 'in']),
  values: z.array(z.string()),
})

/** `role <name> { match { … } }` — claim-derived access role. */
export const deploymentDefinitionRoleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  match: z.array(deploymentDefinitionClaimConditionSchema),
})

/** `allow|deny <role> -> agent <name>|*` grant. */
const policyGrantBase = z.object({
  effect: z.enum(['allow', 'deny']),
  role: z.string(),
})
export const deploymentDefinitionPolicyGrantSchema = z.union([
  policyGrantBase.extend({
    agent: z.string(),
    workflow: z.never().optional(),
    workflows: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
  }),
  policyGrantBase.extend({
    workflow: z
      .string()
      .min(1)
      .refine((name) => name !== '*'),
    agent: z.never().optional(),
    workflows: z.never().optional(),
    tools: z.never().optional(),
  }),
])

/** `policy { … }` — a set of role-to-agent grants. A policy with grants opts
 * the deployment into deny-by-default enforcement. */
export const deploymentDefinitionFilePolicySchema = z.object({
  retention: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('forever') }),
    z.object({ mode: z.literal('days'), days: z.number().int().positive() }),
  ]),
})

export const deploymentDefinitionPolicySchema = z.object({
  grants: z.array(deploymentDefinitionPolicyGrantSchema),
  files: deploymentDefinitionFilePolicySchema.optional(),
})

const deploymentDefinitionTestBlockSchema = z
  .object({
    id: uuidLike,
    name: z.string(),
  })
  .passthrough()

export const deploymentDefinitionMockBlockSchema =
  deploymentDefinitionTestBlockSchema

export const deploymentDefinitionPlaybookBlockSchema =
  deploymentDefinitionTestBlockSchema

export const deploymentDefinitionSchema = z
  .object({
    version: z.number().optional(),
    forms: z.array(deploymentDefinitionFormSchema).optional(),
    webhooks: z.array(deploymentDefinitionWebhookSchema).optional(),
    schedules: z.array(deploymentDefinitionScheduleSchema).optional(),
    workflows: z.array(deploymentDefinitionWorkflowSchema).optional(),
    schemas: z.array(deploymentDefinitionNamedSchemaSchema).optional(),
    triggers: z.array(deploymentDefinitionTriggerSchema).optional(),
    secretBlocks: z.array(deploymentDefinitionSecretBlockSchema).optional(),
    authBlocks: z.array(deploymentDefinitionAuthBlockSchema).optional(),
    postgresBlocks: z.array(deploymentDefinitionPostgresBlockSchema).optional(),
    /** Swirls-managed Postgres databases (`database name { schema: @prisma … }`). */
    databaseBlocks: z.array(deploymentDefinitionDatabaseBlockSchema).optional(),
    /** Declared data migrations for managed databases (`migration name { … }`). */
    databaseMigrations: z
      .array(deploymentDefinitionDatabaseMigrationSchema)
      .optional(),
    diskBlocks: z.array(deploymentDefinitionDiskBlockSchema).optional(),
    computerBlocks: z.array(deploymentDefinitionComputerBlockSchema).optional(),
    /** Scripts that run on enrolled devices (`operation name { … }`). */
    operationBlocks: z
      .array(deploymentDefinitionOperationBlockSchema)
      .optional(),
    skillBlocks: z.array(deploymentDefinitionSkillBlockSchema).optional(),
    decisionBlocks: z
      .array(decisionDefinitionSchema.extend({ id: z.string().uuid() }))
      .optional(),
    agentBlocks: z.array(deploymentDefinitionAgentBlockSchema).optional(),
    channelBlocks: z.array(deploymentDefinitionChannelBlockSchema).optional(),
    queryBlocks: z.array(deploymentDefinitionQueryBlockSchema).optional(),
    connectionBlocks: z
      .array(deploymentDefinitionConnectionBlockSchema)
      .optional(),
    mcpBlocks: z.array(deploymentDefinitionMcpBlockSchema).optional(),
    networkBlocks: z.array(deploymentDefinitionNetworkBlockSchema).optional(),
    connectorBlocks: z
      .array(deploymentDefinitionConnectorBlockSchema)
      .optional(),
    actionBlocks: z.array(deploymentDefinitionActionBlockSchema).optional(),
    streams: z.array(deploymentDefinitionStreamSchema).optional(),
    /** Spreadsheet-like stream compositions (`view name { … }`). */
    views: z.array(deploymentDefinitionViewSchema).optional(),
    /**
     * Bespoke OpenUI-backed interfaces (`app name { shell, nav, page … }`,
     * RFC 0022). Distinct from the retired RFC 0015 generative `app`.
     */
    apps: z.array(deploymentDefinitionAppSchema).optional(),
    /** Identity-scoped access roles (`role name { match { … } }`). */
    roles: z.array(deploymentDefinitionRoleSchema).optional(),
    /** Role-to-agent grants (`policy { allow <role> -> agent … }`). Grants
     * present opts the deployment into deny-by-default enforcement. */
    policies: z.array(deploymentDefinitionPolicySchema).optional(),
    /** Hosted test harness mock declarations, retained as jsonb-friendly data. */
    mockBlocks: z.array(deploymentDefinitionMockBlockSchema).optional(),
    /** Hosted test harness playbook declarations, retained as jsonb-friendly data. */
    playbookBlocks: z.array(deploymentDefinitionPlaybookBlockSchema).optional(),
  })
  .superRefine((val, ctx) => {
    const workflows = val.workflows ?? []

    // Any Swirls primitive is deployable on its own; workflows are not
    // required. The deployment must still contain at least one primitive.
    // Schemas are excluded because they are type declarations referenced by
    // other primitives, not a deployable resource by themselves.
    const primitiveCount =
      workflows.length +
      (val.forms?.length ?? 0) +
      (val.webhooks?.length ?? 0) +
      (val.schedules?.length ?? 0) +
      (val.triggers?.length ?? 0) +
      (val.secretBlocks?.length ?? 0) +
      (val.authBlocks?.length ?? 0) +
      (val.postgresBlocks?.length ?? 0) +
      (val.databaseBlocks?.length ?? 0) +
      (val.databaseMigrations?.length ?? 0) +
      (val.diskBlocks?.length ?? 0) +
      (val.computerBlocks?.length ?? 0) +
      (val.operationBlocks?.length ?? 0) +
      (val.skillBlocks?.length ?? 0) +
      (val.agentBlocks?.length ?? 0) +
      (val.decisionBlocks?.length ?? 0) +
      (val.channelBlocks?.length ?? 0) +
      (val.queryBlocks?.length ?? 0) +
      (val.connectionBlocks?.length ?? 0) +
      (val.mcpBlocks?.length ?? 0) +
      (val.networkBlocks?.length ?? 0) +
      (val.connectorBlocks?.length ?? 0) +
      (val.actionBlocks?.length ?? 0) +
      (val.streams?.length ?? 0) +
      (val.views?.length ?? 0) +
      (val.apps?.length ?? 0) +
      (val.roles?.length ?? 0) +
      (val.policies?.length ?? 0) +
      (val.mockBlocks?.length ?? 0) +
      (val.playbookBlocks?.length ?? 0)
    if (primitiveCount === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Definition must include at least one Swirls primitive',
        path: ['workflows'],
      })
    }

    const decisionNames = new Set<string>()
    for (const [index, decision] of (val.decisionBlocks ?? []).entries()) {
      const block = val.secretBlocks?.find((b) => b.name === decision.secrets)
      if (decisionNames.has(decision.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['decisionBlocks', index, 'name'],
          message: 'Decision names must be unique',
        })
      }
      decisionNames.add(decision.name)
      if (!block || !block.vars.includes('TYPESAFE_API_KEY')) {
        ctx.addIssue({
          code: 'custom',
          path: ['decisionBlocks', index, 'secrets'],
          message:
            'Decision requires an explicit secret block declaring TYPESAFE_API_KEY',
        })
      }
    }

    const operationNames = new Set<string>()
    for (const [index, operation] of (val.operationBlocks ?? []).entries()) {
      if (operationNames.has(operation.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['operationBlocks', index, 'name'],
          message: 'Operation names must be unique',
        })
      }
      operationNames.add(operation.name)
    }

    for (const [wi, w] of workflows.entries()) {
      for (const [ni, node] of w.nodes.entries()) {
        const config = node.config
        if (config.type !== 'device') {
          continue
        }
        const path = ['workflows', wi, 'nodes', ni]
        if (!operationNames.has(config.operation)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'config', 'operation'],
            message: `Device node references undefined operation "${config.operation}"`,
          })
        }
        if ((config.device === undefined) === (config.devices === undefined)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'config'],
            message:
              'Device node needs exactly one of "device" (one device id) or "devices" (a selector)',
          })
        }
        // A review replaces a node's work with the approval form, so a
        // device node with one would never dispatch anything.
        if (node.reviewConfig?.enabled) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'reviewConfig'],
            message:
              'Put the review on a separate node upstream of the device node',
          })
        }
      }
    }

    for (const [wi, w] of workflows.entries()) {
      const nodeIds = new Set(w.nodes.map((n) => n.id))
      for (const [ni, node] of w.nodes.entries()) {
        if (node.type !== 'decision') {
          continue
        }
        const config = node.config
        const definition =
          config.type === 'decision' ? config.definition : undefined
        const block = val.secretBlocks?.find(
          (b) => b.name === definition?.secrets,
        )
        const declared = val.decisionBlocks?.find(
          (d) => d.name === definition?.name,
        )
        if (
          !definition ||
          config.type !== 'decision' ||
          config.decision !== definition.name ||
          !declared ||
          JSON.stringify(
            decisionDefinitionSchema.parse(
              Object.fromEntries(
                Object.entries(declared).filter(([key]) => key !== 'id'),
              ),
            ),
          ) !== JSON.stringify(definition) ||
          !block ||
          !block.vars.includes('TYPESAFE_API_KEY')
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['workflows', wi, 'nodes', ni, 'config'],
            message:
              'Decision requires its deployed declaration and an explicit secret block declaring TYPESAFE_API_KEY',
          })
        }
        if (node.reviewConfig?.enabled) {
          ctx.addIssue({
            code: 'custom',
            path: ['workflows', wi, 'nodes', ni, 'reviewConfig'],
            message:
              'Use a separate downstream review gate after decision inference',
          })
        }
      }

      for (const [ei, e] of w.edges.entries()) {
        if (!nodeIds.has(e.sourceNodeId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Edge references unknown sourceNodeId "${e.sourceNodeId}"`,
            path: ['workflows', wi, 'edges', ei, 'sourceNodeId'],
          })
        }
        if (!nodeIds.has(e.targetNodeId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Edge references unknown targetNodeId "${e.targetNodeId}"`,
            path: ['workflows', wi, 'edges', ei, 'targetNodeId'],
          })
        }
      }
    }
  })

export type DeploymentDefinition = z.infer<typeof deploymentDefinitionSchema>
export type DeploymentDefinitionView = z.infer<
  typeof deploymentDefinitionViewSchema
>
export type DeploymentDefinitionViewComputedColumn = z.infer<
  typeof deploymentDefinitionViewComputedColumnSchema
>
export type DeploymentDefinitionApp = z.infer<
  typeof deploymentDefinitionAppSchema
>
export type DeploymentDefinitionAppPage = z.infer<
  typeof deploymentDefinitionAppPageSchema
>
export type DeploymentDefinitionDatabaseBlock = z.infer<
  typeof deploymentDefinitionDatabaseBlockSchema
>
export type DeploymentDefinitionDatabaseConnection = z.infer<
  typeof deploymentDefinitionDatabaseConnectionSchema
>
export type DeploymentDefinitionDatabaseMigration = z.infer<
  typeof deploymentDefinitionDatabaseMigrationSchema
>
export type DeploymentDefinitionRole = z.infer<
  typeof deploymentDefinitionRoleSchema
>
export type DeploymentDefinitionClaimCondition = z.infer<
  typeof deploymentDefinitionClaimConditionSchema
>
export type DeploymentDefinitionPolicy = z.infer<
  typeof deploymentDefinitionPolicySchema
>
export type DeploymentDefinitionPolicyGrant = z.infer<
  typeof deploymentDefinitionPolicyGrantSchema
>
export type DeploymentDefinitionComputerBlock = z.infer<
  typeof deploymentDefinitionComputerBlockSchema
>
export type DeploymentDefinitionOperationBlock = z.infer<
  typeof deploymentDefinitionOperationBlockSchema
>
export type DeploymentDefinitionAgentBlock = z.infer<
  typeof deploymentDefinitionAgentBlockSchema
>
export type DeploymentDefinitionAgentSuggestion = z.infer<
  typeof deploymentDefinitionAgentSuggestionSchema
>
export type DeploymentDefinitionWorkflow = z.infer<
  typeof deploymentDefinitionWorkflowSchema
>
export type DeploymentDefinitionPostgresBlock = z.infer<
  typeof deploymentDefinitionPostgresBlockSchema
>
export type DeploymentDefinitionNetworkBlock = z.infer<
  typeof deploymentDefinitionNetworkBlockSchema
>
export type DeploymentDefinitionQueryBlock = z.infer<
  typeof deploymentDefinitionQueryBlockSchema
>

export function parseDeploymentDefinition(data: unknown) {
  return deploymentDefinitionSchema.safeParse(data)
}
