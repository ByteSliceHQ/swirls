/**
 * Lowering: `.swirls` source files in, a deployment definition out.
 *
 * `lowerSwirlsSources` is the whole pipeline over files held in memory. The
 * steps it runs are exported too, for a host that reads a directory or wants
 * to stop between them.
 */

export {
  type DeploymentDefinition,
  parseDeploymentDefinition,
} from '@swirls/definition/deployment-definition'
export type {
  DeploymentSourceFileContent,
  DeploymentSourceManifest,
  DeploymentSourceResourceKind,
} from '@swirls/definition/deployment-source-schemas'
export {
  type Diagnostic,
  type HarnessCatalog,
  type LanguageHost,
  type OpenUiSupport,
  type ProviderCatalog,
  type SourceRange,
  type SwirlsFile,
  swirlsHost,
} from '@swirls/language'

export {
  type BuildDefinitionOptions,
  buildDeploymentDefinitionPayload,
  type MergeProjectOptions,
  mergeProjectSwirlsFiles,
} from './bundle'
export { canonicalizeForStableJson } from './canonical-json'
export { collectSwirlsFiles } from './collect-swirls-files'
export {
  type ComputerHarnessBake,
  computerHarnessBake,
  HARNESS_DEBIAN_STAGE_DIR,
  HARNESS_PROVIDERS,
  HARNESS_ROOT_DIR,
  type HarnessDebianPackage,
  type HarnessProvider,
  type HarnessRuntimePackage,
  harnessPrepScript,
  harnessRuntimePackages,
  isHarnessProvider,
} from './computer/harness-runtime'
export {
  COMPUTER_BASELINE_KIT,
  COMPUTER_BASELINE_PACKAGES,
  COMPUTER_HARNESS_RESOURCE_DEFAULTS,
  COMPUTER_HARNESS_RUNTIME,
  COMPUTER_MOUNT_KIT,
  COMPUTER_MOUNT_PACKAGES,
  COMPUTER_RESOURCE_DEFAULTS,
  type CompiledComputer,
  type CompiledComputerHarness,
  type ComputerHarnessInput,
  type ComputerRecipeInput,
  compileComputerRecipe,
  computerSnapshotName,
  daytonaSnapshotResources,
  floxManifestToml,
  platformComputerSnapshotName,
  recipePackages,
} from './computer/recipe'
export { computeDefinitionHash } from './definition-hash'
export { computeDeploymentDefinitionFingerprint } from './deployment-fingerprint'
export type { DeployBundleDirent, DeployBundleFs } from './fs'
export { deployBundleToWorkspaceFileSystem } from './fs'
export { uuidv7 } from './ids'
export {
  type LowerDiagnostic,
  type LowerOptions,
  type LowerResult,
  type LowerStage,
  lowerSwirlsSources,
  type SwirlsSources,
} from './lower'
export {
  createMemoryRepoFs,
  flattenArchivePathMap,
  sliceRepoFilesToRoot,
  virtualRepoCwd,
} from './memory-repo-fs'
export {
  buildConfigValueKindsFromNodeDecl,
  buildWorkflowNodeConfigFromNodeDecl,
  EXECUTABLE_STRING_FIELDS,
  flattenInlineSubgraphsInGraph,
} from './node-config'
export { createNodeDeployBundleFs } from './node-fs'
export { compileOperationBlock, operationScriptSha256 } from './operation'
export { sha256Hex } from './sha256'
export type {
  DeploymentSkillFilePayload,
  DeploymentSkillFilesBundle,
  SkillBlockRef,
  SkillBundle,
  SkillClassificationResult,
  SkillDeployFs,
  SkillDeployStat,
  SkillFileEntry,
  SkillMdFrontmatter,
} from './skills'
export {
  AGENTS_SKILLS_DIR,
  classifySkillBundle,
  collectDeploymentSkillFiles,
  collectReferencedSkillBlocksFromAst,
  computeSkillChecksum,
  deployBundleToSkillDeployFs,
  isKnownScriptExtension,
  isScriptsOrBinDirectory,
  MAX_SKILL_FILE_BYTES,
  MAX_SKILL_FILES,
  MAX_SKILL_TREE_BYTES,
  parseSkillMdFrontmatter,
  resolveSkillTree,
  SKILL_MD_FILENAME,
} from './skills'
export {
  buildDeploymentSourceManifest,
  collectDeploymentSourceFiles,
  combineDeploymentAndSourceFingerprints,
  computeDeploymentSourceFingerprint,
  normalizeDeploymentSourcePath,
  validateDeploymentSourceInput,
} from './source-files'
export { stripEditorMetadata } from './strip-metadata'
