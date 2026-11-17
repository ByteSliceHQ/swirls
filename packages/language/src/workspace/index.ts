export { collectSwirlsFiles } from './collect'
export { parseSwirlsFile } from './parse'
export type { SwirlsWorkspaceFileSystem } from './sandbox'
export {
  buildWorkspaceResourceIndex,
  type DeclSite,
  emptyWorkspaceResourceIndex,
  nameLookup,
  type ResourceDeclMap,
  type WorkspaceDuplicate,
  type WorkspaceResourceIndex,
  type WorkspaceSecretEntry,
  workspaceDuplicates,
  workspaceIndexFromStreamNames,
} from './workspace-resources'
