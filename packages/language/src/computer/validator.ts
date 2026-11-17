/**
 * Validation for `computer` blocks and `type: shell` nodes.
 */

import { resourceNameSchema } from '@swirls/definition/schemas'
import type {
  AgentDecl,
  ConfigValue,
  Diagnostic,
  DiskDecl,
  NodeDecl,
  SourceRange,
  SwirlsFile,
  WorkflowDecl,
} from '../ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import type { ComputerDecl } from './ast'
import type { HarnessCatalog, LanguageHost } from '../host'

/** Flox catalog attribute names. */
const SOFTWARE_PACKAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

/** Exact versions and node-semver ranges (`^1.2`, `>=2,<3`, `1.2.*`, `a || b`). */
const SOFTWARE_PIN = /^[A-Za-z0-9^~<>*][A-Za-z0-9._+*<>=,~^| -]*$/

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(
  name: string,
  range: SourceRange,
  kind: string,
): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)
  if (result.success) {
    return []
  }
  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

function commandPresent(cv: ConfigValue | undefined): boolean {
  if (!cv) {
    return false
  }
  if (cv.kind === 'string') {
    return Boolean(cv.value.trim())
  }
  if (cv.kind === 'ts_block') {
    return Boolean(cv.code?.trim())
  }
  if (cv.kind === 'ts_file_ref') {
    return Boolean(cv.path?.trim())
  }
  return false
}

export function validateComputerBlocks(
  ast: SwirlsFile,
  options?: {
    workspace?: WorkspaceResourceIndex
    includeUnboundComputerWarnings?: boolean
    host?: LanguageHost
  },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks = ast.computer ?? []
  const names = new Set<string>()
  const diskByName = diskBlockMap(ast, options?.workspace)

  for (const computer of blocks) {
    out.push(
      ...validateResourceName(computer.name, computer.range, 'Computer block'),
    )
    if (names.has(computer.name)) {
      out.push(
        diag(
          `Duplicate computer block name "${computer.name}"`,
          computer.range,
        ),
      )
    }
    names.add(computer.name)

    for (const pin of computer.software ?? []) {
      if (!SOFTWARE_PACKAGE_NAME.test(pin.packageName)) {
        out.push(
          diag(
            `software package name "${pin.packageName}" may only contain letters, digits, ".", "_", "+", and "-"`,
            pin.range,
          ),
        )
      }
      if (!pin.pin.trim()) {
        out.push(
          diag(
            `software pin for "${pin.packageName}" must be a non-empty quoted string`,
            pin.range,
          ),
        )
      } else if (!SOFTWARE_PIN.test(pin.pin)) {
        out.push(
          diag(
            `software pin for "${pin.packageName}" must be a version or semver range (no quotes, brackets, "#", or newlines)`,
            pin.range,
          ),
        )
      }
    }

    const seenDisks = new Set<string>()
    for (let i = 0; i < (computer.disks ?? []).length; i++) {
      const diskName = computer.disks?.[i] ?? ''
      const range = computer.disksRanges?.[i] ?? computer.range
      if (seenDisks.has(diskName)) {
        out.push(
          diag(
            `Computer "${computer.name}" lists duplicate disk "${diskName}" in disks:`,
            range,
          ),
        )
      }
      seenDisks.add(diskName)
      if (!diskByName.has(diskName)) {
        out.push(
          diag(
            `Computer "${computer.name}" references undefined disk block "${diskName}"`,
            range,
          ),
        )
      }
    }

    if (computer.resources) {
      out.push(...validateResources(computer))
    }

    out.push(...validateHarness(computer, options?.host?.harnesses))
  }

  if (options?.includeUnboundComputerWarnings) {
    const bound = boundComputerNames(ast, options.workspace)
    for (const computer of blocks) {
      if (!bound.has(computer.name)) {
        out.push(
          diag(
            `Computer "${computer.name}" is not bound by any shell node or agent`,
            computer.range,
            'warning',
          ),
        )
      }
    }
  }

  return out
}

