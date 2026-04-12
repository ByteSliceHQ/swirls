/**
 * Parses .swirls files via `swirls export` (AST JSON output).
 * Extracts graph metadata, secret declarations, trigger mappings, and input
 * schemas — enough to programmatically generate test inputs and determine
 * required environment variables per graph.
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

interface ASTGraph {
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
  graphName: string
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
  graphs: ASTGraph[]
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

export interface GraphInfo {
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
  graphName: string
}

export interface ParsedFile {
  file: string
  graphs: GraphInfo[]
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
  const graphs: GraphInfo[] = ast.graphs.map((g) => {
    const nodeTypes = new Set(g.nodes.map((n) => n.type))

    const aiKinds = new Set<string>()
    for (const n of g.nodes) {
      if (n.type === 'ai' && n.configFields?.kind?.value) {
        aiKinds.add(n.configFields.kind.value)
      }
    }

    // Secret refs from nodes that declare secrets in configFields
    const secretRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.configFields?.secrets) {
        // The secrets field value may contain refs — parse from raw
        // For now, we check the code blocks for context.secrets.<name>
      }
      // Scan all ts_block code for context.secrets.<name>
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

    // Auth refs from nodes
    const authRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.configFields?.auth?.value) {
        authRefs.add(n.configFields.auth.value)
      }
    }

    // Postgres refs from nodes
    const postgresRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.configFields?.postgres?.value) {
        postgresRefs.add(n.configFields.postgres.value)
      }
    }

    // Subgraph refs from graph-type nodes
    const subgraphRefs = new Set<string>()
    for (const n of g.nodes) {
      if (n.type === 'graph' && n.configFields?.graph?.value) {
        subgraphRefs.add(n.configFields.graph.value)
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
    graphName: t.graphName,
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
    graphs,
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
// Build per-graph test info
// ---------------------------------------------------------------------------

/** Node types that implicitly require env vars (not declared via secret blocks). */
const IMPLICIT_ENV_VARS: Record<string, string[]> = {
  ai: ['OPENROUTER_API_KEY'],
  resend: ['RESEND_API_KEY'],
  firecrawl: ['FIRECRAWL_API_KEY'],
}

/** AI node kinds that require additional env vars beyond OPENROUTER_API_KEY. */
const AI_KIND_ENV_VARS: Record<string, string[]> = {
  embed: ['EMBEDDING_MODEL'],
  image: ['IMAGE_MODEL'],
}

/** Node types that require cloud execution and cannot run locally. */
const CLOUD_ONLY_NODE_TYPES = new Set(['bucket', 'stream'])

export interface GraphTestInfo {
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

export function buildGraphTestInfos(
  parsedFiles: ParsedFile[],
): GraphTestInfo[] {
  // Lookup maps across all files
  const allSecrets = new Map<string, string[]>()
  const allAuths = new Map<string, string | null>()
  const allPostgres = new Map<string, string | null>()
  const allSchemas = new Map<string, object>()
  const graphTriggers = new Map<string, TriggerInfo>()
  const graphMap = new Map<string, GraphInfo>()

  for (const pf of parsedFiles) {
    for (const s of pf.secrets) allSecrets.set(s.name, s.vars)
    for (const a of pf.auths) allAuths.set(a.name, a.secretRef)
    for (const p of pf.postgresDefs) allPostgres.set(p.name, p.secretRef)
    for (const s of pf.inputSchemas) allSchemas.set(s.name, s.schema)
    for (const t of pf.triggers) graphTriggers.set(t.graphName, t)
    for (const g of pf.graphs) graphMap.set(g.name, g)
  }

  /** Resolve all env vars a graph requires, including through auth/postgres/subgraph refs. */
  function resolveEnvVars(
    graph: GraphInfo,
    visited = new Set<string>(),
  ): Set<string> {
    if (visited.has(graph.name)) return new Set()
    visited.add(graph.name)

    const vars = new Set<string>()

    for (const nt of graph.nodeTypes) {
      const implicit = IMPLICIT_ENV_VARS[nt]
      if (implicit) implicit.forEach((v) => vars.add(v))
    }

    for (const kind of graph.aiKinds) {
      const extra = AI_KIND_ENV_VARS[kind]
      if (extra) extra.forEach((v) => vars.add(v))
    }

    for (const ref of graph.secretRefs) {
      const sv = allSecrets.get(ref)
      if (sv) sv.forEach((v) => vars.add(v))
    }

    for (const ref of graph.authRefs) {
      const secretRef = allAuths.get(ref)
      if (secretRef) {
        const sv = allSecrets.get(secretRef)
        if (sv) sv.forEach((v) => vars.add(v))
      }
    }

    for (const ref of graph.postgresRefs) {
      const secretRef = allPostgres.get(ref)
      if (secretRef) {
        const sv = allSecrets.get(secretRef)
        if (sv) sv.forEach((v) => vars.add(v))
      }
    }

    for (const ref of graph.subgraphRefs) {
      const sub = graphMap.get(ref)
      if (sub) {
        for (const v of resolveEnvVars(sub, visited)) vars.add(v)
      }
    }

    return vars
  }

  const results: GraphTestInfo[] = []

  for (const pf of parsedFiles) {
    for (const graph of pf.graphs) {
      const trigger = graphTriggers.get(graph.name)

      let input: any = {}
      let triggerType: GraphTestInfo['triggerType'] = null

      if (trigger) {
        triggerType = trigger.sourceType
        if (trigger.sourceType === 'webhook' || trigger.sourceType === 'form') {
          const schema = allSchemas.get(trigger.sourceName)
          if (schema) input = generateTestInput(schema)
        }
      }

      results.push({
        name: graph.name,
        file: graph.file,
        input,
        requiredEnvVars: resolveEnvVars(graph),
        nodeTypes: graph.nodeTypes,
        aiKinds: graph.aiKinds,
        hasWaitNode: graph.hasWaitNode,
        hasPersistence: graph.hasPersistence,
        cloudOnly: [...graph.nodeTypes].some((t) =>
          CLOUD_ONLY_NODE_TYPES.has(t),
        ),
        triggerType,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Read currently-set env vars from `swirls env list`
// ---------------------------------------------------------------------------

export function getAvailableEnvVars(cwd: string): Set<string> {
  const result = Bun.spawnSync(['swirls', 'env', 'list'], { cwd })
  const output = result.stdout.toString()
  const vars = new Set<string>()
  // Output contains Unicode box-drawing chars (│) before each line,
  // so match KEY= anywhere on a line rather than at line start.
  for (const m of output.matchAll(/([A-Z][A-Z0-9_]*)=/g)) vars.add(m[1])
  return vars
}
