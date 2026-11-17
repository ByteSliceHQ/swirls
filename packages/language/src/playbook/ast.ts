/**
 * AST for top-level `playbook` blocks (hosted test suites).
 */

import type { ConfigValue, JsonBlockInfo, SourceRange } from '../ast'

export type AssertionSeverity = 'soft' | 'gate'

export type ExpectStatus = 'completed' | 'failed' | 'waiting'

export type ExpectAssertion =
  | {
      kind: 'status'
      status: ExpectStatus
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'duration'
      max: string
      maxSeconds?: number
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'output'
      value?: JsonBlockInfo
      literal?: Record<string, unknown>
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'nodeOutput'
      node: string
      value?: JsonBlockInfo
      literal?: Record<string, unknown>
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'nodeStatus'
      node: string
      status: ExpectStatus
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'includes'
      value: string
      on?: string
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'matches'
      value: string
      on?: string
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'equals'
      value?: JsonBlockInfo
      literal?: unknown
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'similar'
      to: string
      min: number
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'events'
      events: string[]
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'called'
      names: string[]
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'notCalled'
      names: string[]
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'order'
      names: string[]
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'path'
      names: string[]
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }
  | {
      kind: 'budget'
      duration?: string
      durationSeconds?: number
      tokens?: number
      cost?: number
      severity?: AssertionSeverity
      label?: string
      range: SourceRange
    }

export interface ExpectDecl {
  assertions: ExpectAssertion[]
  range: SourceRange
}

export interface PlaybookCaseDecl {
  name: string
  workflow: string
  workflowRange?: SourceRange
  input?: JsonBlockInfo
  inputLiteral?: Record<string, unknown>
  dataset?: JsonBlockInfo
  timeout?: string
  timeoutSeconds?: number
  tags?: string[]
  skip?: string
  expect?: ExpectDecl
  range: SourceRange
}

export interface JudgeDecl {
  rubric?: string
  criteria?: string
  minScore?: number
  severity?: AssertionSeverity
  label?: string
  model?: string
  /** Deterministic @ts scorer over execution outputs. */
  ts?: ConfigValue
  range: SourceRange
}

export interface PlaybookEvalDecl {
  name: string
  workflow: string
  workflowRange?: SourceRange
  input?: JsonBlockInfo
  inputLiteral?: Record<string, unknown>
  dataset?: JsonBlockInfo
  timeout?: string
  timeoutSeconds?: number
  retries?: number
  tags?: string[]
  skip?: string
  judge?: JudgeDecl
  expect?: ExpectDecl
  range: SourceRange
}

/** Top-level `playbook <name> { … }` suite. */
export interface PlaybookDecl {
  name: string
  label?: string
  description?: string
  docComment?: string
  /** Reference to a `mock` block name. */
  mocks?: string
  mocksRange?: SourceRange
  tags?: string[]
  cases: PlaybookCaseDecl[]
  evals: PlaybookEvalDecl[]
  range: SourceRange
}
