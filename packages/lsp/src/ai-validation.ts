/**
 * Validates AI node config: root-level (model, prompt, etc.) and options (kind-specific only).
 */

import type { ConfigValue, NodeDecl, SourceRange } from '@swirls/language'

interface AiValidationDiagnostic {
  message: string
  range: SourceRange
  severity?: 'error' | 'warning'
}

const ROOT_KEYS = new Set([
  'kind',
  'model',
  'prompt',
  'temperature',
  'maxTokens',
  'options',
])

/** Kind-specific keys allowed inside options (only these). */
const KIND_OPTIONS_KEYS: Record<string, Set<string>> = {
  text: new Set(),
  object: new Set(),
  image: new Set(['n', 'size', 'aspectRatio']),
  video: new Set(),
  embed: new Set(),
}

function getKindFromNode(node: NodeDecl): string | undefined {
  const cv = node.configFields.kind
  return cv && cv.kind === 'string' ? (cv.value as string) : undefined
}

function getOptionsFromNode(
  node: NodeDecl,
): Record<string, ConfigValue> | null {
  const cv = node.configFields.options
  if (!cv || cv.kind !== 'object') {
    return null
  }
  return cv.value
}

function getConfigFieldRange(
  node: NodeDecl,
  key: string,
): SourceRange | undefined {
  const cv = node.configFields[key]
  return cv?.range
}

/**
 * Returns validation diagnostics for all AI nodes in the given graph nodes.
 */
export function getAiNodeOptionsDiagnostics(
  nodes: NodeDecl[],
): AiValidationDiagnostic[] {
  const out: AiValidationDiagnostic[] = []

  for (const node of nodes) {
    if (node.type !== 'ai') {
      continue
    }

    const kind = getKindFromNode(node)
    if (!kind) {
      continue
    }

    const allowedOptions = KIND_OPTIONS_KEYS[kind]
    if (!allowedOptions) {
      continue
    }

    for (const key of Object.keys(node.configFields)) {
      if (key === 'type' || key === 'label' || key === 'description') {
        continue
      }
      if (!ROOT_KEYS.has(key)) {
        const range = getConfigFieldRange(node, key)
        if (range) {
          out.push({
            message: `Unknown property "${key}" for ai node. Root-level allowed: kind, model, prompt, temperature, maxTokens, options`,
            range,
            severity: 'error',
          })
        }
      }
    }

    if (!('prompt' in node.configFields)) {
      out.push({
        message: `AI kind "${kind}" requires "prompt" at root level`,
        range: node.range,
        severity: 'error',
      })
    }

    const options = getOptionsFromNode(node)
    if (options) {
      for (const key of Object.keys(options)) {
        if (!allowedOptions.has(key)) {
          const cv = options[key]
          const allowed = [...allowedOptions].sort()
          const allowedStr =
            allowed.length > 0 ? allowed.join(', ') : 'none (omit options)'
          out.push({
            message: `Unknown option "${key}" for ai kind "${kind}". Kind-specific options: ${allowedStr}`,
            range: cv.range,
            severity: 'error',
          })
        }
      }
    }
  }

  return out
}
