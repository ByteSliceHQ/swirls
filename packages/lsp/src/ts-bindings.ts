import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  DatabaseDecl,
  NodeDecl,
  PostgresDecl,
  StreamDecl,
  StreamVersionDecl,
  WorkflowDecl,
} from '@swirls/language'
import {
  resolveTsRefFullPath,
} from '@swirls/language'
import { parse } from './parse-cache'
import { getRootNode } from './ts-service/context-types'

export interface TsSwirlsBinding {
  parentUri: string
  workflowName: string
  /** Empty when this binding is for stream `condition` / `prepare` file refs. */
  nodeName: string
  configKey: string
  graph: WorkflowDecl
  node: NodeDecl
  allWorkflows: WorkflowDecl[]
  postgresBlocks?: PostgresDecl[]
  streams?: StreamDecl[]
  /** Managed `database` blocks from the parent file; used to type `context.db`. */
  databases?: DatabaseDecl[]
  /** Set when the binding is for a top-level `stream { versions { vN { … }}}` `condition` / `prepare` file ref. */
  streamDecl?: StreamDecl
  streamVersionDecl?: StreamVersionDecl
  /** Referenced graph from `stream.graph` (same as `graph` when resolved). */
  referencedWorkflow?: WorkflowDecl
}

/** Normalized absolute filesystem path -> bindings (multiple = ambiguous). */
const bindingMap = new Map<string, TsSwirlsBinding[]>()

export function isStandaloneTsSwirlsUri(uri: string): boolean {
  return uri.endsWith('.ts.swirls')
}

export function isDslSwirlsUri(uri: string): boolean {
  return uri.endsWith('.swirls') && !uri.endsWith('.ts.swirls')
}

export function removeBindingsForParent(parentUri: string): void {
  for (const [key, arr] of [...bindingMap.entries()]) {
    const next = arr.filter((b) => b.parentUri !== parentUri)
    if (next.length === 0) {
      bindingMap.delete(key)
    } else {
      bindingMap.set(key, next)
    }
  }
}

function addBinding(absPath: string, binding: TsSwirlsBinding): void {
  const key = path.normalize(absPath)
  const list = bindingMap.get(key) ?? []
  list.push(binding)
  bindingMap.set(key, list)
}

/**
 * Re-parse a DSL `.swirls` document and register all `@ts "…"` targets.
 */
export function indexDslDocument(parentUri: string, text: string): void {
  removeBindingsForParent(parentUri)
  const result = parse(text)

  let parentPath: string
  try {
    parentPath = fileURLToPath(parentUri)
  } catch {
    return
  }

  for (const graph of result.ast.workflows) {
    for (const node of graph.nodes) {
      for (const [configKey, cv] of Object.entries(node.configFields)) {
        if (cv.kind !== 'ts_file_ref') {
          continue
        }
        const abs = resolveTsRefFullPath(parentPath, cv.path)
        addBinding(abs, {
          parentUri,
          workflowName: graph.name,
          nodeName: node.name,
          configKey,
          graph,
          node,
          allWorkflows: result.ast.workflows,
          postgresBlocks: result.ast.postgres ?? [],
          streams: result.ast.streams ?? [],
          databases: result.ast.databases ?? [],
        })
      }
    }
  }

  for (const stream of result.ast.streams ?? []) {
    const refGraph = result.ast.workflows.find(
      (g) => g.name === stream.workflowName,
    )
    if (!refGraph) {
      continue
    }
    const rootNode = getRootNode(refGraph) ?? refGraph.nodes[0]
    if (!rootNode) {
      continue
    }
    for (const sv of stream.versions ?? []) {
      for (const configKey of ['condition', 'prepare'] as const) {
        const cv = sv[configKey]
        if (cv?.kind !== 'ts_file_ref') {
          continue
        }
        const abs = resolveTsRefFullPath(parentPath, cv.path)
        addBinding(abs, {
          parentUri,
          workflowName: refGraph.name,
          nodeName: '',
          configKey,
          graph: refGraph,
          node: rootNode,
          allWorkflows: result.ast.workflows,
          postgresBlocks: result.ast.postgres ?? [],
          streams: result.ast.streams ?? [],
          streamDecl: stream,
          streamVersionDecl: sv,
          referencedWorkflow: refGraph,
        })
      }
    }
  }
}

export function getBindingsForTsFileUri(tsFileUri: string): TsSwirlsBinding[] {
  try {
    const fsPath = fileURLToPath(tsFileUri)
    return [...(bindingMap.get(path.normalize(fsPath)) ?? [])]
  } catch {
    return []
  }
}
