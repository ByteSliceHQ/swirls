/**
 * Deploy-time checks: JSON Schema on a node vs declared `format:` (leaf output projection).
 */

import type { OutputFormat } from '@swirls/definition/schemas'
import type { JsonSchemaLiteral, NodeDecl } from './ast'

const CT_MARKDOWN = 'text/markdown'
const CT_HTML = 'text/html'
const CT_TEXT = 'text/plain'

export function resolvedOutputSchemaLiteralForNode(
  node: NodeDecl,
  resolvedSchemaLiterals: Map<string, JsonSchemaLiteral>,
): JsonSchemaLiteral | undefined {
  if (node.outputSchema != null) {
    return node.outputSchema as JsonSchemaLiteral
  }
  if (node.outputSchemaRef != null && node.outputSchemaRef !== '') {
    return resolvedSchemaLiterals.get(node.outputSchemaRef)
  }
  return undefined
}

function schemaHasStringRoot(s: JsonSchemaLiteral): boolean {
  const t = s.type
  if (t === 'string') {
    return true
  }
  if (Array.isArray(t) && t.includes('string')) {
    return true
  }
  return false
}

function schemaBranches(s: JsonSchemaLiteral): JsonSchemaLiteral[] {
  const anyOf = s.anyOf
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    return anyOf as JsonSchemaLiteral[]
  }
  const oneOf = s.oneOf
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return oneOf as JsonSchemaLiteral[]
  }
  return []
}

/** Empty / unspecified schema does not constrain projection — compatible. */
export function schemaCompatibleWithOutputFormat(
  schema: JsonSchemaLiteral | undefined,
  format: OutputFormat,
): boolean {
  if (schema === undefined || Object.keys(schema).length === 0) {
    return true
  }
  if (format === 'json' || format === 'mixed') {
    return true
  }
  return walkSchema(schema, format)
}

function walkSchema(s: JsonSchemaLiteral, format: OutputFormat): boolean {
  const branches = schemaBranches(s)
  if (branches.length > 0) {
    return branches.some((b) => walkSchema(b, format))
  }

  switch (format) {
    case 'markdown':
      return allowsMarkdown(s)
    case 'html':
      return allowsHtml(s)
    case 'text':
      return allowsPlainText(s)
    case 'image':
    case 'video':
    case 'audio':
      return allowsMediaUrl(s)
    default:
      return false
  }
}

function allowsMarkdown(s: JsonSchemaLiteral): boolean {
  if (schemaHasStringRoot(s)) {
    return true
  }
  const props = s.properties
  if (props && typeof props === 'object') {
    for (const [k, sub] of Object.entries(props)) {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        continue
      }
      const subLit = sub as JsonSchemaLiteral
      if (subLit.contentMediaType === CT_MARKDOWN) {
        return true
      }
      if (k === 'markdown' && subLit.type === 'string') {
        return true
      }
    }
  }
  return false
}

function allowsHtml(s: JsonSchemaLiteral): boolean {
  if (schemaHasStringRoot(s)) {
    return true
  }
  const props = s.properties
  if (props && typeof props === 'object') {
    for (const [k, sub] of Object.entries(props)) {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        continue
      }
      const subLit = sub as JsonSchemaLiteral
      if (subLit.contentMediaType === CT_HTML) {
        return true
      }
      if (k === 'html' && subLit.type === 'string') {
        return true
      }
    }
  }
  return false
}

function allowsPlainText(s: JsonSchemaLiteral): boolean {
  if (schemaHasStringRoot(s)) {
    return true
  }
  const props = s.properties
  if (props && typeof props === 'object') {
    for (const [k, sub] of Object.entries(props)) {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        continue
      }
      const subLit = sub as JsonSchemaLiteral
      if (subLit.contentMediaType === CT_TEXT) {
        return true
      }
      if (k === 'text' && subLit.type === 'string') {
        return true
      }
    }
  }
  return false
}

function allowsMediaUrl(s: JsonSchemaLiteral): boolean {
  if (schemaHasStringRoot(s)) {
    return true
  }
  const propMap = s.properties as Record<string, JsonSchemaLiteral> | undefined
  const urlProp = propMap?.url
  if (urlProp && typeof urlProp === 'object' && !Array.isArray(urlProp)) {
    const u = urlProp as JsonSchemaLiteral
    if (u.type === 'string') {
      return true
    }
    const tu = u.type
    if (Array.isArray(tu) && tu.includes('string')) {
      return true
    }
  }
  return false
}
