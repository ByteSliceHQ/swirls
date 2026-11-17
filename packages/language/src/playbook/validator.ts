/**
 * Validation for `playbook` blocks.
 */

import type { Diagnostic, SwirlsFile } from '../ast'
import { DURATION_SYNTAX_HINT } from '../duration'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { ExpectDecl, PlaybookCaseDecl, PlaybookEvalDecl } from './ast'

function parseJsonCode(
  code: string,
  range: ExpectDecl['range'],
  diagnostics: Diagnostic[],
  label: string,
): unknown {
  try {
    return JSON.parse(code)
  } catch (err) {
    diagnostics.push({
      message: `Invalid JSON in ${label}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      range,
      severity: 'error',
    })
    return null
  }
}

function validateExpect(
  expect: ExpectDecl | undefined,
  diagnostics: Diagnostic[],
  label: string,
  entryRange: ExpectDecl['range'],
  requireAssertions: boolean,
): void {
  if (!expect) {
    if (requireAssertions) {
      diagnostics.push({
        message: `${label} requires an expect { … } block with at least one assertion`,
        range: entryRange,
        severity: 'error',
      })
    }
    return
  }
  if (expect.assertions.length === 0 && requireAssertions) {
    diagnostics.push({
      message: `${label} expect { } must declare at least one assertion`,
      range: expect.range,
      severity: 'error',
    })
  }
  for (const assertion of expect.assertions) {
    if (assertion.kind === 'output' && assertion.value) {
      parseJsonCode(assertion.value.code, assertion.range, diagnostics, 'output')
    }
    if (assertion.kind === 'nodeOutput' && assertion.value) {
      parseJsonCode(
        assertion.value.code,
        assertion.range,
        diagnostics,
        `node ${assertion.node}.output`,
      )
    }
    if (assertion.kind === 'equals' && assertion.value) {
      parseJsonCode(assertion.value.code, assertion.range, diagnostics, 'equals')
    }
    if (assertion.kind === 'duration' && assertion.maxSeconds == null) {
      diagnostics.push({
        message: `Invalid duration max — expected ${DURATION_SYNTAX_HINT}`,
        range: assertion.range,
        severity: 'error',
      })
    }
  }
}

function validateCaseLike(
  entry: PlaybookCaseDecl | PlaybookEvalDecl,
  kind: 'case' | 'eval',
  playbookName: string,
  diagnostics: Diagnostic[],
  idx: WorkspaceResourceIndex | undefined,
): void {
  const label = `playbook "${playbookName}" ${kind} "${entry.name}"`
  if (!entry.workflow) {
    diagnostics.push({
      message: `${label} requires workflow: <name>`,
      range: entry.range,
      severity: 'error',
    })
  } else if (idx) {
    const workflowNames = nameLookup(new Set(), idx.workflows)
    if (!workflowNames.has(entry.workflow)) {
      diagnostics.push({
        message: `${label} references unknown workflow "${entry.workflow}"`,
        range: entry.workflowRange ?? entry.range,
        severity: 'error',
      })
    }
  }

  if (entry.timeout && entry.timeoutSeconds == null) {
    diagnostics.push({
      message: `${label} timeout must be ${DURATION_SYNTAX_HINT}`,
      range: entry.range,
      severity: 'error',
    })
  }

  if (entry.input) {
    parseJsonCode(entry.input.code, entry.range, diagnostics, `${label} input`)
  }
  if (entry.dataset) {
    const parsed = parseJsonCode(
      entry.dataset.code,
      entry.range,
      diagnostics,
      `${label} dataset`,
    )
    if (parsed != null && !Array.isArray(parsed)) {
      diagnostics.push({
        message: `${label} dataset must be a JSON array`,
        range: entry.range,
        severity: 'error',
      })
    }
  }

  validateExpect(
    entry.expect,
    diagnostics,
    label,
    entry.range,
    kind === 'case',
  )

  if (kind === 'eval') {
    const ev = entry as PlaybookEvalDecl
    if (!ev.judge && !ev.expect) {
      diagnostics.push({
        message: `${label} requires judge: { … } and/or expect { … }`,
        range: entry.range,
        severity: 'error',
      })
    }
  }
}

export function validatePlaybookBlocks(
  ast: SwirlsFile,
  idx?: WorkspaceResourceIndex,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const seenPlaybooks = new Set<string>()

  for (const playbook of ast.playbooks ?? []) {
    if (seenPlaybooks.has(playbook.name)) {
      diagnostics.push({
        message: `Duplicate playbook "${playbook.name}"`,
        range: playbook.range,
        severity: 'error',
      })
    }
    seenPlaybooks.add(playbook.name)

    if (playbook.mocks) {
      const inFile = (ast.mocks ?? []).some((m) => m.name === playbook.mocks)
      const mockNames = nameLookup(new Set(), idx?.mocks)
      if (!inFile && !mockNames.has(playbook.mocks)) {
        diagnostics.push({
          message: `playbook "${playbook.name}" mocks: references unknown mock "${playbook.mocks}"`,
          range: playbook.mocksRange ?? playbook.range,
          severity: 'error',
        })
      }
    }

    if (playbook.cases.length === 0 && playbook.evals.length === 0) {
      diagnostics.push({
        message: `playbook "${playbook.name}" must declare at least one case or eval`,
        range: playbook.range,
        severity: 'error',
      })
    }

    const entryNames = new Set<string>()
    for (const c of playbook.cases) {
      if (entryNames.has(c.name)) {
        diagnostics.push({
          message: `Duplicate case/eval name "${c.name}" in playbook "${playbook.name}"`,
          range: c.range,
          severity: 'error',
        })
      }
      entryNames.add(c.name)
      validateCaseLike(c, 'case', playbook.name, diagnostics, idx)
    }
    for (const e of playbook.evals) {
      if (entryNames.has(e.name)) {
        diagnostics.push({
          message: `Duplicate case/eval name "${e.name}" in playbook "${playbook.name}"`,
          range: e.range,
          severity: 'error',
        })
      }
      entryNames.add(e.name)
      validateCaseLike(e, 'eval', playbook.name, diagnostics, idx)
    }
  }

  return diagnostics
}
