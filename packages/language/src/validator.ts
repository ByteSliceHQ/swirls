import { validateDecisions } from './decision'
/**
 * Post-parse validation for .swirls AST. Reuses schemas from @swirls/definition.
 */

import {
  aiKindSchema,
  aiProviderSchema,
  nodeTypeMap,
  nodeTypeSchema,
  outputFormatSchema,
  resourceNameSchema,
  reviewConfigSchema,
  searchProviderSchema,
  TELEM_UNSUPPORTED_SEARCH_FIELDS,
} from '@swirls/definition/schemas'
import { validateActionBlocks } from './action/validator'
import { validateAgentBlocks, validateAgentNodes } from './agent/validator'
import { validateAppBlocks } from './app/validator'
import type {
  AuthDecl,
  ConfigValue,
  Diagnostic,
  EdgeDecl,
  JsonSchemaLiteral,
  NodeDecl,
  SecretsDecl,
  SourceRange,
  SwirlsFile,
  WorkflowDecl,
} from './ast'
import { validateChannelBlocks } from './channel/validator'
import {
  validateComputerBlocks,
  validateShellNodes,
} from './computer/validator'
import { validateConnectionBlocks } from './connection/validator'
import type { LanguageHost } from './host'
import { validateConnectorBlocks } from './connector/validator'
import {
  validateDatabaseBlocks,
  validateDatabaseNodes,
  validateMigrationBlocks,
} from './database/validator'
import { validateDiskBlocks, validateDiskNodes } from './disk/validator'
import { DURATION_SYNTAX_HINT, parseDurationSeconds } from './duration'
import {
  resolvedOutputSchemaLiteralForNode,
  schemaCompatibleWithOutputFormat,
} from './format-output-compat'
import { validateIntegrationNodes } from './integration/validator'
import { validateAgentMcpRefs, validateMcpBlocks } from './mcp/validator'
import { validateMockBlocks } from './mock/validator'
import {
  validateNetworkBlocks,
  validateNetworkConsumerReference,
} from './network/validator'
import {
  validateDeviceNodes,
  validateOperationBlocks,
} from './operation/validator'
import { validatePlaybookBlocks } from './playbook/validator'
import {
  validatePostgresBlocks,
  validatePostgresNodes,
} from './postgres/validator'
import { validateQueryBlocks } from './query/validator'
import { resolveNamedSchemasFromDecls, validateSchemaFieldRefs } from './schema'
import {
  collectDeclaredVendorVars,
  SECRET_KEY_PATTERN,
  validateInferredVendorKeyDeclaration,
  validateManagedSecretBlock,
} from './secrets/validate-secrets'
import { validateAgentSkillRefs, validateSkillBlocks } from './skill/validator'
import { validateStreamBlocks } from './stream/validator'
import { isValidStreamVersionId } from './stream/version-id'
import { validateViewBlocks } from './view/validator'
import { validateSwitchFlow } from './workflow/switch-flow'
import type { WorkspaceResourceIndex } from './workspace/workspace-resources'
import { nameLookup } from './workspace/workspace-resources'

const AUTH_TYPES = new Set(['oauth', 'api_key', 'basic', 'bearer'])

/**
 * Hard-denied webhook header names (case-insensitive, stored lowercased).
 * Consumed at runtime by the Triggers service to reject requests.
 */
export const RESERVED_WEBHOOK_HEADERS: ReadonlySet<string> = new Set([
  // RFC 7230 hop-by-hop
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  // Security / protocol
  'cookie',
  'set-cookie',
  'host',
  'content-length',
  // Ingress-managed
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-real-ip',
  'x-request-id',
  // Client auto-set
  'user-agent',
  'accept',
  'content-type',
  'origin',
  'referer',
  'from',
])

function configStringValue(cv: ConfigValue | undefined): string | undefined {
  if (!cv || cv.kind !== 'string') {
    return undefined
  }

  return cv.value
}

function validateAuthBlockFields(
  a: AuthDecl,
  varsInBlock: Set<string> | null,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const checkVarRef = (field: string) => {
    const cv = a.configFields[field]

    if (!cv || cv.kind !== 'string') {
      return
    }

    if (!varsInBlock) {
      return
    }

    if (!varsInBlock.has(cv.value)) {
      out.push(
        diag(
          `Auth "${a.name}" field "${field}" must reference a var from secret block "${a.secretsRef}"`,
          cv.range,
        ),
      )
    }
  }

  const t = a.authType

  if (t === 'oauth') {
    for (const f of ['grant_type', 'client_id', 'client_secret', 'token_url']) {
      if (!(f in a.configFields)) {
        out.push(diag(`Auth type oauth requires "${f}"`, a.range))
      }
    }

    checkVarRef('client_id')
    checkVarRef('client_secret')
  } else if (t === 'api_key') {
    if (!('key' in a.configFields)) {
      out.push(diag('Auth type api_key requires "key"', a.range))
    }

    const hasHeader = 'header' in a.configFields
    const hasQuery = 'query_param' in a.configFields

    if (!hasHeader && !hasQuery) {
      out.push(
        diag('Auth type api_key requires "header" or "query_param"', a.range),
      )
    }

    checkVarRef('key')
  } else if (t === 'basic') {
    for (const f of ['username', 'password']) {
      if (!(f in a.configFields)) {
        out.push(diag(`Auth type basic requires "${f}"`, a.range))
      }
    }

    checkVarRef('username')
    checkVarRef('password')
  } else if (t === 'bearer') {
    if (!('token' in a.configFields)) {
      out.push(diag('Auth type bearer requires "token"', a.range))
    }

    checkVarRef('token')
  }

  return out
}

const NODE_TYPE_REQUIRED_FIELDS: Record<string, string[]> = {
  ai: ['kind'],
  decision: ['decision', 'state'],
  code: ['code'],
  switch: ['cases', 'router'],
  http: ['url'],
  integration: ['connection'],
  scrape: ['url'],
  search: ['query'],
  wait: [],
  workflow: ['workflow', 'input'],
  /** @deprecated legacy parsed node type alias */
  graph: ['workflow', 'input'],
  map: ['items', 'maxItems'],
  fanout: ['items', 'maxItems', 'concurrency'],
  while: ['input', 'condition', 'update', 'maxIterations'],
  stream: ['stream', 'version', 'filter'],
  postgres: ['postgres'],
  database: ['database', 'operation', 'run'],
  disk: ['disk'],
  shell: ['computer', 'command'],
  device: ['operation'],
  agent: ['agent', 'prompt'],
  email: ['from', 'to', 'subject'],
  parallel: ['operation', 'objective'],
}

