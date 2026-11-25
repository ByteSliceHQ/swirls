import type { IntegrationNodeConfig } from '@swirls/definition/schemas'
import type { ActionDecl, JsonSchemaLiteral, SwirlsFile } from '@swirls/language'
import {
  ACTION_ENCODINGS,
  ACTION_HTTP_METHODS,
  mergeActionDecls,
  resolveActionInputSchema,
  resolveActionOutputSchema,
} from '@swirls/language'
import type { WorkspaceResourceIndex } from '@swirls/language/workspace'

type IntegrationConfigForInlining = Omit<
  IntegrationNodeConfig,
  'actionInputSchema' | 'actionOutputSchema'
> & {
  actionInputSchema?: unknown
  actionOutputSchema?: unknown
}

export function buildActionsByName(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, ActionDecl> {
  return new Map(mergeActionDecls(ast, workspace).map((a) => [a.name, a]))
}

export function buildActionSchemaLiterals(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, JsonSchemaLiteral> {
  const literals = new Map<string, JsonSchemaLiteral>()

  for (const schema of ast.schemas ?? []) {
    if (schema.schema) {
      literals.set(schema.name, schema.schema)
    }
  }

  for (const [name, literal] of workspace?.schemaLiterals ?? []) {
    if (!literals.has(name)) {
      literals.set(name, literal)
    }
  }

  return literals
}

function workspaceWithSchemaLiterals(
  workspace: WorkspaceResourceIndex | undefined,
  schemaLiterals: Map<string, JsonSchemaLiteral>,
): WorkspaceResourceIndex | undefined {
  if (schemaLiterals.size === 0) {
    return workspace
  }

  const mergedLiterals = new Map([...(workspace?.schemaLiterals ?? []), ...schemaLiterals])

  if (workspace) {
    return { ...workspace, schemaLiterals: mergedLiterals }
  }

  return { schemaLiterals: mergedLiterals } as WorkspaceResourceIndex
}

function asActionMethod(
  method: string,
  workflowName: string,
  nodeName: string,
  actionName: string,
): IntegrationNodeConfig['method'] {
  const upper = method.toUpperCase()

  if (!(ACTION_HTTP_METHODS as readonly string[]).includes(upper)) {
    throw new Error(
      `Workflow "${workflowName}", node "${nodeName}": integration action "${actionName}" has invalid method "${method}"`,
    )
  }

  return upper as IntegrationNodeConfig['method']
}

function asActionEncoding(
  encoding: string,
  workflowName: string,
  nodeName: string,
  actionName: string,
): IntegrationNodeConfig['encoding'] {
  if (!(ACTION_ENCODINGS as readonly string[]).includes(encoding)) {
    throw new Error(
      `Workflow "${workflowName}", node "${nodeName}": integration action "${actionName}" has invalid encoding "${encoding}"`,
    )
  }

  return encoding as IntegrationNodeConfig['encoding']
}

/** Inline action transport + schemas into an integration node config at deploy time. */
export function inlineIntegrationActionConfig(
  config: IntegrationConfigForInlining,
  ctx: {
    actionsByName: Map<string, ActionDecl>
    schemaLiterals: Map<string, JsonSchemaLiteral>
    workspace?: WorkspaceResourceIndex
    workflowName: string
    nodeName: string
  },
): IntegrationNodeConfig {
  const {
    actionInputSchema: _actionInputSchema,
    actionOutputSchema: _actionOutputSchema,
    ...base
  } = config

  const actionName = config.action?.trim()

  if (!actionName) {
    return base
  }

  const action = ctx.actionsByName.get(actionName)

  if (!action) {
    throw new Error(
      `Workflow "${ctx.workflowName}", node "${ctx.nodeName}": integration action "${actionName}" is not defined`,
    )
  }

  const ws = workspaceWithSchemaLiterals(ctx.workspace, ctx.schemaLiterals)
  const isGraphqlAction = Boolean(action.graphqlDocument)

  const inputSchema = isGraphqlAction ? undefined : resolveActionInputSchema(action, ws)
  const outputSchema = isGraphqlAction ? undefined : resolveActionOutputSchema(action, ws)

  return {
    ...base,
    method: asActionMethod(action.method, ctx.workflowName, ctx.nodeName, actionName),
    path: action.path,
    ...(action.encoding !== undefined
      ? {
          encoding: asActionEncoding(action.encoding, ctx.workflowName, ctx.nodeName, actionName),
        }
      : {}),
    ...(inputSchema !== undefined ? { actionInputSchema: inputSchema } : {}),
    ...(outputSchema !== undefined ? { actionOutputSchema: outputSchema } : {}),
    ...(action.graphqlDocument !== undefined
      ? { actionGraphqlDocument: action.graphqlDocument }
      : {}),
  }
}
