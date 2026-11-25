import { join } from 'pathe'

import type { DeploymentDefinition } from '@swirls/definition/deployment-definition'
import type {
  DeploymentSourceFileContent,
  DeploymentSourceManifest,
  DeploymentSourceResourceKind,
} from '@swirls/definition/deployment-source-schemas'
import type { SourceRange, SwirlsFile } from '@swirls/language'

import { utf8Bytes } from './bytes'
import { canonicalizeForStableJson } from './canonical-json'
import type { DeployBundleFs } from './fs'
import { sha256Hex } from './sha256'

const IGNORE_DIRS = new Set(['node_modules', '__fixtures__'])

type SourceAnnotated = {
  sourcePath?: string
  range: SourceRange
}

export function normalizeDeploymentSourcePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`Invalid source path "${path}"`)
  }

  return parts.join('/')
}

function collectSourcePathsRecursive(fs: DeployBundleFs, cwd: string, dir: string, acc: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = join(dir, entry.name)
    const relative = full.slice(cwd.length).replace(/^[/\\]+/, '')

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        collectSourcePathsRecursive(fs, cwd, full, acc)
      }

      continue
    }

    // `.ts.swirls` handlers are included via `.endsWith('.swirls')`.
    if (entry.isFile() && entry.name.endsWith('.swirls')) {
      acc.push(normalizeDeploymentSourcePath(relative))
    }
  }
}

export function collectDeploymentSourceFiles(
  fs: DeployBundleFs,
  cwd: string,
): DeploymentSourceFileContent[] {
  const paths: string[] = []
  collectSourcePathsRecursive(fs, cwd, cwd, paths)

  return paths
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const content = fs.readFileSync(join(cwd, path), 'utf-8')
      return {
        path,
        content,
        size: utf8Bytes(content).byteLength,
        sha256: sha256Hex(content),
      }
    })
}

