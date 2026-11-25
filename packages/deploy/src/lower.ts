import { join } from 'pathe'

import type { DeploymentSourceFileContent } from '@swirls/definition/deployment-source-schemas'
import type { LanguageHost, SourceRange, SwirlsFile } from '@swirls/language'
import { parse, validate, validateTsFileRefs } from '@swirls/language'
import { buildWorkspaceResourceIndex } from '@swirls/language/workspace'

import { buildDeploymentDefinitionPayload, mergeProjectSwirlsFiles } from './bundle'
import { collectSwirlsFiles } from './collect-swirls-files'
import { deployBundleToWorkspaceFileSystem } from './fs'
import { createMemoryRepoFs } from './memory-repo-fs'
import {
  collectDeploymentSkillFiles,
  collectReferencedSkillBlocksFromAst,
} from './skills/collect-skill-files'
import { deployBundleToSkillDeployFs } from './skills/skill-fs'
import type { DeploymentSkillFilesBundle } from './skills/types'
import { collectDeploymentSourceFiles, computeDeploymentSourceFingerprint } from './source-files'

/** Source files of one project: posix path relative to the project root, to text. */
export type SwirlsSources = ReadonlyMap<string, string> | Readonly<Record<string, string>>

export interface LowerOptions {
  /**
   * The runtime's provider catalog, `@openui` checker and harness catalog.
   * Without it those runtime-specific checks are skipped.
   */
  host?: LanguageHost
  /** Makes the id of every resource and node. Defaults to a UUIDv7. */
  newId?: () => string
}

/**
 * Which step reported a diagnostic: reading one file (`parse`, `validate`),
 * combining the files (`merge`), building the definition (`lower`), or checking
 * the built definition against its schema (`definition`).
 */
export type LowerStage = 'parse' | 'validate' | 'merge' | 'lower' | 'definition'

export interface LowerDiagnostic {
  severity: 'error' | 'warning'
  stage: LowerStage
  message: string
  /** The source file, when the diagnostic belongs to one. */
  path?: string
  /** Where in `path`; lines and columns as the language reports them. */
  range?: SourceRange
}

export interface LowerResult {
  /** True when a definition was built. Warnings do not make this false. */
  ok: boolean
  /**
   * The deployment definition as a JSON document, or null when `ok` is false.
   * It has passed `parseDeploymentDefinition`; call that for the typed value.
   */
  definition: Record<string, unknown> | null
  diagnostics: LowerDiagnostic[]
  /** Every `.swirls` file given, with its size and SHA-256, sorted by path. */
  sourceFiles: DeploymentSourceFileContent[]
  /** A stable hash of `sourceFiles`; the same sources always give the same value. */
  sourceFingerprint: string
  /** Files of each skill an agent uses, read from `.agents/skills/<name>/`. */
  skillFiles: DeploymentSkillFilesBundle[]
  /** The merged syntax tree the definition was built from, or null when `ok` is false. */
  ast: SwirlsFile | null
}

const VIRTUAL_ROOT = '/project'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Lower the source files of one project into a deployment definition.
 *
 * Nothing is read from disk or from the environment: the files given are the
 * whole project. A problem in the sources is returned as a diagnostic, not
 * thrown, so a caller can show every problem in every file at once.
 *
 * Besides `.swirls` files, pass the `.ts.swirls` files they reference and the
 * `.agents/skills/<name>/` files of any skill an agent uses.
 */
export function lowerSwirlsSources(files: SwirlsSources, options: LowerOptions = {}): LowerResult {
  const entries = files instanceof Map ? [...files] : Object.entries(files)
  const fs = createMemoryRepoFs(new Map(entries), VIRTUAL_ROOT)
  const fileSystem = deployBundleToWorkspaceFileSystem(fs)
  const diagnostics: LowerDiagnostic[] = []
  const sourceFiles = collectDeploymentSourceFiles(fs, VIRTUAL_ROOT)

  const failed = (): LowerResult => ({
    ok: false,
    definition: null,
    diagnostics,
    sourceFiles,
    sourceFingerprint: computeDeploymentSourceFingerprint(sourceFiles),
    skillFiles: [],
    ast: null,
  })

  const workspace = buildWorkspaceResourceIndex({ cwd: VIRTUAL_ROOT, fileSystem })

  for (const path of collectSwirlsFiles(fs, VIRTUAL_ROOT)) {
    const fullPath = join(VIRTUAL_ROOT, path)
    const parsed = parse(fs.readFileSync(fullPath, 'utf-8'))

    if (parsed.errors.length > 0) {
      for (const error of parsed.errors) {
        diagnostics.push({
          severity: 'error',
          stage: 'parse',
          message: error.message,
          path,
          range: error.range,
        })
      }

      continue
    }

    const found = [
      ...validate(parsed.ast, { workspace, host: options.host }),
      ...validateTsFileRefs(parsed.ast, {
        swirlsFilePath: fullPath,
        existsSync: fileSystem.existsSync,
      }),
    ]

    for (const diagnostic of found) {
      diagnostics.push({
        severity: diagnostic.severity === 'warning' ? 'warning' : 'error',
        stage: 'validate',
        message: diagnostic.message,
        path,
        range: diagnostic.range,
      })
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return failed()
  }

  let merged: SwirlsFile

  try {
    merged = mergeProjectSwirlsFiles(fs, VIRTUAL_ROOT, { host: options.host })
  } catch (error) {
    diagnostics.push({ severity: 'error', stage: 'merge', message: messageOf(error) })

    return failed()
  }

  let definition: Record<string, unknown>
  let skillFiles: DeploymentSkillFilesBundle[]

  try {
    const built = buildDeploymentDefinitionPayload(merged, { newId: options.newId })

    if (built.parseError) {
      for (const issue of built.parseError.issues) {
        const where = issue.path.map(String).join('.')

        diagnostics.push({
          severity: 'error',
          stage: 'definition',
          message: where === '' ? issue.message : `${where}: ${issue.message}`,
        })
      }

      return failed()
    }

    definition = built.definition

    skillFiles = collectDeploymentSkillFiles(
      deployBundleToSkillDeployFs(fs),
      VIRTUAL_ROOT,
      collectReferencedSkillBlocksFromAst(merged),
    )
  } catch (error) {
    diagnostics.push({ severity: 'error', stage: 'lower', message: messageOf(error) })

    return failed()
  }

  return {
    ok: true,
    definition,
    diagnostics,
    sourceFiles,
    sourceFingerprint: computeDeploymentSourceFingerprint(sourceFiles),
    skillFiles,
    ast: merged,
  }
}
