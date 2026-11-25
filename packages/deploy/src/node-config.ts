import {
  type ConfigValueKind,
  type NodeType,
  nodeTypeSchema,
  type WorkflowNodeConfig,
  workflowNodeConfigSchema,
} from '@swirls/definition/schemas'
import type { ConfigValue, WorkflowDecl } from '@swirls/language'

/**
 * Executable config fields that may be a plain string or `@ts` / `@sql`.
 *
 * A runtime resolves these fields at execution time, so the definition records
 * which form each one was written in. Fields that must return non-strings
 * (objects, arrays) or that are code-only by design stay off this list.
 */
export const EXECUTABLE_STRING_FIELDS: Partial<Record<NodeType, readonly string[]>> = {
  disk: ['command', 'path', 'file'],
  shell: ['command'],
  device: ['device', 'input'],
  http: ['url', 'body'],
  email: ['from', 'to', 'subject', 'text', 'html', 'replyTo'],
  scrape: ['url'],
  search: ['query', 'location', 'country', 'tbs'],
  ai: ['prompt', 'model'],
  agent: ['prompt', 'system', 'model'],
  decision: ['state', 'model'],
  parallel: ['objective', 'entityType'],
}

function configValueKindFromCv(cv: ConfigValue): ConfigValueKind | undefined {
  switch (cv.kind) {
    case 'string':
      return 'literal'
    case 'ts_block':
    case 'ts_file_ref':
      return 'ts'
    case 'sql_block':
      return 'sql'
    default:
      return undefined
  }
}

/** Build the `configValueKinds` sidecar from a node's parsed `configFields`. */
export function buildConfigValueKindsFromNodeDecl(node: {
  type: string
  configFields: Record<string, ConfigValue>
}): Record<string, ConfigValueKind> | undefined {
  const nodeType = nodeTypeSchema.parse(node.type)
  const fields = EXECUTABLE_STRING_FIELDS[nodeType]

  if (!fields) {
    return undefined
  }

  const kinds: Record<string, ConfigValueKind> = {}

  for (const key of fields) {
    const cv = node.configFields[key]

    if (!cv) {
      continue
    }

    const kind = configValueKindFromCv(cv)

    if (kind) {
      kinds[key] = kind
    }
  }

  return Object.keys(kinds).length > 0 ? kinds : undefined
}

function unwrapConfigValue(cv: ConfigValue): unknown {
  switch (cv.kind) {
    case 'string':
    case 'number':
    case 'null':
    case 'boolean':
      return cv.value
    case 'ts_file_ref':
      throw new Error('ts_file_ref must be inlined before lowering (run inlineTsFileRefs)')
    case 'ts_block':
    case 'sql_block':
      return cv.code

    case 'object': {
      const out: Record<string, unknown> = {}

      for (const [k, v] of Object.entries(cv.value)) {
        out[k] = unwrapConfigValue(v)
      }

      return out
    }

    case 'array':
      return cv.value.map(unwrapConfigValue)
    default:
      return undefined
  }
}

/** Build a node's `config` in the definition from its parsed declaration. */
export function buildWorkflowNodeConfigFromNodeDecl(node: {
  type: string
  configFields: Record<string, ConfigValue>
}): WorkflowNodeConfig {
  const nodeType: NodeType = nodeTypeSchema.parse(node.type)
  const raw: Record<string, unknown> = { type: nodeType }

  for (const [key, cv] of Object.entries(node.configFields)) {
    raw[key] = unwrapConfigValue(cv)
  }

  return workflowNodeConfigSchema.parse(raw)
}

function makeUniqueSynthName(parentName: string, nodeName: string, used: Set<string>): string {
  const base = `${parentName}__${nodeName}__iter`
  let name = base
  let i = 0

  while (used.has(name)) {
    i++
    name = `${base}_${i}`
  }

  used.add(name)

  return name
}

/**
 * Inline `subgraph { }` on map/fanout/while nodes becomes a synthetic top-level
 * workflow and `graph: <synthName>` on the node. Recurses for nested subgraphs.
 */
function flattenWorkflowDeclRecursive(
  g: WorkflowDecl,
  acc: WorkflowDecl[],
  usedNames: Set<string>,
): WorkflowDecl {
  const nodes = g.nodes.map((node) => {
    if (!node.subgraph) {
      return node
    }

    const synthName = makeUniqueSynthName(g.name, node.name, usedNames)

    const rawChild: WorkflowDecl = {
      name: synthName,
      label: synthName,
      nodes: node.subgraph.nodes,
      edges: node.subgraph.edges,
      flowRange: node.subgraph.flowRange,
      range: node.subgraph.range,
    }

    const flattenedChild = flattenWorkflowDeclRecursive(rawChild, acc, usedNames)
    acc.push(flattenedChild)

    const graphCv: ConfigValue = {
      kind: 'string',
      value: synthName,
      range: node.range,
    }

    return {
      ...node,
      subgraph: undefined,
      configFields: {
        ...node.configFields,
        graph: graphCv,
      },
    }
  })

  return { ...g, nodes }
}

/** Replace inline subgraphs with synthetic workflow declarations. */
export function flattenInlineSubgraphsInGraph(graph: WorkflowDecl): {
  graph: WorkflowDecl
  synthesizedGraphs: WorkflowDecl[]
} {
  const acc: WorkflowDecl[] = []
  const usedNames = new Set<string>()
  const flat = flattenWorkflowDeclRecursive(graph, acc, usedNames)

  return { graph: flat, synthesizedGraphs: acc }
}