export function computeDeploymentSourceFingerprint(
  files: Array<Pick<DeploymentSourceFileContent, 'path' | 'sha256'>>,
): string {
  const payload = files
    .map((file) => ({
      path: normalizeDeploymentSourcePath(file.path),
      sha256: file.sha256,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return sha256Hex(JSON.stringify(canonicalizeForStableJson(payload)))
}

/**
 * Combined fingerprint uses persisted sourceFingerprint when available.
 * Deployments without a source row treat source as null (pre-source deployments).
 */
export function combineDeploymentAndSourceFingerprints(
  definitionFingerprint: string,
  sourceFingerprint: string | null | undefined,
): string {
  const payload = {
    definitionFingerprint,
    sourceFingerprint: sourceFingerprint ?? null,
  }

  return sha256Hex(JSON.stringify(canonicalizeForStableJson(payload)))
}

export function validateDeploymentSourceInput(
  files: DeploymentSourceFileContent[] | undefined,
  manifest: DeploymentSourceManifest | undefined,
) {
  if (!files?.length && !manifest) {
    return
  }

  if (!files?.length || !manifest) {
    throw new Error('Deployment source requires both sourceFiles and sourceManifest')
  }

  const computedFingerprint = computeDeploymentSourceFingerprint(files)

  if (computedFingerprint !== manifest.sourceFingerprint) {
    throw new Error('Deployment source manifest fingerprint does not match sourceFiles')
  }

  const filesByPath = new Map(files.map((file) => [normalizeDeploymentSourcePath(file.path), file]))

  for (const file of manifest.files) {
    const path = normalizeDeploymentSourcePath(file.path)
    const content = filesByPath.get(path)

    if (!content) {
      throw new Error(`Source manifest references missing file "${path}"`)
    }

    if (content.sha256 !== file.sha256) {
      throw new Error(`Source manifest hash mismatch for "${path}"`)
    }
  }
}

function sourceLocationFor(decl: SourceAnnotated | undefined) {
  if (!decl?.sourcePath) {
    return null
  }

  return {
    path: normalizeDeploymentSourcePath(decl.sourcePath),
    range: decl.range,
  }
}

function byName<T extends { name: string }>(items: T[] | undefined): Map<string, T> {
  return new Map((items ?? []).map((item) => [item.name, item]))
}

function pushResourceLocation<T extends { id: string; name: string }>(
  out: DeploymentSourceManifest['resources'],
  kind: DeploymentSourceResourceKind,
  definitionItems: T[] | undefined,
  decls: Array<{ name: string } & SourceAnnotated> | undefined,
) {
  const declByName = byName(decls)

  for (const item of definitionItems ?? []) {
    const loc = sourceLocationFor(declByName.get(item.name))

    if (!loc) {
      continue
    }

    out.push({
      kind,
      id: item.id,
      name: item.name,
      path: loc.path,
      range: loc.range,
    })
  }
}

const RESOURCE_MANIFEST_ENTRIES = [
  ['schema', 'schemas', 'schemas'],
  ['form', 'forms', 'forms'],
  ['webhook', 'webhooks', 'webhooks'],
  ['schedule', 'schedules', 'schedules'],
  ['workflow', 'workflows', 'workflows'],
  ['stream', 'streams', 'streams'],
  ['view', 'views', 'views'],
  ['trigger', 'triggers', 'triggers'],
  ['secret', 'secretBlocks', 'secrets'],
  ['auth', 'authBlocks', 'auths'],
  ['postgres', 'postgresBlocks', 'postgres'],
  ['database', 'databaseBlocks', 'databases'],
  ['migration', 'databaseMigrations', 'migrations'],
  ['disk', 'diskBlocks', 'disk'],
  ['skill', 'skillBlocks', 'skill'],
  ['agent', 'agentBlocks', 'agent'],
  ['decision', 'decisionBlocks', 'decisions'],
  ['mcp', 'mcpBlocks', 'mcp'],
  ['network', 'networkBlocks', 'networks'],
  ['channel', 'channelBlocks', 'channels'],
  ['connection', 'connectionBlocks', 'connections'],
  ['connector', 'connectorBlocks', 'connector'],
  ['action', 'actionBlocks', 'actions'],
  ['app', 'apps', 'apps'],
] as const satisfies ReadonlyArray<
  readonly [DeploymentSourceResourceKind, keyof DeploymentDefinition, keyof SwirlsFile]
>

export function buildDeploymentSourceManifest({
  definition,
  ast,
  files,
}: {
  definition: DeploymentDefinition
  ast: SwirlsFile
  files: DeploymentSourceFileContent[]
}): DeploymentSourceManifest {
  const resources: DeploymentSourceManifest['resources'] = []
  const nodes: DeploymentSourceManifest['nodes'] = []

  for (const [kind, definitionKey, astKey] of RESOURCE_MANIFEST_ENTRIES) {
    pushResourceLocation(
      resources,
      kind,
      definition[definitionKey] as Array<{ id: string; name: string }> | undefined,
      ast[astKey] as Array<{ name: string } & SourceAnnotated> | undefined,
    )
  }

  const workflowDecls = byName(ast.workflows)

  for (const workflow of definition.workflows ?? []) {
    const decl = workflowDecls.get(workflow.name)
    const nodeDecls = byName(decl?.nodes)

    for (const node of workflow.nodes) {
      const nodeDecl = nodeDecls.get(node.name)
      const loc = sourceLocationFor(nodeDecl)

      if (!loc) {
        continue
      }

      nodes.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodeId: node.id,
        nodeName: node.name,
        path: loc.path,
        range: loc.range,
      })
    }
  }

  return {
    version: 1,
    files: files.map(({ content: _content, ...file }) => ({
      ...file,
      path: normalizeDeploymentSourcePath(file.path),
    })),
    resources: resources.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)),
    nodes: nodes.sort((a, b) =>
      `${a.workflowName}:${a.nodeName}`.localeCompare(`${b.workflowName}:${b.nodeName}`),
    ),
    sourceFingerprint: computeDeploymentSourceFingerprint(files),
  }
}