/** Upstream APIs define response shape; user `schema:` is not allowed. */
const VENDOR_MANAGED_SCHEMA_TYPES = new Set([
  'scrape',
  'search',
  'parallel',
  'email',
  'disk',
  'shell',
  'device',
])

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(
  name: string,
  range: SourceRange,
  kind: string,
): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)

  if (result.success) {
    return []
  }

  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

function validateNodeType(typeVal: string, range: SourceRange): Diagnostic[] {
  if (typeVal === 'workflow') {
    return []
  }

  const result = nodeTypeSchema.safeParse(typeVal)

  if (result.success) {
    return []
  }

  return [
    diag(
      `Invalid node type "${typeVal}". Must be one of: ${Object.keys(
        nodeTypeMap,
      )
        .sort()
        .join(', ')}`,
      range,
    ),
  ]
}

function dagValidation(
  nodes: NodeDecl[],
  edges: EdgeDecl[],
  graphRange: SourceRange,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const nodeNames = new Set(nodes.map((n) => n.name))
  const inDegree = new Map<string, number>()
  const adjacentList = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.name, 0)
    adjacentList.set(n.name, [])
  }

  for (const edge of edges) {
    if (!nodeNames.has(edge.source)) {
      out.push(
        diag(
          `Edge references non-existent source node "${edge.source}"`,
          edge.range,
        ),
      )
    }
    if (!nodeNames.has(edge.target)) {
      out.push(
        diag(
          `Edge references non-existent target node "${edge.target}"`,
          edge.range,
        ),
      )
    }
    if (edge.source === edge.target) {
      out.push(diag('Edge cannot connect a node to itself', edge.range))
    }
    if (
      nodeNames.has(edge.source) &&
      nodeNames.has(edge.target) &&
      edge.source !== edge.target
    ) {
      adjacentList.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    }
  }

  const roots = [...inDegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)

  if (roots.length === 0 && nodes.length > 0) {
    out.push(
      diag(
        'Workflow must have exactly one root node (no incoming edges), but none were found. Check for cycles.',
        graphRange,
      ),
    )
  }
  if (roots.length > 1) {
    out.push(
      diag(
        `Workflow must have exactly one root node, but found ${roots.length}: ${roots.join(', ')}`,
        graphRange,
      ),
    )
  }

  if (roots.length === 1) {
    const rootName = roots[0]
    if (rootName !== undefined) {
      const entryNode = nodes.find((n) => n.name === rootName)
      if (!entryNode?.isRoot) {
        out.push(
          diag(
            `Workflow must declare root { } as the entry node; the node with no incoming edges must be the root block (found "${rootName}" instead).`,
            graphRange,
          ),
        )
      }
    }
  }

  const sorted: string[] = []
  const queue = [...roots]
  const inDegreeCopy = new Map(inDegree)
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) {
      break
    }
    sorted.push(current)

    for (const neighbor of adjacentList.get(current) ?? []) {
      const newDegree = (inDegreeCopy.get(neighbor) ?? 0) - 1
      inDegreeCopy.set(neighbor, newDegree)

      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }
  if (sorted.length !== nodes.length && nodes.length > 0) {
    out.push(
      diag(
        'Workflow contains a cycle - DAG workflows cannot have cycles',
        graphRange,
      ),
    )
  }

  return out
}

function loopRootMustHaveInputSchema(
  bodyNodes: NodeDecl[],
  range: SourceRange,
): Diagnostic[] {
  const root = bodyNodes.find((n) => n.isRoot)
  const hasLiteral =
    root?.inputSchema &&
    typeof root.inputSchema === 'object' &&
    !Array.isArray(root.inputSchema)
  const hasRef =
    root?.inputSchemaRef !== undefined && root.inputSchemaRef !== ''
  if (!hasLiteral && !hasRef) {
    return [
      diag(
        'map/fanout/while subgraph root must declare inputSchema for typed iteration',
        range,
      ),
    ]
  }
  return []
}

function workflowRefFromConfigFields(
  configFields: Record<string, ConfigValue>,
): { name: string; range: SourceRange } | undefined {
  const cv = configFields.workflow ?? configFields.graph
  if (cv?.kind === 'string' && String(cv.value).trim() !== '') {
    return { name: String(cv.value).trim(), range: cv.range }
  }
  return undefined
}

/**
 * Per-node `auth`/`connection` checks: undefined-reference resolution, the
 * http-only restriction, and the auth/connection mutual exclusion. Runs over a
 * single node so it can be applied to both top-level workflow nodes and nodes
 * nested inside map/fanout/while `subgraph { }` blocks.
 */
