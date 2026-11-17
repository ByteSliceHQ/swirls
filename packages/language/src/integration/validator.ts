import { findActionDecl, resolveActionInputSchema } from '../action/resolve'
import type { Diagnostic, NodeDecl, SourceRange, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import {
  configStringValue,
  connectionProviderForNode,
  mergeActionDecls,
  mergeConnectionDecls,
} from './node-config'

function diag(
  message: string,
  range: SourceRange,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { message, range, severity }
}

export function validateIntegrationNodes(
  ast: SwirlsFile,
  opts?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const integrationNodes: NodeDecl[] = []
  for (const graph of ast.workflows) {
    for (const node of graph.nodes) {
      if (node.type === 'integration') {
        integrationNodes.push(node)
      }
    }
  }
  // Workspace action maps are huge (the registry catalog). Copy them only
  // when this file actually has an integration node to check.
  if (integrationNodes.length === 0) {
    return []
  }

  const out: Diagnostic[] = []
  const connections = mergeConnectionDecls(ast, opts?.workspace)
  const actions = mergeActionDecls(ast, opts?.workspace)

  for (const node of integrationNodes) {
    out.push(
      ...validateIntegrationNode(node, connections, actions, opts?.workspace),
    )
  }

  return out
}

function validateIntegrationNode(
  node: NodeDecl,
  connections: ReturnType<typeof mergeConnectionDecls>,
  actions: ReturnType<typeof mergeActionDecls>,
  workspace?: WorkspaceResourceIndex,
): Diagnostic[] {
  const out: Diagnostic[] = []

  const actionName = configStringValue(node.configFields.action)
  const pathName = configStringValue(node.configFields.path)
  const hasAction = actionName !== undefined
  const hasPath = pathName !== undefined

  if (hasAction && hasPath) {
    out.push(
      diag(
        'Integration node must set either "action" or "path", not both',
        node.configFields.action?.range ?? node.range,
      ),
    )
  }

  if (!hasAction && !hasPath) {
    out.push(diag('Integration node requires "action" or "path"', node.range))
  }

  if (hasPath && !hasAction) {
    out.push(
      diag(
        'Integration node uses raw "path" without "action"; params and output are untyped. Prefer an action block when available.',
        node.configFields.path?.range ?? node.range,
        'warning',
      ),
    )
  }

  const paramsCv = node.configFields.params
  if (
    paramsCv &&
    paramsCv.kind !== 'ts_block' &&
    paramsCv.kind !== 'ts_file_ref'
  ) {
    out.push(
      diag(
        'Integration node "params" must be a @ts block returning an object',
        paramsCv.range ?? node.range,
      ),
    )
  }

  if (hasAction && 'method' in node.configFields) {
    out.push(
      diag(
        'Integration node with "action" must not set "method"; transport comes from the action block',
        node.configFields.method?.range ?? node.range,
      ),
    )
  }

  if (!hasAction) {
    return out
  }

  const binding = connectionProviderForNode(node, connections)
  if (!binding) {
    out.push(
      diag(
        'Integration node with "action" requires a valid "connection" block to resolve the provider',
        node.range,
      ),
    )
    return out
  }

  const actionDecl = findActionDecl(actions, actionName)
  if (!actionDecl) {
    const known = actions
      .filter((a) => a.provider === binding.provider)
      .map((a) => a.name)
    const hint =
      known.length > 0
        ? ` Known actions for "${binding.provider}": ${known.join(', ')}.`
        : ''
    out.push(
      diag(
        `Integration node references undefined action block "${actionName}".${hint}`,
        node.configFields.action?.range ?? node.range,
      ),
    )
    return out
  }

  if (actionDecl.provider !== binding.provider) {
    out.push(
      diag(
        `Integration node action "${actionName}" provider "${actionDecl.provider}" must match connection "${binding.name}" provider "${binding.provider}"`,
        node.configFields.action?.range ?? node.range,
      ),
    )
  }

  const inputSchema = resolveActionInputSchema(actionDecl, workspace)
  const requiredInput = inputSchema?.required
  if (
    Array.isArray(requiredInput) &&
    requiredInput.length > 0 &&
    !('params' in node.configFields)
  ) {
    out.push(
      diag(
        `Integration action "${actionName}" requires "params" (@ts returning an object with required fields: ${requiredInput.join(', ')})`,
        node.range,
      ),
    )
  }

  return out
}
