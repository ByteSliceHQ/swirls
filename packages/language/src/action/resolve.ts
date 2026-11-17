import type { ActionDecl, JsonSchemaLiteral } from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'

/** Resolve an action block's input schema (inline or from workspace schema literals). */
export function resolveActionInputSchema(
  action: ActionDecl,
  workspace?: WorkspaceResourceIndex,
): JsonSchemaLiteral | undefined {
  if (action.input) {
    return action.input
  }
  if (action.inputRef && workspace?.schemaLiterals) {
    return workspace.schemaLiterals.get(action.inputRef)
  }
  return undefined
}

/** Resolve an action block's output schema (inline or from workspace schema literals). */
export function resolveActionOutputSchema(
  action: ActionDecl,
  workspace?: WorkspaceResourceIndex,
): JsonSchemaLiteral | undefined {
  if (action.output) {
    return action.output
  }
  if (action.outputRef && workspace?.schemaLiterals) {
    return workspace.schemaLiterals.get(action.outputRef)
  }
  return undefined
}

/** Find an action block by name across local AST and workspace index. */
export function findActionDecl(
  actions: ActionDecl[],
  name: string,
): ActionDecl | undefined {
  return actions.find((a) => a.name === name)
}
