export { collectSwirlsFiles } from './collect'
export { parseSwirlsFile } from './parse'
export type { SwirlsWorkspaceFileSystem } from './sandbox'
export {
  buildWorkspaceResourceIndex,
  buildWorkspaceStreamBlockIndex,
  collectWorkspaceStreamBlockNames,
  type DeclSite,
  emptyWorkspaceResourceIndex,
  nameLookup,
  type ResourceDeclMap,
  type StreamBlockDeclSite,
  type WorkspaceDuplicate,
  type WorkspaceResourceIndex,
  type WorkspaceSecretEntry,
  workspaceDuplicates,
  workspaceIndexFromStreamNames,
} from './workspace-resources'
