/**
 * Validation for `mock` blocks (shape, cross-refs, schema compatibility).
 */

import type { ActionDecl } from '../action/ast'
import type {
  Diagnostic,
  JsonSchemaLiteral,
  NodeDecl,
  SourceRange,
  SwirlsFile,
  WorkflowDecl,
} from '../ast'
import { resolvedOutputSchemaLiteralForNode } from '../format-output-compat'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { MockDecl } from './ast'
import {
  checkJsonSchemaPayload,
  formatSchemaFailures,
} from './json-schema-check'

export type ValidateMockBlocksOptions = {
  workspace?: WorkspaceResourceIndex
  /** Resolved named schemas (local file + workspace). */
  schemaLiterals?: Map<string, JsonSchemaLiteral>
}

function diag(
  message: string,
  range: SourceRange,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { message, range, severity }
}

function parseJsonCode(
  code: string,
  range: SourceRange,
  diagnostics: Diagnostic[],
  label: string,
): unknown {
  try {
    return JSON.parse(code)
  } catch (err) {
    diagnostics.push(
      diag(
        `Invalid JSON in ${label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        range,
      ),
    )
    return null
  }
}

function walkNodes(
  nodes: NodeDecl[],
  workflowName: string,
  out: Array<{ workflowName: string; node: NodeDecl }>,
): void {
  for (const node of nodes) {
    out.push({ workflowName, node })
    if (node.subgraph?.nodes?.length) {
      walkNodes(node.subgraph.nodes, workflowName, out)
    }
  }
}

function collectWorkflowNodes(
  workflows: Iterable<WorkflowDecl>,
): Array<{ workflowName: string; node: NodeDecl }> {
  const out: Array<{ workflowName: string; node: NodeDecl }> = []
  for (const workflow of workflows) {
    walkNodes(workflow.nodes ?? [], workflow.name, out)
  }
  return out
}

function resolveReviewSchema(
  node: NodeDecl,
  schemaLiterals: Map<string, JsonSchemaLiteral>,
): JsonSchemaLiteral | undefined {
  const rc = node.reviewConfig
  if (!rc || typeof rc !== 'object' || Array.isArray(rc)) {
    return undefined
  }
  const record = rc as Record<string, unknown>
  if (
    record.schema &&
    typeof record.schema === 'object' &&
    !Array.isArray(record.schema)
  ) {
    return record.schema as JsonSchemaLiteral
  }
  const ref = record.schemaRef
  if (typeof ref === 'string' && ref !== '') {
    return schemaLiterals.get(ref)
  }
  return undefined
}

function reviewEnabled(node: NodeDecl): boolean {
  const rc = node.reviewConfig
  if (!rc || typeof rc !== 'object' || Array.isArray(rc)) {
    return false
  }
  return (rc as Record<string, unknown>).enabled !== false
}

function resolveActionOutputSchema(
  action: ActionDecl,
  schemaLiterals: Map<string, JsonSchemaLiteral>,
): JsonSchemaLiteral | undefined {
  if (action.output != null) {
    return action.output
  }
  if (action.outputRef) {
    return schemaLiterals.get(action.outputRef)
  }
  if (action.outputBlock?.code) {
    try {
      return JSON.parse(action.outputBlock.code) as JsonSchemaLiteral
    } catch {
      return undefined
    }
  }
  return undefined
}

function resolveMockFormDataPayload(mock: MockDecl): unknown {
  if (mock.review?.formDataLiteral !== undefined) {
    return {
      approved: mock.review.auto !== 'reject',
      ...mock.review.formDataLiteral,
    }
  }
  if (mock.review?.formData?.code) {
    try {
      const parsed = JSON.parse(mock.review.formData.code) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          approved: mock.review.auto !== 'reject',
          ...(parsed as Record<string, unknown>),
        }
      }
    } catch {
      // Invalid JSON reported separately.
    }
  }
  return { approved: mock.review?.auto !== 'reject' }
}

function reportSchemaFailures(
  diagnostics: Diagnostic[],
  label: string,
  schema: JsonSchemaLiteral,
  value: unknown,
  range: SourceRange,
): void {
  const failures = checkJsonSchemaPayload(schema, value)
  if (failures) {
    diagnostics.push(diag(formatSchemaFailures(label, failures), range))
  }
}

export function validateMockBlocks(
  ast: SwirlsFile,
  options?: ValidateMockBlocksOptions,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if ((ast.mocks ?? []).length === 0) {
    return diagnostics
  }

  const workspace = options?.workspace
  const schemaLiterals = options?.schemaLiterals ?? new Map()
  const seen = new Map<string, MockDecl>()

  const localActions = new Map(
    (ast.actions ?? []).map((a) => [a.name, a] as const),
  )
  const actionLookup = nameLookup(
    new Set(localActions.keys()),
    workspace?.actions,
  )

  const workflowByName = new Map<string, WorkflowDecl>()
  for (const w of ast.workflows ?? []) {
    workflowByName.set(w.name, w)
  }
  if (workspace?.workflowBlocks) {
    for (const [name, w] of workspace.workflowBlocks) {
      if (!workflowByName.has(name)) {
        workflowByName.set(name, w)
      }
    }
  }
  const workflowNameLookup = nameLookup(
    new Set(workflowByName.keys()),
    workspace?.workflows,
  )
  const allNodes = collectWorkflowNodes(workflowByName.values())

  for (const mock of ast.mocks ?? []) {
    const prev = seen.get(mock.name)
    if (prev) {
      diagnostics.push(diag(`Duplicate mock block "${mock.name}"`, mock.range))
    } else {
      seen.set(mock.name, mock)
    }

    const isDefaults = mock.name === 'defaults'
    if (isDefaults) {
      if (mock.action || mock.node || mock.output || mock.review) {
        diagnostics.push(
          diag(
            'mock defaults may only set mode/only/except/ai — use named mocks for action/node/review stubs',
            mock.range,
          ),
        )
      }
    }

    if (mock.mode === 'selective' && (!mock.only || mock.only.length === 0)) {
      diagnostics.push(
        diag('mock mode: selective requires only: […]', mock.range),
      )
    }

    if (mock.action && mock.node) {
      diagnostics.push(
        diag('mock cannot set both action: and node:', mock.range),
      )
    }

    let outputPayload: unknown | undefined
    if (mock.output) {
      const parsed = parseJsonCode(
        mock.output.code,
        mock.output.innerRange ?? mock.range,
        diagnostics,
        'mock output',
      )
      if (parsed !== null) {
        outputPayload = parsed
      }
    } else if (mock.outputLiteral !== undefined) {
      outputPayload = mock.outputLiteral
    }

    if (mock.review?.formData) {
      parseJsonCode(
        mock.review.formData.code,
        mock.review.formData.innerRange ?? mock.review.range,
        diagnostics,
        'mock review formData',
      )
    }

    // --- action: existence + output schema ---
    if (mock.action) {
      if (!actionLookup.has(mock.action)) {
        diagnostics.push(
          diag(
            `mock "${mock.name}" action: references unknown action "${mock.action}"`,
            mock.actionRange ?? mock.range,
          ),
        )
      } else {
        const action =
          localActions.get(mock.action) ??
          workspace?.actionBlocks.get(mock.action)
        if (action && outputPayload !== undefined) {
          const outputSchema = resolveActionOutputSchema(action, schemaLiterals)
          if (outputSchema) {
            reportSchemaFailures(
              diagnostics,
              `mock "${mock.name}" output`,
              outputSchema,
              outputPayload,
              mock.output?.innerRange ?? mock.range,
            )
          }
        }
      }
    }

    // --- node: existence + review / output schema ---
    if (mock.node) {
      if (!mock.workflow) {
        diagnostics.push(
          diag(
            `mock "${mock.name}" node: requires workflow: <name> to disambiguate the target node`,
            mock.nodeRange ?? mock.range,
          ),
        )
      } else if (!workflowNameLookup.has(mock.workflow)) {
        diagnostics.push(
          diag(
            `mock "${mock.name}" workflow: references unknown workflow "${mock.workflow}"`,
            mock.workflowRange ?? mock.range,
          ),
        )
      } else {
        const matches = allNodes.filter(
          (n) => n.workflowName === mock.workflow && n.node.name === mock.node,
        )
        if (matches.length === 0) {
          diagnostics.push(
            diag(
              `mock "${mock.name}" node "${mock.node}" not found in workflow "${mock.workflow}"`,
              mock.nodeRange ?? mock.range,
            ),
          )
        } else {
          const target = matches[0]!
          if (mock.review) {
            if (!reviewEnabled(target.node)) {
              diagnostics.push(
                diag(
                  `mock "${mock.name}" targets node "${mock.node}" in workflow "${mock.workflow}" which has no review: enabled`,
                  mock.nodeRange ?? mock.range,
                ),
              )
            } else {
              const schema = resolveReviewSchema(target.node, schemaLiterals)
              if (schema) {
                reportSchemaFailures(
                  diagnostics,
                  `mock "${mock.name}" review formData`,
                  schema,
                  resolveMockFormDataPayload(mock),
                  mock.review.formData?.innerRange ?? mock.review.range,
                )
              }
            }
          }

          if (outputPayload !== undefined && !mock.action) {
            const outputSchema = resolvedOutputSchemaLiteralForNode(
              target.node,
              schemaLiterals,
            )
            if (outputSchema) {
              reportSchemaFailures(
                diagnostics,
                `mock "${mock.name}" output`,
                outputSchema,
                outputPayload,
                mock.output?.innerRange ?? mock.range,
              )
            }
          }
        }
      }
    }

    if (mock.workflow && !mock.node) {
      diagnostics.push(
        diag(
          `mock "${mock.name}" workflow: requires node: when scoping a workflow node mock`,
          mock.workflowRange ?? mock.range,
        ),
      )
    }

    // Unscoped review cannot be checked against a node schema.
    if (mock.review && !mock.node) {
      diagnostics.push(
        diag(
          `mock "${mock.name}" review is not bound to a workflow/node — add workflow: and node: so formData can be checked against the review schema`,
          mock.review.range,
          'warning',
        ),
      )
    }

    // Output without a target cannot be schema-checked.
    if (
      (mock.output || mock.outputLiteral !== undefined) &&
      !mock.action &&
      !mock.node &&
      !isDefaults
    ) {
      diagnostics.push(
        diag(
          `mock "${mock.name}" output requires action: or node: so it can be checked against an output schema`,
          mock.output?.innerRange ?? mock.range,
          'warning',
        ),
      )
    }
  }

  return diagnostics
}