function validateNodeAuthConnection(
  node: NodeDecl,
  authNameLookup: Set<string>,
  connectionNameLookup: Set<string>,
  networkNameLookup: Set<string>,
): Diagnostic[] {
  const out: Diagnostic[] = []

  if (node.type === 'http' && 'auth' in node.configFields) {
    const authCv = node.configFields.auth
    const authName = configStringValue(authCv)

    if (authCv !== undefined && authName === undefined) {
      out.push(
        diag(
          'HTTP node "auth" must be a connection or auth block name',
          authCv.range,
        ),
      )
    } else if (authName !== undefined && !authNameLookup.has(authName)) {
      out.push(
        diag(
          `HTTP node references undefined auth block "${authName}"`,
          authCv?.range ?? node.range,
        ),
      )
    }
  }

  if (node.type !== 'http' && 'auth' in node.configFields) {
    out.push(diag('"auth" is only valid on http nodes', node.range))
  }

  if (node.type === 'http' && 'connection' in node.configFields) {
    const connCv = node.configFields.connection
    const connName = configStringValue(connCv)

    if (connCv !== undefined && connName === undefined) {
      out.push(
        diag(
          'HTTP node "connection" must be a connection block name',
          connCv.range,
        ),
      )
    } else if (connName !== undefined && !connectionNameLookup.has(connName)) {
      out.push(
        diag(
          `HTTP node references undefined connection "${connName}"`,
          connCv?.range ?? node.range,
        ),
      )
    }
  }

  if (node.type === 'integration' && 'connection' in node.configFields) {
    const connCv = node.configFields.connection
    const connName = configStringValue(connCv)

    if (connCv !== undefined && connName === undefined) {
      out.push(
        diag(
          'Integration node "connection" must be a connection block name',
          connCv.range,
        ),
      )
    } else if (connName !== undefined && !connectionNameLookup.has(connName)) {
      out.push(
        diag(
          `Integration node references undefined connection "${connName}"`,
          connCv?.range ?? node.range,
        ),
      )
    }
  }

  if (
    node.type !== 'http' &&
    node.type !== 'integration' &&
    'connection' in node.configFields
  ) {
    out.push(
      diag(
        '"connection" is only valid on http and integration nodes',
        node.range,
      ),
    )
  }

  if ('auth' in node.configFields && 'connection' in node.configFields) {
    out.push(
      diag(
        `Node "${node.name}": set "auth" or "connection", not both. Use "auth" for your own credentials, "connection" for a Swirls-brokered grant.`,
        node.configFields.connection?.range ?? node.range,
      ),
    )
  }

  if ('network' in node.configFields) {
    const networkValue = node.configFields.network
    const networkName = configStringValue(networkValue)
    if (node.type !== 'http') {
      out.push(
        diag(
          '"network" is only valid on http nodes; use the network field on the addressable resource for MCP, connections, or Postgres',
          networkValue?.range ?? node.range,
        ),
      )
    } else if (!networkName) {
      out.push(
        diag(
          'HTTP node "network" must be a network block name',
          networkValue?.range ?? node.range,
        ),
      )
    } else {
      if (!networkNameLookup.has(networkName)) {
        out.push(
          diag(
            `HTTP node references undefined network "${networkName}"`,
            networkValue?.range ?? node.range,
          ),
        )
      }
      const urlValue = node.configFields.url
      if (urlValue?.kind !== 'string') {
        out.push(
          diag(
            'Network-aware HTTP nodes require a static absolute url; dynamic @ts destinations are not supported',
            urlValue?.range ?? node.range,
          ),
        )
      } else {
        try {
          const parsed = new URL(urlValue.value)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            out.push(
              diag(
                'Network-aware HTTP node url must use http or https',
                urlValue.range,
              ),
            )
          }
        } catch {
          out.push(
            diag(
              'Network-aware HTTP nodes require a valid absolute url',
              urlValue.range,
            ),
          )
        }
      }
    }
  }

  return out
}

/**
 * Validates loop orchestration nodes: one child graph, caps, and root schema.
 */
function validateMapWhileNode(
  node: NodeDecl,
  ast: SwirlsFile,
  workflowNames: Set<string>,
  authNameLookup: Set<string>,
  connectionNameLookup: Set<string>,
  networkNameLookup: Set<string>,
  workspace?: WorkspaceResourceIndex,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const hasSubgraph = node.subgraph != null
  const workflowRef = workflowRefFromConfigFields(node.configFields)
  const workflowName = workflowRef?.name
  const hasWorkflowRef = workflowName !== undefined

  if (hasSubgraph === hasWorkflowRef) {
    out.push(
      diag(
        `${node.type} node requires exactly one of subgraph { } or workflow: <name>`,
        node.range,
      ),
    )
    return out
  }

  if (hasSubgraph && node.subgraph) {
    out.push(
      ...dagValidation(
        node.subgraph.nodes,
        node.subgraph.edges,
        node.subgraph.range,
      ),
    )
    out.push(
      ...loopRootMustHaveInputSchema(node.subgraph.nodes, node.subgraph.range),
    )

    // Subgraph nodes are not visited by the top-level node loop, so run the
    // per-node auth/connection checks here too (recursively for nested loops).
    for (const sub of node.subgraph.nodes) {
      out.push(
        ...validateNodeAuthConnection(
          sub,
          authNameLookup,
          connectionNameLookup,
          networkNameLookup,
        ),
      )
      if (sub.type === 'map' || sub.type === 'fanout' || sub.type === 'while') {
        out.push(
          ...validateMapWhileNode(
            sub,
            ast,
            workflowNames,
            authNameLookup,
            connectionNameLookup,
            networkNameLookup,
            workspace,
          ),
        )
      }
    }
  }

  if (hasWorkflowRef && workflowName) {
    if (!workflowNames.has(workflowName)) {
      out.push(
        diag(
          `Node references workflow "${workflowName}" which is not defined`,
          workflowRef?.range ?? node.range,
        ),
      )
    } else {
      const w =
        (ast.workflows.find((x) => x.name === workflowName) as
          | WorkflowDecl
          | undefined) ?? workspace?.workflowBlocks.get(workflowName)
      if (w) {
        out.push(...loopRootMustHaveInputSchema(w.nodes, w.range))
      }
    }
  }

  if (node.type === 'map') {
    const maxCv = node.configFields.maxItems
    if (
      !maxCv ||
      maxCv.kind !== 'number' ||
      typeof maxCv.value !== 'number' ||
      maxCv.value < 1
    ) {
      out.push(
        diag(
          'map node requires maxItems as a positive number',
          maxCv?.range ?? node.range,
        ),
      )
    }
    const conc = node.configFields.concurrency
    if (conc !== undefined) {
      out.push(
        diag(
          'map node concurrency is not supported; use type: fanout for concurrent iteration',
          conc.range,
        ),
      )
    }
  }

  if (node.type === 'fanout') {
    const maxCv = node.configFields.maxItems
    if (
      !maxCv ||
      maxCv.kind !== 'number' ||
      typeof maxCv.value !== 'number' ||
      maxCv.value < 1 ||
      !Number.isInteger(maxCv.value)
    ) {
      out.push(
        diag(
          'fanout node requires maxItems as a positive integer',
          maxCv?.range ?? node.range,
        ),
      )
    }
    const conc = node.configFields.concurrency
    if (
      !conc ||
      conc.kind !== 'number' ||
      typeof conc.value !== 'number' ||
      conc.value < 1 ||
      conc.value > 64 ||
      !Number.isInteger(conc.value)
    ) {
      out.push(
        diag(
          'fanout node requires concurrency as an integer between 1 and 64',
          conc?.range ?? node.range,
        ),
      )
    }
  }

  if (node.type === 'while') {
    const maxIt = node.configFields.maxIterations
    if (
      !maxIt ||
      maxIt.kind !== 'number' ||
      typeof maxIt.value !== 'number' ||
      maxIt.value < 1 ||
      !Number.isInteger(maxIt.value)
    ) {
      out.push(
        diag(
          'while node requires maxIterations as a positive integer',
          maxIt?.range ?? node.range,
        ),
      )
    }
  }

  return out
}

