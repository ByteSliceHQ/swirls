import type { ActionDecl, ConnectionDecl, NodeDecl, SwirlsFile } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'

export function configStringValue(
  cv: NodeDecl['configFields'][string] | undefined,
): string | undefined {
  if (cv?.kind === 'string') {
    const value = String(cv.value).trim()
    return value !== '' ? value : undefined
  }
  return undefined
}

function mergeNamedDecls<T extends { name: string }>(
  local: T[] | undefined,
  workspaceMap: Map<string, T> | undefined,
): T[] {
  const byName = new Map((local ?? []).map((d) => [d.name, d]))
  for (const [name, decl] of workspaceMap ?? []) {
    if (!byName.has(name)) {
      byName.set(name, decl)
    }
  }
  return [...byName.values()]
}

/** Merge local and workspace connection blocks (local wins on name collision). */
export function mergeConnectionDecls(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): ConnectionDecl[] {
  return mergeNamedDecls(ast.connections, workspace?.connectionBlocks)
}

/** Merge local and workspace action blocks (local wins on name collision). */
export function mergeActionDecls(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): ActionDecl[] {
  return mergeNamedDecls(ast.actions, workspace?.actionBlocks)
}

export function connectionProviderForNode(
  node: NodeDecl,
  connections: ConnectionDecl[],
): { name: string; provider: string; range: NodeDecl['range'] } | undefined {
  const connName = configStringValue(node.configFields.connection)
  if (!connName) {
    return undefined
  }
  const decl = connections.find((c) => c.name === connName)
  if (!decl) {
    return undefined
  }
  return {
    name: connName,
    provider: decl.provider,
    range: node.configFields.connection?.range ?? node.range,
  }
}
