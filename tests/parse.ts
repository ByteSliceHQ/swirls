/**
 * Parses .swirls files via `swirls export` (AST JSON output).
 * Extracts workflow metadata, secret declarations, trigger mappings, and input
 * schemas — enough to programmatically generate test inputs and determine
 * required environment variables per workflow.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// AST types (subset of what `swirls export` returns)
// ---------------------------------------------------------------------------

interface ASTNode {
  name: string
  type: string
  label?: string
  isRoot?: boolean
  configFields?: Record<string, { kind: string; value?: string }>
}

interface ASTWorkflow {
  name: string
  label?: string
  nodes: ASTNode[]
  edges: { source: string; target: string }[]
  persistence?: { enabled: boolean }
}

interface ASTTrigger {
  name: string
  resourceType: string
  resourceName: string
  workflowName?: string
  graphName?: string
  enabled?: boolean
}

interface ASTSecret {
  name: string
  vars?: string[]
}

interface ASTAuth {
  name: string
  type?: string
  secretsRef?: string
  configFields?: Record<string, { kind: string; value?: string }>
}

interface ASTPostgres {
  name: string
  secretsRef?: string
}

interface ASTForm {
  name: string
  schema?: object
}

interface ASTWebhook {
  name: string
  schema?: object
}

interface ASTFile {
  forms: ASTForm[]
  webhooks: ASTWebhook[]
  schedules: { name: string }[]
  workflows?: ASTWorkflow[]
  graphs?: ASTWorkflow[]
  triggers: ASTTrigger[]
  secrets: ASTSecret[]
  auths: ASTAuth[]
  postgres: ASTPostgres[]
}

// ---------------------------------------------------------------------------
// Export a .swirls file to AST JSON
// ---------------------------------------------------------------------------

function exportFile(filePath: string): ASTFile | null {
  const result = Bun.spawnSync(['swirls', 'export', filePath], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) {
    const err = result.stderr.toString().trim()
    console.error(`swirls export failed for ${filePath}: ${err}`)
    return null
  }
  try {
    return JSON.parse(result.stdout.toString())
  } catch {
    console.error(`Failed to parse JSON from swirls export ${filePath}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowInfo {
  name: string
  file: string
  nodeTypes: Set<string>
  aiKinds: Set<string>
  secretRefs: Set<string>
  authRefs: Set<string>
  postgresRefs: Set<string>
  subgraphRefs: Set<string>
  hasWaitNode: boolean
  hasPersistence: boolean
}

export interface TriggerInfo {
  name: string
  sourceType: 'webhook' | 'form' | 'schedule'
  sourceName: string
  workflowName: string
}

export interface ParsedFile {
  file: string
  workflows: WorkflowInfo[]
  triggers: TriggerInfo[]
  secrets: { name: string; vars: string[] }[]
  auths: { name: string; secretRef: string | null }[]
  postgresDefs: { name: string; secretRef: string | null }[]
  inputSchemas: { name: string; type: 'webhook' | 'form'; schema: object }[]
}

// ---------------------------------------------------------------------------
// Convert AST to ParsedFile
// ---------------------------------------------------------------------------

function astToParsedFile(ast: ASTFile, filename: string): ParsedFile {
  const workflowsSource = ast.workflows ?? ast.graphs ?? []
  const workflows: WorkflowInfo[] = workflowsSource.map((g) => {
    const nodeTypes = new Set(g.nodes.map((n) => n.type))

    const aiKinds = new Set<string>()
    for (const n of g.nodes) {
      if (n.type === 'ai' && n.configFields?.kind?.value) {
        aiKinds.add(n.configFields.kind.value)
      }
    }

    const secretRefs = new Set<string>()
    for (const n of g.nodes) {
      for (const [, field] of Object.entries(n.configFields ?? {})) {
        if (
          field.kind === 'ts_block' &&
          typeof (field as any).code === 'string'
        ) {
          for (const m of (field as any).code.matchAll(
            /context\.secrets\.(\w+)/g,
          )) {
            secretRefs.add(m[1])
          }
        }
      }
    }

    const authRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.configFields?.auth?.value) {
        authRefs.add(n.configFields.auth.value)
      }
    }

    const postgresRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.configFields?.postgres?.value) {
        postgresRefs.add(n.configFields.postgres.value)
      }
    }

    const subgraphRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.type === 'workflow' || n.type === 'graph') {
        const ref =
          n.configFields?.workflow?.value ?? n.configFields?.graph?.value
        if (ref) subgraphRefs.add(ref)
      }
    }

    return {
      name: g.name,
      file: filename,
      nodeTypes,
      aiKinds,
      secretRefs,
      authRefs,
      postgresRefs,
      subgraphRefs,
      hasWaitNode: nodeTypes.has('wait'),
      hasPersistence: !!g.persistence?.enabled,
    }
  })

  const triggers: TriggerInfo[] = ast.triggers.map((t) => ({
    name: t.name,
    sourceType: t.resourceType as TriggerInfo['sourceType'],
    sourceName: t.resourceName,
    workflowName: t.workflowName ?? t.graphName ?? '',
  }))

  const secrets = (ast.secrets ?? []).map((s) => ({
    name: s.name,
    vars: s.vars ?? [],
  }))

  const auths = (ast.auths ?? []).map((a) => ({
    name: a.name,
    secretRef: a.secretsRef ?? null,
  }))

  const postgresDefs = (ast.postgres ?? []).map((p) => ({
    name: p.name,
    secretRef: p.secretsRef ?? null,
  }))

  const inputSchemas: ParsedFile['inputSchemas'] = []
  for (const f of ast.forms ?? []) {
    if (f.schema)
      inputSchemas.push({ name: f.name, type: 'form', schema: f.schema })
  }
  for (const w of ast.webhooks ?? []) {
    if (w.schema)
      inputSchemas.push({ name: w.name, type: 'webhook', schema: w.schema })
  }

  return {
    file: filename,
    workflows,
    triggers,
    secrets,
    auths,
    postgresDefs,
    inputSchemas,
  }
}

// ---------------------------------------------------------------------------
// Generate minimal valid test input from a JSON Schema
// ---------------------------------------------------------------------------

export function generateTestInput(schema: any): any {
  if (!schema || typeof schema !== 'object') return {}

  switch (schema.type) {
    case 'string':
      if (schema.enum) return schema.enum[0]
      if (schema.format === 'email') return 'test@example.com'
      if (schema.format === 'date-time') return new Date().toISOString()
      if (schema.format === 'uri' || schema.format === 'url')
        return 'https://example.com'
      return 'test-value'
    case 'number':
    case 'integer':
      return 42
    case 'boolean':
      return true
    case 'array':
      return schema.items ? [generateTestInput(schema.items)] : []
    case 'object': {
      const obj: Record<string, any> = {}
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateTestInput(propSchema)
        }
      }
      return obj
    }
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Scan cookbook directory
// ---------------------------------------------------------------------------

export function scanCookbookSync(cookbookDir: string): ParsedFile[] {
  const swirlsFiles: string[] = []

  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (entry === 'tests' || entry === '.swirls' || entry === 'node_modules')
        continue
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full, prefix ? `${prefix}/${entry}` : entry)
      } else if (entry.endsWith('.swirls')) {
        swirlsFiles.push(prefix ? `${prefix}/${entry}` : entry)
      }
    }
  }

  walk(cookbookDir, '')
  swirlsFiles.sort()

  const results: ParsedFile[] = []
  for (const f of swirlsFiles) {
    const ast = exportFile(join(cookbookDir, f))
    if (ast) results.push(astToParsedFile(ast, f))
  }
  return results
}

// ---------------------------------------------------------------------------
// Build per-workflow test info
// ---------------------------------------------------------------------------

const IMPLICIT_ENV_VARS: Record<string, string[]> = {
  ai: ['OPENROUTER_API_KEY'],
  resend: ['RESEND_API_KEY'],
  firecrawl: ['FIRECRAWL_API_KEY'],
  email: ['RESEND_API_KEY'],
  scrape: ['FIRECRAWL_API_KEY'],
}

const AI_KIND_ENV_VARS: Record<string, string[]> = {
  embed: ['EMBEDDING_MODEL'],
  image: ['IMAGE_MODEL'],
}

const CLOUD_ONLY_NODE_TYPES = new Set(['bucket', 'stream'])

export interface WorkflowTestInfo {
  name: string
  file: string
  input: any
  requiredEnvVars: Set<string>
  nodeTypes: Set<string>
  aiKinds: Set<string>
  hasWaitNode: boolean
  hasPersistence: boolean
  cloudOnly: boolean
  triggerType: 'webhook' | 'form' | 'schedule' | null
}

export function buildWorkflowTestInfos(
  parsedFiles: ParsedFile[],
): WorkflowTestInfo[] {
  const allSecrets = new Map<string, string[]>()
  const allAuths = new Map<string, string | null>()
  const allPostgres = new Map<string, string | null>()
  const allSchemas = new Map<string, object>()
  const workflowTriggers = new Map<string, TriggerInfo>()
  const workflowMap = new Map<string, WorkflowInfo>()

  for (const pf of parsedFiles) {
    for (const s of pf.secrets) allSecrets.set(s.name, s.vars)
    for (const a of pf.auths) allAuths.set(a.name, a.secretRef)
    for (const p of pf.postgresDefs) allPostgres.set(p.name, p.secretRef)
    for (const s of pf.inputSchemas) allSchemas.set(s.name, s.schema)
    for (const t of pf.triggers) workflowTriggers.set(t.workflowName, t)
    for (const g of pf.workflows) workflowMap.set(g.name, g)
  }

  function resolveEnvVars(
    workflow: WorkflowInfo,
    visited = new Set<string>(),
  ): Set<string> {
    if (visited.has(workflow.name)) return new Set()
    visited.add(workflow.name)

    const vars = new Set<string>()

    for (const nt of workflow.nodeTypes) {
      const implicit = IMPLICIT_ENV_VARS[nt]
      if (implicit) implicit.forEach((v) => vars.add(v))
    }

    for (const kind of workflow.aiKinds) {
      const extra = AI_KIND_ENV_VARS[kind]
      if (extra) extra.forEach((v) => vars.add(v))
    }

    for (const ref of workflow.secretRefs) {
      const sv = allSecrets.get(ref)
      if (sv) sv.forEach((v) => vars.add(v))
    }

    for (const ref of workflow.authRefs) {
      const secretRef = allAuths.get(ref)
      if (secretRef) {
        const sv = allSecrets.get(secretRef)
        if (sv) sv.forEach((v) => vars.add(v))
      }
    }

    for (const ref of workflow.postgresRefs) {
      const secretRef = allPostgres.get(ref)
      if (secretRef) {
        const sv = allSecrets.get(secretRef)
        if (sv) sv.forEach((v) => vars.add(v))
      }
    }

    for (const ref of workflow.subgraphRefs) {
      const sub = workflowMap.get(ref)
      if (sub) {
        for (const v of resolveEnvVars(sub, visited)) vars.add(v)
      }
    }

    return vars
  }

  const results: WorkflowTestInfo[] = []

  for (const pf of parsedFiles) {
    for (const workflow of pf.workflows) {
      const trigger = workflowTriggers.get(workflow.name)

      let input: any = {}
      let triggerType: WorkflowTestInfo['triggerType'] = null

      if (trigger) {
        triggerType = trigger.sourceType
        if (trigger.sourceType === 'webhook' || trigger.sourceType === 'form') {
          const schema = allSchemas.get(trigger.sourceName)
          if (schema) input = generateTestInput(schema)
        }
      }

      results.push({
        name: workflow.name,
        file: workflow.file,
        input,
        requiredEnvVars: resolveEnvVars(workflow),
        nodeTypes: workflow.nodeTypes,
        aiKinds: workflow.aiKinds,
        hasWaitNode: workflow.hasWaitNode,
        hasPersistence: workflow.hasPersistence,
        cloudOnly: [...workflow.nodeTypes].some((t) =>
          CLOUD_ONLY_NODE_TYPES.has(t),
        ),
        triggerType,
      })
    }
  }

  return results
}

/** @deprecated Use buildWorkflowTestInfos */
export const buildGraphTestInfos = buildWorkflowTestInfos
export type GraphTestInfo = WorkflowTestInfo
export type GraphInfo = WorkflowInfo

export function getAvailableEnvVars(cwd: string): Set<string> {
  const result = Bun.spawnSync(['swirls', 'env', 'list'], { cwd })
  const output = result.stdout.toString()
  const vars = new Set<string>()
  for (const m of output.matchAll(/([A-Z][A-Z0-9_]*)=/g)) vars.add(m[1])
  return vars
}
