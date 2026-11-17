/**
 * AST for top-level `mock` blocks (playbook side-effect stubs).
 */

import type { JsonBlockInfo, SourceRange } from '../ast'

export type MockMode = 'all' | 'off' | 'selective'

export interface MockAiConfig {
  provider?: string
  model?: string
  instructions?: string
  range?: SourceRange
}

export interface MockReviewConfig {
  auto: 'approve' | 'reject'
  formData?: JsonBlockInfo
  formDataLiteral?: Record<string, unknown>
  range: SourceRange
}

/** Top-level `mock <name> { … }` — defaults or named action/node/review stub. */
export interface MockDecl {
  name: string
  docComment?: string
  /** Playbook-default mock policy (`mock defaults`). */
  mode?: MockMode
  only?: string[]
  except?: string[]
  ai?: MockAiConfig
  /** Action name this mock intercepts. */
  action?: string
  actionRange?: SourceRange
  /** Workflow that owns the mocked node (required with `node:`). */
  workflow?: string
  workflowRange?: SourceRange
  /** Node name this mock intercepts. */
  node?: string
  nodeRange?: SourceRange
  /** Static output (@json). */
  output?: JsonBlockInfo
  outputLiteral?: Record<string, unknown>
  /** LLM-generated stub; true or inline ai config. */
  generate?: boolean | MockAiConfig
  review?: MockReviewConfig
  range: SourceRange
}