function validateResources(computer: ComputerDecl): Diagnostic[] {
  const resources = computer.resources
  if (!resources) {
    return []
  }
  const out: Diagnostic[] = []
  const label = `Computer "${computer.name}"`
  if (resources.cpus !== undefined && resources.cpus < 1) {
    out.push(
      diag(
        `${label}: resources.cpus must be at least 1`,
        resources.cpusRange ?? resources.range,
      ),
    )
  }
  if (resources.memoryMiB !== undefined && resources.memoryMiB < 128) {
    out.push(
      diag(
        `${label}: resources.memoryMiB must be at least 128`,
        resources.memoryMiBRange ?? resources.range,
      ),
    )
  }
  if (resources.diskGiB !== undefined && resources.diskGiB < 1) {
    out.push(
      diag(
        `${label}: resources.diskGiB must be at least 1`,
        resources.diskGiBRange ?? resources.range,
      ),
    )
  }
  return out
}

/** Vendor minimums for coding harness guests start at 2 CPUs and 4 GB. */
const HARNESS_MIN_CPUS = 2
const HARNESS_MIN_MEMORY_MIB = 4096

/** nixpkgs patches this binary with autoPatchelfHook, which Anthropic's hosted terms forbid. */
const NIX_CLAUDE_CODE_PACKAGE = 'claude-code'

/**
 * Harness rules: Swirls owns the harness version, so its package may not also
 * be pinned; guests below the vendor minimum size get a warning; and a Nix
 * `claude-code` pin gets a warning pointing at the claude harness.
 */
function validateHarness(
  computer: ComputerDecl,
  catalog: HarnessCatalog | undefined,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const label = `Computer "${computer.name}"`
  const harness = computer.harness

  // Which harnesses exist is the runtime's call. With no catalog any bare
  // name passes and the package rules below have nothing to go on.
  const providerEntry = catalog?.providers.find(
    (entry) => entry.name === harness?.provider,
  )
  if (harness && catalog) {
    if (!catalog.types.some((entry) => entry.name === harness.type)) {
      out.push(
        diag(
          `Unknown harness type "${harness.type}"; expected one of ${catalog.types.map((entry) => entry.name).join(', ')}`,
          harness.typeRange,
        ),
      )
    }
    if (!providerEntry) {
      out.push(
        diag(
          `Unknown harness provider "${harness.provider}"; expected one of ${catalog.providers.map((entry) => entry.name).join(', ')}`,
          harness.providerRange,
        ),
      )
    }
  }
  const harnessPackage = providerEntry?.package
  const offersClaude =
    catalog?.providers.some((entry) => entry.name === 'claude') ?? false

  for (const pin of computer.software ?? []) {
    if (harness && pin.packageName === harnessPackage) {
      out.push(
        diag(
          `${label} declares harness provider "${harness.provider}", which ships "${harnessPackage}"; remove "${harnessPackage}" from software: because Swirls owns the harness version`,
          pin.range,
        ),
      )
      continue
    }
    if (offersClaude && pin.packageName === NIX_CLAUDE_CODE_PACKAGE) {
      out.push(
        diag(
          `${label} pins "${NIX_CLAUDE_CODE_PACKAGE}" in software:, but nixpkgs rewrites that binary and Anthropic's hosted conditions do not allow a modified binary; use harness: { type: coding, provider: claude } instead`,
          pin.range,
          'warning',
        ),
      )
    }
  }

  const resources = computer.resources
  if (!harness || !resources) {
    return out
  }
  if (resources.cpus !== undefined && resources.cpus < HARNESS_MIN_CPUS) {
    out.push(
      diag(
        `${label} runs the ${harness.provider} harness with resources.cpus: ${resources.cpus}; coding harnesses need at least ${HARNESS_MIN_CPUS} CPUs`,
        resources.cpusRange ?? resources.range,
        'warning',
      ),
    )
  }
  if (
    resources.memoryMiB !== undefined &&
    resources.memoryMiB < HARNESS_MIN_MEMORY_MIB
  ) {
    out.push(
      diag(
        `${label} runs the ${harness.provider} harness with resources.memoryMiB: ${resources.memoryMiB}; coding harnesses need at least ${HARNESS_MIN_MEMORY_MIB} MiB`,
        resources.memoryMiBRange ?? resources.range,
        'warning',
      ),
    )
  }
  return out
}

function diskBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, DiskDecl> {
  const m = new Map<string, DiskDecl>()
  for (const disk of ast.disk ?? []) {
    m.set(disk.name, disk)
  }
  if (workspace?.diskBlocks) {
    for (const [name, decl] of workspace.diskBlocks) {
      m.set(name, decl)
    }
  }
  return m
}

function computerBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, ComputerDecl> {
  const m = new Map<string, ComputerDecl>()
  for (const computer of ast.computer ?? []) {
    m.set(computer.name, computer)
  }
  if (workspace?.computerBlocks) {
    for (const [name, decl] of workspace.computerBlocks) {
      m.set(name, decl)
    }
  }
  return m
}

function workflowsForBindings(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): WorkflowDecl[] {
  const byName = new Map<string, WorkflowDecl>()
  for (const workflow of workspace?.workflowBlocks?.values() ?? []) {
    byName.set(workflow.name, workflow)
  }
  for (const workflow of ast.workflows ?? []) {
    byName.set(workflow.name, workflow)
  }
  return [...byName.values()]
}

function agentsForBindings(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): AgentDecl[] {
  const byName = new Map<string, AgentDecl>()
  for (const agent of workspace?.agentBlocks?.values() ?? []) {
    byName.set(agent.name, agent)
  }
  for (const agent of ast.agent ?? []) {
    byName.set(agent.name, agent)
  }
  return [...byName.values()]
}

function boundComputerNames(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Set<string> {
  const names = new Set<string>()
  for (const workflow of workflowsForBindings(ast, workspace)) {
    for (const node of workflow.nodes) {
      if (node.type !== 'shell') {
        continue
      }
      const cv = node.configFields.computer
      if (cv?.kind === 'string' && cv.value.trim()) {
        names.add(cv.value.trim())
      }
    }
  }
  for (const agent of agentsForBindings(ast, workspace)) {
    const name = agent.computer?.trim()
    if (name) {
      names.add(name)
    }
  }
  return names
}

/** The guest environment flattens every `secrets:` block into one name space. */
function validateShellSecretVarsUnique(node: NodeDecl): Diagnostic[] {
  const out: Diagnostic[] = []
  const firstBlock = new Map<string, string>()
  for (const [blockName, vars] of Object.entries(node.secretsMap ?? {})) {
    for (const name of vars) {
      const first = firstBlock.get(name)
      if (first === undefined) {
        firstBlock.set(name, blockName)
        continue
      }
      if (first === blockName) {
        continue
      }
      const range =
        node.secretsMapBlockRanges?.find(
          (entry) => entry.blockName === blockName,
        )?.range ?? node.range
      out.push(
        diag(
          `secret var "${name}" is listed by both "${first}" and "${blockName}"; a shell guest gets one value per name`,
          range,
        ),
      )
    }
  }
  return out
}

export function validateShellNodes(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const computers = computerBlockMap(ast, options?.workspace)

  function checkNode(node: NodeDecl) {
    if (node.type !== 'shell') {
      return
    }

    if (node.outputFormat) {
      out.push(diag('Node type "shell" does not accept "format"', node.range))
    }

    const computerCv = node.configFields.computer
    if (computerCv) {
      if (computerCv.kind !== 'string' || !computerCv.value.trim()) {
        out.push(
          diag(
            'Shell node "computer" must name a top-level computer block',
            computerCv.range,
          ),
        )
      } else if (!computers.has(computerCv.value.trim())) {
        out.push(
          diag(
            `Shell node references undefined computer block "${computerCv.value.trim()}"`,
            computerCv.range,
          ),
        )
      }
    }

    const commandCv = node.configFields.command
    if (commandCv && !commandPresent(commandCv)) {
      out.push(
        diag(
          'Shell node requires a non-empty "command" field',
          commandCv.range ?? node.range,
        ),
      )
    }

    out.push(...validateShellSecretVarsUnique(node))
  }

  for (const workflow of ast.workflows ?? []) {
    for (const node of workflow.nodes) {
      checkNode(node)
    }
  }

  return out
}
