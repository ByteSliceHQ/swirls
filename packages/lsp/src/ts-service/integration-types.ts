import type { ActionDecl, ConnectionDecl, NodeDecl, SwirlsFile } from '@swirls/language'
import {
  configStringValue,
  connectionProviderForNode as connectionProviderForNodeFromDecls,
  findActionDecl,
  mergeActionDecls,
  mergeConnectionDecls,
  resolveActionInputSchema,
  resolveActionOutputSchema,
} from '@swirls/language'
import type { WorkspaceResourceIndex } from '@swirls/language/workspace'

import {
  graphqlActionOutputTypeString,
  graphqlActionParamsTypeParts,
  loadProviderGraphqlSchema,
  loadSiblingGraphqlSchema,
} from '../graphql-action'
import { jsonSchemaToTsType } from './schema-to-ts'

export type WorkspaceFileReader = (relativePath: string) => string | undefined

export function integrationConnectionsForAst(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): ConnectionDecl[] {
  return mergeConnectionDecls(ast, workspace)
}

export function integrationActionsForAst(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): ActionDecl[] {
  return mergeActionDecls(ast, workspace)
}

function connectionProviderForNode(
  node: NodeDecl,
  connections: ConnectionDecl[] | undefined,
): string | undefined {
  if (!connections?.length) {
    return undefined
  }

  return connectionProviderForNodeFromDecls(node, connections)?.provider
}

function integrationActionForNode(
  node: NodeDecl,
  connections: ConnectionDecl[] | undefined,
  actions: ActionDecl[] | undefined,
): ActionDecl | undefined {
  if (node.type !== 'integration') {
    return undefined
  }

  const actionName = configStringValue(node.configFields.action)

  if (!actionName) {
    return undefined
  }

  const provider = connectionProviderForNode(node, connections)

  if (!provider) {
    return undefined
  }

  const actionDecl = findActionDecl(actions ?? [], actionName)

  if (!actionDecl || actionDecl.provider !== provider) {
    return undefined
  }

  return actionDecl
}

function graphqlSchemaForAction(
  actionDecl: ActionDecl,
  workspace: WorkspaceResourceIndex | undefined,
  readWorkspaceFile: WorkspaceFileReader | undefined,
) {
  if (!actionDecl.graphqlDocument || !readWorkspaceFile) {
    return undefined
  }

  if (workspace) {
    const sites = workspace.actions.get(actionDecl.name)

    const site =
      sites?.find((entry) =>
        entry.relativePath.startsWith(`swirls/integrations/${actionDecl.provider}/`),
      ) ?? sites?.[0]

    if (site) {
      const sibling = loadSiblingGraphqlSchema({
        actionRelativePath: site.relativePath,
        readFile: readWorkspaceFile,
      })

      if (sibling) {
        return sibling
      }
    }
  }

  return loadProviderGraphqlSchema({
    provider: actionDecl.provider,
    readFile: readWorkspaceFile,
  })
}

export function integrationParamsReturnTypePreamble(
  node: NodeDecl,
  connections: ConnectionDecl[] | undefined,
  actions: ActionDecl[] | undefined,
  workspace?: WorkspaceResourceIndex,
  readWorkspaceFile?: WorkspaceFileReader,
): string | undefined {
  const actionDecl = integrationActionForNode(node, connections, actions)

  if (!actionDecl?.graphqlDocument) {
    return undefined
  }

  const schema = graphqlSchemaForAction(actionDecl, workspace, readWorkspaceFile)

  if (!schema) {
    return undefined
  }

  const parts = graphqlActionParamsTypeParts(schema, actionDecl.graphqlDocument)

  if (!parts || parts.aliasDeclarations.length === 0) {
    return undefined
  }

  return `${parts.aliasDeclarations.join('\n')}\n`
}

export function integrationParamsReturnTypeString(
  node: NodeDecl,
  connections: ConnectionDecl[] | undefined,
  actions: ActionDecl[] | undefined,
  workspace?: WorkspaceResourceIndex,
  readWorkspaceFile?: WorkspaceFileReader,
): string | undefined {
  const actionDecl = integrationActionForNode(node, connections, actions)

  if (!actionDecl) {
    return undefined
  }

  if (actionDecl.graphqlDocument) {
    const schema = graphqlSchemaForAction(actionDecl, workspace, readWorkspaceFile)

    if (schema) {
      const parts = graphqlActionParamsTypeParts(schema, actionDecl.graphqlDocument)
      return parts?.paramsType
    }

    return undefined
  }

  const inputSchema = resolveActionInputSchema(actionDecl, workspace)

  if (!inputSchema) {
    return undefined
  }

  return jsonSchemaToTsType(inputSchema)
}

export function integrationOutputTypeString(
  node: NodeDecl,
  connections: ConnectionDecl[] | undefined,
  actions: ActionDecl[] | undefined,
  workspace?: WorkspaceResourceIndex,
  readWorkspaceFile?: WorkspaceFileReader,
): string | undefined {
  const actionDecl = integrationActionForNode(node, connections, actions)

  if (!actionDecl) {
    return undefined
  }

  if (actionDecl.graphqlDocument) {
    const schema = graphqlSchemaForAction(actionDecl, workspace, readWorkspaceFile)

    if (schema) {
      return graphqlActionOutputTypeString(schema, actionDecl.graphqlDocument)
    }

    return undefined
  }

  const outputSchema = resolveActionOutputSchema(actionDecl, workspace)

  if (!outputSchema) {
    return undefined
  }

  return jsonSchemaToTsType(outputSchema)
}