/** Options for {@link validate} when checking a file as part of a multi-file workspace. */
export type ValidateOptions = {
  /**
   * Workspace-wide resource index (doctor, deploy, CLI). When set, references resolve
   * across all `.swirls` files in the scan.
   */
  workspace?: WorkspaceResourceIndex
  /**
   * LSP-only. An unbound `computer` is valid at doctor and deploy; the editor warns.
   */
  includeUnboundComputerWarnings?: boolean
  /**
   * The embedding runtime's provider catalog and `@openui` support. Without it
   * those runtime-specific checks are skipped.
   */
  host?: LanguageHost
}

export function validate(
  ast: SwirlsFile,
  options?: ValidateOptions,
): Diagnostic[] {
  const out: Diagnostic[] = []

  const workspace = options?.workspace
  const host = options?.host

  for (const sd of ast.schemas ?? []) {
    out.push(...validateResourceName(sd.name, sd.range, 'Schema'))
  }

  out.push(
    ...validateSchemaFieldRefs(ast, {
      workspaceSchemaNames: workspace
        ? new Set(workspace.schemas.keys())
        : undefined,
    }),
  )
  const namedSchemaResolution = resolveNamedSchemasFromDecls(ast.schemas ?? [])
  out.push(...namedSchemaResolution.diagnostics)
  const resolvedSchemaLiterals = namedSchemaResolution.map

  const formNames = new Set(ast.forms.map((f) => f.name))
  const webhookNames = new Set(ast.webhooks.map((w) => w.name))
  const scheduleNames = new Set(ast.schedules.map((s) => s.name))
  const workflowNames = new Set(ast.workflows.map((g) => g.name))
  const workflowNameLookup = nameLookup(workflowNames, workspace?.workflows)
  const formNameLookup = nameLookup(formNames, workspace?.forms)
  const webhookNameLookup = nameLookup(webhookNames, workspace?.webhooks)
  const scheduleNameLookup = nameLookup(scheduleNames, workspace?.schedules)
  const localStreamNames = new Set((ast.streams ?? []).map((s) => s.name))
  const streamNameLookup = nameLookup(localStreamNames, workspace?.streams)
  const secretsBlocks = ast.secrets ?? []
  const authBlocks = ast.auths ?? []
  const secretsByName = new Map<
    string,
    {
      vars: string[]
      range: SourceRange
      type?: SecretsDecl['type']
    }
  >()
  const authNames = new Set(authBlocks.map((a) => a.name))
  const authNameLookup = nameLookup(authNames, workspace?.auths)

  const connectionBlocks = ast.connections ?? []
  const connectionNames = new Set(connectionBlocks.map((c) => c.name))
  const connectionNameLookup = nameLookup(
    connectionNames,
    workspace?.connections,
  )
  const networkNameLookup = nameLookup(
    new Set((ast.networks ?? []).map((network) => network.name)),
    workspace?.networks,
  )
  for (const c of connectionBlocks) {
    out.push(...validateResourceName(c.name, c.range, 'Connection block'))
  }
  out.push(...validateConnectionBlocks(ast, { workspace, host }))
  out.push(...validateActionBlocks(ast, { host }))

  /** Var name → first secret block that declares it (for vendor-key declaration checks). */
  const declaredVendorVars = collectDeclaredVendorVars(secretsBlocks, workspace)

  for (const s of secretsBlocks) {
    out.push(...validateResourceName(s.name, s.range, 'Secret block'))
    const sameName = secretsBlocks.filter((x) => x.name === s.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate secret block name "${s.name}"`, s.range))
    }

    for (const v of s.vars) {
      if (!SECRET_KEY_PATTERN.test(v)) {
        out.push(
          diag(
            `Invalid var "${v}" in secret block (use only letters, digits, and underscore)`,
            s.range,
          ),
        )
      }
    }

    out.push(...validateManagedSecretBlock(s, diag))

    secretsByName.set(s.name, { vars: s.vars, range: s.range, type: s.type })
  }

  for (const s of secretsBlocks) {
    const seenInBlock = new Set<string>()
    for (const v of s.vars) {
      if (!SECRET_KEY_PATTERN.test(v)) {
        continue
      }
      if (seenInBlock.has(v)) {
        out.push(
          diag(`Duplicate var "${v}" in secret block "${s.name}"`, s.range),
        )
        continue
      }
      seenInBlock.add(v)
    }
  }

  function secretDeclFor(
    blockName: string,
  ):
    | { vars: string[]; range: SourceRange; type?: SecretsDecl['type'] }
    | undefined {
    const local = secretsByName.get(blockName)
    if (local) {
      return local
    }
    const w = workspace?.secrets.get(blockName)
    if (!w) {
      return undefined
    }
    const site = w.sites[0]
    const line = site?.line ?? 0
    const range: SourceRange = {
      start: { line, column: 0, offset: 0 },
      end: { line, column: 0, offset: 0 },
    }
    return { vars: w.vars, range, type: w.type }
  }

  for (const a of authBlocks) {
    out.push(...validateResourceName(a.name, a.range, 'Auth block'))
    const sameName = authBlocks.filter((x) => x.name === a.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate auth block name "${a.name}"`, a.range))
    }

    if (!a.authType || !AUTH_TYPES.has(a.authType)) {
      out.push(
        diag(
          `Auth block "${a.name}" requires type: oauth, api_key, basic, or bearer`,
          a.range,
        ),
      )
    }

    if (a.secretsRef !== undefined && a.secretsRef !== '') {
      if (!secretDeclFor(a.secretsRef)) {
        out.push(
          diag(
            `Auth "${a.name}" references undefined secret block "${a.secretsRef}"`,
            a.range,
          ),
        )
      }
    }

    const varsInBlock =
      a.secretsRef !== undefined && a.secretsRef !== ''
        ? (() => {
            const d = secretDeclFor(a.secretsRef)
            return d ? new Set(d.vars) : null
          })()
        : null

    if (a.authType && AUTH_TYPES.has(a.authType)) {
      out.push(...validateAuthBlockFields(a, varsInBlock))
    }
  }

  // Local auth-type lookup for form `auth:` validation. Cross-file references
  // are presence-checked via `authNameLookup`; the type check (must be
  // `basic`) only runs when the auth block lives in this file. Deploy /
  // workspace validation does a stricter check once it has the full AST set.
  const localAuthsByName = new Map<string, AuthDecl>()
  for (const a of authBlocks) {
    localAuthsByName.set(a.name, a)
  }

  for (const forms of ast.forms) {
    out.push(...validateResourceName(forms.name, forms.range, 'Form'))
    const sameName = ast.forms.filter((x) => x.name === forms.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate form name "${forms.name}"`, forms.range))
    }

    if (forms.authRef) {
      const { name: authName, range } = forms.authRef
      if (!authNameLookup.has(authName)) {
        out.push(
          diag(
            `Form "${forms.name}" references undefined auth block "${authName}"`,
            range,
          ),
        )
      } else {
        const local = localAuthsByName.get(authName)
        if (local && local.authType !== 'basic') {
          out.push(
            diag(
              `Form "${forms.name}" auth block "${authName}" must have type \`basic\` (found \`${local.authType}\`)`,
              range,
            ),
          )
        }
      }
    }
  }

  for (const webhook of ast.webhooks) {
    out.push(...validateResourceName(webhook.name, webhook.range, 'Webhook'))
    const sameName = ast.webhooks.filter((x) => x.name === webhook.name)

    if (sameName.length > 1) {
      out.push(diag(`Duplicate webhook name "${webhook.name}"`, webhook.range))
    }

    const hasSecret = webhook.secretRef !== undefined
    const hasHeader = webhook.header !== undefined

    if (hasSecret !== hasHeader) {
      const offender =
        webhook.secretRef?.range ?? webhook.header?.range ?? webhook.range
      const missing = hasSecret ? 'header' : 'secret'
      out.push(
        diag(
          `Webhook "${webhook.name}" has "${hasSecret ? 'secret' : 'header'}" but is missing "${missing}". Both must be set to require request verification, or neither for an explicitly unauthenticated endpoint.`,
          offender,
        ),
      )
    }

    if (!hasSecret && !hasHeader) {
      out.push(
        diag(
          `Webhook "${webhook.name}" has no "secret" or "header" set and will accept any POST without verification.`,
          webhook.range,
          'warning',
        ),
      )
    }

    if (webhook.header) {
      const lower = webhook.header.value.trim().toLowerCase()
      if (!lower) {
        out.push(
          diag(
            `Webhook "${webhook.name}" header name must not be empty`,
            webhook.header.range,
          ),
        )
      } else if (RESERVED_WEBHOOK_HEADERS.has(lower)) {
        out.push(
          diag(
            `Webhook "${webhook.name}" header "${webhook.header.value}" is reserved and cannot be used for authentication. Choose a custom header name.`,
            webhook.header.range,
          ),
        )
      }
    }

    if (webhook.secretRef) {
      const { blockName, varName, range } = webhook.secretRef
      const decl = secretsByName.get(blockName)

      if (!decl) {
        out.push(
          diag(
            `Webhook "${webhook.name}" references undefined secret block "${blockName}"`,
            range,
          ),
        )
      } else if (!decl.vars.includes(varName)) {
        out.push(
          diag(
            `Webhook "${webhook.name}" references var "${varName}" not declared in secret block "${blockName}" (declared: ${decl.vars.join(', ') || '(none)'})`,
            range,
          ),
        )
      }
    }
  }

  for (const schedule of ast.schedules) {
    out.push(...validateResourceName(schedule.name, schedule.range, 'Schedule'))
    const sameName = ast.schedules.filter((x) => x.name === schedule.name)

    if (sameName.length > 1) {
      out.push(
        diag(`Duplicate schedule name "${schedule.name}"`, schedule.range),
      )
    }
  }

  out.push(...validateStreamBlocks(ast, { workspace }))

  out.push(...validateViewBlocks(ast, { workspace }))

  out.push(...validateAppBlocks(ast, { workspace, host }))

  out.push(...validateNetworkBlocks(ast, { workspace }))

  const mockSchemaLiterals = new Map<string, JsonSchemaLiteral>(
    workspace?.schemaLiterals ?? [],
  )
  for (const [name, lit] of resolvedSchemaLiterals) {
    mockSchemaLiterals.set(name, lit)
  }
  out.push(
    ...validateMockBlocks(ast, {
      workspace,
      schemaLiterals: mockSchemaLiterals,
    }),
  )

  out.push(...validatePlaybookBlocks(ast, workspace))

  for (const connection of ast.connections ?? []) {
    out.push(
      ...validateNetworkConsumerReference({
        owner: `Connection "${connection.name}"`,
        network: connection.networkRef,
        range: connection.networkRefRange,
        ast,
        workspace,
      }),
    )
    if (
      connection.networkRef &&
      (connection.baseUrl == null || connection.authRef == null)
    ) {
      out.push(
        diag(
          `Connection "${connection.name}" can use a network only in self-managed mode with base_url and auth`,
          connection.networkRefRange ?? connection.range,
        ),
      )
    }
  }
  for (const mcp of ast.mcp ?? []) {
    out.push(
      ...validateNetworkConsumerReference({
        owner: `MCP block "${mcp.name}"`,
        network: mcp.networkRef,
        range: mcp.networkRefRange,
        ast,
        workspace,
      }),
    )
  }
  for (const postgres of ast.postgres ?? []) {
    out.push(
      ...validateNetworkConsumerReference({
        owner: `Postgres block "${postgres.name}"`,
        network: postgres.networkRef,
        range: postgres.networkRefRange,
        ast,
        workspace,
      }),
    )
  }

  for (const workflow of ast.workflows) {
    out.push(...validateResourceName(workflow.name, workflow.range, 'Workflow'))
    if (
      workflow.concurrency !== undefined &&
      (!Number.isInteger(workflow.concurrency) ||
        workflow.concurrency < 1 ||
        workflow.concurrency > 64)
    ) {
      out.push(
        diag(
          'Workflow concurrency must be an integer between 1 and 64',
          workflow.range,
        ),
      )
    }
    if (workflow.executionTokenTtl !== undefined) {
      const seconds = parseDurationSeconds(workflow.executionTokenTtl)
      if (seconds === null) {
        out.push(
          diag(
            `Workflow executionTokenTtl must be ${DURATION_SYNTAX_HINT}`,
            workflow.range,
          ),
        )
      } else if (seconds < 5 * 60 || seconds > 24 * 60 * 60) {
        out.push(
          diag(
            'Workflow executionTokenTtl must be between 5m and 24h',
            workflow.range,
          ),
        )
      }
    }
    const sameName = ast.workflows.filter((x) => x.name === workflow.name)

    if (sameName.length > 1) {
      out.push(
        diag(`Duplicate workflow name "${workflow.name}"`, workflow.range),
      )
    }

    const nodeNameSet = new Set<string>()

    for (const node of workflow.nodes) {
      out.push(...validateResourceName(node.name, node.range, 'Node'))
      out.push(...validateNodeType(node.type, node.range))

      if (nodeNameSet.has(node.name)) {
        out.push(
          diag(`Duplicate node name "${node.name}" in workflow`, node.range),
        )
      }

      nodeNameSet.add(node.name)

      out.push(
        ...validateInferredVendorKeyDeclaration(node, declaredVendorVars, diag),
      )

      if (node.outputFormat != null && node.outputFormat.trim() !== '') {
        const parsedFmt = outputFormatSchema.safeParse(node.outputFormat.trim())
        if (!parsedFmt.success) {
          out.push(
            diag(
              `Invalid output format "${node.outputFormat}". Use one of: markdown, html, text, image, video, audio, mixed, json.`,
              node.range,
            ),
          )
        } else {
          const resolvedOut = resolvedOutputSchemaLiteralForNode(
            node,
            resolvedSchemaLiterals,
          )
          if (
            resolvedOut != null &&
            parsedFmt.data !== 'json' &&
            parsedFmt.data !== 'mixed' &&
            !schemaCompatibleWithOutputFormat(resolvedOut, parsedFmt.data)
          ) {
            out.push(
              diag(
                `Output schema is incompatible with format "${parsedFmt.data}" (expect top-level string, a { markdown | html | text | url } string field, or contentMediaType hint).`,
                node.outputSchemaBlock?.innerRange ??
                  node.outputSchemaRefRange ??
                  node.range,
              ),
            )
          }
        }
      }

      if (node.secretsMap !== undefined) {
        for (const [blockName, vars] of Object.entries(node.secretsMap)) {
          if (!SECRET_KEY_PATTERN.test(blockName)) {
            out.push(
              diag(
                `Invalid secret block key "${blockName}" in secrets map (use only letters, digits, and underscore)`,
                node.range,
              ),
            )
            continue
          }

          const decl = secretDeclFor(blockName)

          if (!decl) {
            out.push(
              diag(
                `Node references undefined secret block "${blockName}" in secrets map`,
                node.range,
              ),
            )
            continue
          }

          const allowed = new Set(decl.vars)

          for (const v of vars) {
            if (!SECRET_KEY_PATTERN.test(v)) {
              out.push(
                diag(
                  `Invalid secret var "${v}" for block "${blockName}" (use only letters, digits, and underscore)`,
                  node.range,
                ),
              )
              continue
            }

            if (!allowed.has(v)) {
              out.push(
                diag(
                  `Secret block "${blockName}" has no var "${v}" (declared vars: ${decl.vars.join(', ')})`,
                  node.range,
                ),
              )
            }
          }
        }
      }

      out.push(
        ...validateNodeAuthConnection(
          node,
          authNameLookup,
          connectionNameLookup,
          networkNameLookup,
        ),
      )

      const required = NODE_TYPE_REQUIRED_FIELDS[node.type]

      if (required) {
        for (const field of required) {
          const has =
            field === 'code' || field === 'prompt'
              ? field in node.configFields
              : field in node.configFields

          if (!has) {
            out.push(
              diag(`Node type "${node.type}" requires "${field}"`, node.range),
            )
          }
        }
      }

      if (
        node.type === 'map' ||
        node.type === 'fanout' ||
        node.type === 'while'
      ) {
        out.push(
          ...validateMapWhileNode(
            node,
            ast,
            workflowNameLookup,
            authNameLookup,
            connectionNameLookup,
            networkNameLookup,
            workspace,
          ),
        )
      }

      if (
        VENDOR_MANAGED_SCHEMA_TYPES.has(node.type) &&
        (node.outputSchema != null || node.outputSchemaRef != null)
      ) {
        out.push(
          diag(
            `"${node.type}" nodes have a vendor-managed output schema; remove "schema" to use the built-in type.`,
            node.outputSchemaBlock?.innerRange ?? node.range,
          ),
        )
      }

      if (node.type === 'stream') {
        if ('streamId' in node.configFields) {
          out.push(
            diag(
              'streamId is no longer supported on stream nodes; use stream (stream block name)',
              node.range,
            ),
          )
        }
        if ('querySql' in node.configFields || 'query' in node.configFields) {
          out.push(
            diag(
              'querySql and query are no longer supported on stream nodes; use filter (@ts returning a filter object)',
              node.range,
            ),
          )
        }

        const streamCv = node.configFields.stream
        const filterCv = node.configFields.filter
        const versionCv = node.configFields.version
        const streamName = configStringValue(streamCv)
        const versionPinRaw = configStringValue(versionCv)
        let streamDecl: (typeof ast.streams)[number] | undefined

        if (streamName !== undefined && streamName.trim() !== '') {
          if (!streamNameLookup.has(streamName)) {
            out.push(
              diag(
                `Stream node references stream block "${streamName}" which is not defined`,
                streamCv?.range ?? node.range,
              ),
            )
          } else {
            streamDecl = (ast.streams ?? []).find((s) => s.name === streamName)
          }
        }

        if (versionPinRaw !== undefined && versionPinRaw.trim() !== '') {
          if (!isValidStreamVersionId(versionPinRaw)) {
            out.push(
              diag(
                `Stream node "version" must be a valid stream version id (e.g. v1), got "${versionPinRaw}"`,
                versionCv?.range ?? node.range,
              ),
            )
          } else if (streamDecl) {
            const hasKey = streamDecl.versions.some(
              (v) => v.key === versionPinRaw,
            )
            if (!hasKey) {
              out.push(
                diag(
                  `Stream node pins version "${versionPinRaw}" but stream "${streamName}" does not declare that version under versions { }`,
                  versionCv?.range ?? node.range,
                ),
              )
            }
          }
        }

        if (filterCv) {
          if (filterCv.kind === 'ts_block') {
            if (!filterCv.code.trim()) {
              out.push(
                diag(
                  'Stream node filter must be a non-empty @ts block',
                  filterCv.range,
                ),
              )
            }
          } else if (filterCv.kind !== 'ts_file_ref') {
            out.push(
              diag(
                'Stream node "filter" must be an @ts block or @ts "file.ts.swirls" reference',
                filterCv.range ?? node.range,
              ),
            )
          }
        }
      }

      if (node.type === 'parallel') {
        const opCv = node.configFields.operation
        const opVal = configStringValue(opCv)
        if (
          opVal !== undefined &&
          opVal !== 'search' &&
          opVal !== 'extract' &&
          opVal !== 'findall'
        ) {
          out.push(
            diag(
              `Parallel "operation" must be "search", "extract", or "findall", got "${opVal}"`,
              opCv?.range ?? node.range,
            ),
          )
        }
        if (opVal === 'search' && !('searchQueries' in node.configFields)) {
          out.push(diag('Parallel search requires "searchQueries"', node.range))
        }
        if (opVal === 'extract' && !('urls' in node.configFields)) {
          out.push(diag('Parallel extract requires "urls"', node.range))
        }
        if (opVal === 'findall') {
          if (!('entityType' in node.configFields)) {
            out.push(diag('Parallel findall requires "entityType"', node.range))
          }
          if (!('generator' in node.configFields)) {
            out.push(diag('Parallel findall requires "generator"', node.range))
          }
          if (!('matchConditions' in node.configFields)) {
            out.push(
              diag('Parallel findall requires "matchConditions"', node.range),
            )
          }
          if (!('matchLimit' in node.configFields)) {
            out.push(diag('Parallel findall requires "matchLimit"', node.range))
          }
        }
      }

      if (node.type === 'search') {
        const providerCv = node.configFields.provider
        if (
          providerCv &&
          (providerCv.kind !== 'string' ||
            !searchProviderSchema.safeParse(providerCv.value).success)
        ) {
          out.push(
            diag(
              'Search "provider" must be firecrawl or telem',
              providerCv.range ?? node.range,
            ),
          )
        }
        if (providerCv?.kind === 'string' && providerCv.value === 'telem') {
          for (const field of TELEM_UNSUPPORTED_SEARCH_FIELDS) {
            const cv = node.configFields[field]
            if (cv) {
              out.push(
                diag(
                  `Search "${field}" is not supported by Telem yet; use provider: firecrawl`,
                  cv.range ?? node.range,
                ),
              )
            }
          }
          const sources = node.configFields.sources
          if (
            sources &&
            (sources.kind !== 'array' ||
              sources.value.length !== 1 ||
              sources.value[0]?.kind !== 'string' ||
              sources.value[0].value !== 'web')
          ) {
            out.push(
              diag(
                'Telem search only supports sources: ["web"]; use provider: firecrawl for other sources',
                sources.range ?? node.range,
              ),
            )
          }
        }
        const SEARCH_SOURCES = new Set(['web', 'news', 'images'])
        const SEARCH_CATEGORIES = new Set(['github', 'research', 'pdf'])

        const validateStringEnumArray = (
          field: string,
          allowed: Set<string>,
          label: string,
        ) => {
          const cv = node.configFields[field]
          if (!cv) {
            return
          }
          if (cv.kind !== 'array') {
            out.push(
              diag(
                `Search "${field}" must be an array of strings`,
                cv.range ?? node.range,
              ),
            )
            return
          }
          for (const item of cv.value) {
            if (item.kind !== 'string') {
              out.push(
                diag(
                  `Search "${field}" entries must be strings`,
                  item.range ?? cv.range ?? node.range,
                ),
              )
              continue
            }
            if (!allowed.has(item.value)) {
              out.push(
                diag(
                  `Invalid search ${label} "${item.value}". Must be one of: ${[...allowed].join(', ')}`,
                  item.range,
                ),
              )
            }
          }
        }

        validateStringEnumArray('sources', SEARCH_SOURCES, 'source')
        validateStringEnumArray('categories', SEARCH_CATEGORIES, 'category')

        for (const field of [
          'includeDomains',
          'excludeDomains',
          'scrapeFormats',
        ] as const) {
          const cv = node.configFields[field]
          if (!cv) {
            continue
          }
          if (cv.kind !== 'array') {
            out.push(
              diag(
                `Search "${field}" must be an array of strings`,
                cv.range ?? node.range,
              ),
            )
            continue
          }
          for (const item of cv.value) {
            if (item.kind !== 'string') {
              out.push(
                diag(
                  `Search "${field}" entries must be strings`,
                  item.range ?? cv.range ?? node.range,
                ),
              )
            }
          }
        }

        const limitCv = node.configFields.limit
        if (limitCv) {
          if (limitCv.kind !== 'number') {
            out.push(
              diag(
                'Search "limit" must be a number',
                limitCv.range ?? node.range,
              ),
            )
          } else if (
            !Number.isFinite(limitCv.value) ||
            limitCv.value < 1 ||
            limitCv.value > 20
          ) {
            out.push(
              diag(
                'Search "limit" must be an integer between 1 and 20',
                limitCv.range ?? node.range,
              ),
            )
          }
        }
      }

      if (node.type === 'workflow' || node.type === 'graph') {
        const workflowRef = workflowRefFromConfigFields(node.configFields)

        if (!workflowRef) {
          out.push(diag('Workflow node requires "workflow"', node.range))
        } else if (!workflowNameLookup.has(workflowRef.name)) {
          out.push(
            diag(
              `Workflow node references workflow "${workflowRef.name}" which is not defined`,
              workflowRef.range,
            ),
          )
        }
      }

      if (node.type === 'ai') {
        const kindCv = node.configFields.kind
        const kindVal =
          kindCv && kindCv.kind === 'string' ? kindCv.value : undefined
        if (kindVal !== undefined && kindCv) {
          const kindResult = aiKindSchema.safeParse(kindVal)
          if (!kindResult.success) {
            const range = kindCv.range
            out.push(
              diag(
                `Invalid ai kind "${kindVal}". Must be one of: text, object, image, video, embed`,
                range,
              ),
            )
          }
        }

        if (
          kindVal === 'text' &&
          (node.outputSchema != null || node.outputSchemaRef != null)
        ) {
          out.push(
            diag(
              'AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.',
              node.outputSchemaBlock?.innerRange ?? node.range,
              'warning',
            ),
          )
        }

        const providerCv = node.configFields.provider
        if (providerCv?.kind === 'string' && providerCv.value.trim() !== '') {
          const pv = aiProviderSchema.safeParse(providerCv.value.trim())
          if (!pv.success) {
            out.push(
              diag(
                `Invalid ai provider "${providerCv.value}". Must be one of: openrouter, anthropic, openai, google`,
                providerCv.range,
              ),
            )
          }
        }
      }

      if (
        node.reviewConfig != null &&
        typeof node.reviewConfig === 'object' &&
        !Array.isArray(node.reviewConfig)
      ) {
        const rawRc = node.reviewConfig as Record<string, unknown>
        const { schemaRef: _schemaRef, ...reviewForZod } = rawRc
        const result = reviewConfigSchema.safeParse(reviewForZod)

        if (!result.success) {
          for (const issue of result.error.issues) {
            const path = issue.path.filter(Boolean).join('.')

            const msg = path
              ? `review: ${path} — ${issue.message}`
              : `review: ${issue.message}`

            out.push(diag(msg, node.range))
          }
        }
      }
    }

    out.push(...dagValidation(workflow.nodes, workflow.edges, workflow.range))
    out.push(...validateSwitchFlow(workflow))
  }

  for (const t of ast.triggers) {
    out.push(...validateResourceName(t.name, t.range, 'Trigger'))
    const resourceSet =
      t.resourceType === 'form'
        ? formNameLookup
        : t.resourceType === 'webhook'
          ? webhookNameLookup
          : t.resourceType === 'schedule'
            ? scheduleNameLookup
            : new Set<string>()
    if (!resourceSet.has(t.resourceName)) {
      out.push(
        diag(
          `Trigger references ${t.resourceType} "${t.resourceName}" which is not defined`,
          t.range,
        ),
      )
    }
    if (!workflowNameLookup.has(t.workflowName)) {
      out.push(
        diag(
          `Trigger references workflow "${t.workflowName}" which is not defined`,
          t.range,
        ),
      )
    }
  }

  out.push(...validatePostgresBlocks(ast, { workspace }))
  out.push(...validatePostgresNodes(ast, { workspace }))
  out.push(...validateDatabaseBlocks(ast, { workspace }))
  out.push(...validateDatabaseNodes(ast, { workspace }))
  out.push(...validateMigrationBlocks(ast, { workspace }))
  out.push(...validateIntegrationNodes(ast, { workspace }))
  out.push(...validateDiskBlocks(ast, { workspace }))
  out.push(...validateDiskNodes(ast, { workspace }))
  out.push(
    ...validateComputerBlocks(ast, {
      workspace,
      includeUnboundComputerWarnings: options?.includeUnboundComputerWarnings,
    }),
  )
  out.push(...validateShellNodes(ast, { workspace }))
  out.push(...validateOperationBlocks(ast))
  out.push(...validateDeviceNodes(ast, { workspace }))
  out.push(...validateSkillBlocks(ast, { workspace }))
  out.push(...validateAgentSkillRefs(ast, { workspace }))
  out.push(...validateMcpBlocks(ast, { workspace }))
  out.push(...validateAgentMcpRefs(ast, { workspace }))
  out.push(...validateAgentBlocks(ast, { workspace }))
  out.push(...validateConnectorBlocks(ast, { workspace }))
  out.push(...validateChannelBlocks(ast, { workspace }))
  out.push(...validateQueryBlocks(ast, { workspace }))
  out.push(...validateAgentNodes(ast, { workspace }))
  out.push(...validateDecisions(ast, workspace))

  const roleNamesSeen = new Set<string>()
  for (const role of ast.roles) {
    out.push(...validateResourceName(role.name, role.range, 'Role'))
    if (roleNamesSeen.has(role.name)) {
      out.push(diag(`Duplicate role name "${role.name}"`, role.range))
    }
    roleNamesSeen.add(role.name)
    if (role.match.length === 0) {
      out.push(
        diag(
          `Role "${role.name}" has an empty match { } and will match no principal`,
          role.range,
          'warning',
        ),
      )
    }
  }

  for (const policy of ast.policies) {
    for (const grant of policy.grants) {
      if (
        grant.workflow &&
        !ast.workflows.some((workflow) => workflow.name === grant.workflow) &&
        !workspace?.workflowBlocks.has(grant.workflow)
      ) {
        out.push(
          diag(
            `Policy references unknown workflow "${grant.workflow}"`,
            grant.agentRange,
          ),
        )
      }
    }
  }

  if (ast.policies.length > 1) {
    for (const policy of ast.policies.slice(1)) {
      out.push(
        diag(
          'Only one policy { } block is allowed per workspace',
          policy.range,
        ),
      )
    }
  }

  return out
}
