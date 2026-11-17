import { type DecisionDefinition, decisionDefinitionSchema } from '@swirls/definition/decision'

import type { ConfigValue, Diagnostic, SourceRange, SwirlsFile } from './ast'
import type { ResourceParserDelegate } from './parser-delegate'
import { resolveNamedSchemasFromDecls } from './schema/named-schema-resolve'
import type { WorkspaceResourceIndex } from './workspace/workspace-resources'

export interface DecisionDecl {
  name: string
  fields: Record<string, unknown>
  fieldRanges: Record<string, SourceRange>
  range: SourceRange
  docComment?: string
}

function parseLiteral(d: ResourceParserDelegate): unknown {
  const token = d.peek()

  if (!token) {
    return undefined
  }

  if (['string', 'number', 'boolean', 'identifier', 'keyword'].includes(token.kind)) {
    d.advance()
    return token.kind === 'identifier' && token.value === 'null' ? null : token.value
  }

  if (token.kind === 'lbrace') {
    d.advance()
    const value: Record<string, unknown> = Object.create(null)

    while (!d.eof() && d.peek()?.kind !== 'rbrace') {
      if (d.peek()?.kind === 'comma' || d.peek()?.kind === 'block_comment') {
        d.advance()
        continue
      }

      const key =
        d.peek()?.kind === 'string' || d.peek()?.kind === 'boolean'
          ? String(d.advance()!.value)
          : d.parsePropertyKey()

      if (!key || !d.expect('colon')) {
        break
      }

      if (Object.hasOwn(value, key)) {
        d.error(`Duplicate decision field "${key}"`, d.peek())
      }

      value[key] = parseLiteral(d)
    }

    d.expect('rbrace')
    return value
  }

  if (token.kind === 'lbracket') {
    d.advance()
    const value: unknown[] = []

    while (!d.eof() && d.peek()?.kind !== 'rbracket') {
      if (d.peek()?.kind === 'comma') {
        d.advance()
        continue
      }

      value.push(parseLiteral(d))
    }

    d.expect('rbracket')
    return value
  }

  d.advance()
  d.error('Decision definitions require literal JSON values', token)
  return undefined
}

export function parseDecisionBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): DecisionDecl | null {
  const start = d.expect('keyword')
  const name = d.expect('identifier')

  if (!start || !name || !d.expect('lbrace')) {
    return null
  }

  const fields: Record<string, unknown> = {}
  const fieldRanges: Record<string, SourceRange> = {}

  while (!d.eof() && d.peek()?.kind !== 'rbrace') {
    const token = d.peek()!

    if (token.kind === 'block_comment' || token.kind === 'comma') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()

    if (!key || !d.expect('colon')) {
      break
    }

    if (Object.hasOwn(fields, key)) {
      d.error(`Duplicate decision property "${key}"`, token)
    }

    fieldRanges[key] = d.peek()?.range ?? token.range
    const value = d.peek()

    if (key === 'secrets' && value?.kind !== 'identifier') {
      d.error('Decision secrets must be a bare secret block reference', value)
    }

    if (value?.kind === 'fenced_block') {
      d.advance()

      if (value.fencedLang !== 'json' || (key !== 'questions' && key !== 'inputSchema')) {
        d.error(`Decision ${key} must be literal`, value)
      } else {
        try {
          fields[key] = JSON.parse(value.fencedContent ?? '')
        } catch {
          d.error(`Invalid JSON in decision ${key}`, value)
        }
      }
    } else {
      fields[key] = parseLiteral(d)
    }
  }

  const end = d.expect('rbrace')
  return {
    name: String(name.value),
    fields,
    fieldRanges,
    range: { start: start.range.start, end: (end ?? name).range.end },
    docComment,
  }
}

export function resolveDecisionDefinition(
  decl: DecisionDecl,
  schemas: Map<string, Record<string, unknown>>,
): DecisionDefinition {
  const input = decl.fields.inputSchema
  return decisionDefinitionSchema.parse({
    ...decl.fields,
    name: decl.name,
    inputSchema: typeof input === 'string' ? schemas.get(input) : input,
  })
}

export function decisionDeclarations(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, DecisionDecl> {
  return new Map([
    ...(workspace?.decisionBlocks ?? []),
    ...(ast.decisions ?? []).map((d) => [d.name, d] as const),
  ])
}

function isLiteralState(value: ConfigValue): boolean {
  if (value.kind === 'object') {
    return Object.values(value.value).every(isLiteralState)
  }

  if (value.kind === 'array') {
    return value.value.every(isLiteralState)
  }

  return ['string', 'number', 'boolean', 'null'].includes(value.kind)
}

export function validateDecisions(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const add = (message: string, range: SourceRange, severity: 'error' | 'warning' = 'error') =>
    diagnostics.push({ message, range, severity })

  const schemas = new Map([
    ...(workspace?.schemaLiterals ?? []),
    ...resolveNamedSchemasFromDecls(ast.schemas ?? []).map,
  ])

  const secrets = new Map<string, { vars: string[]; type?: string }>([
    ...(workspace?.secrets ?? []),
    ...ast.secrets.map((s) => [s.name, s] as const),
  ])

  const names = new Set<string>()

  for (const d of ast.decisions ?? []) {
    if (names.has(d.name) || (workspace?.decisions?.get(d.name)?.length ?? 0) > 1) {
      add(`Duplicate decision name "${d.name}"`, d.range)
    }

    names.add(d.name)

    const parsed = decisionDefinitionSchema.safeParse({
      ...d.fields,
      name: d.name,
      inputSchema:
        typeof d.fields.inputSchema === 'string'
          ? schemas.get(d.fields.inputSchema)
          : d.fields.inputSchema,
    })

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        add(
          `Decision ${d.name}.${issue.path.join('.')}: ${issue.message}`,
          d.fieldRanges[String(issue.path[0])] ?? d.range,
        )
      }
    }

    const secret = secrets.get(String(d.fields.secrets))

    if (!secret) {
      add(
        'Decision requires a reference to an existing secret block',
        d.fieldRanges.secrets ?? d.range,
      )
    } else if (!secret.vars.includes('TYPESAFE_API_KEY')) {
      add('Decision secret block must declare TYPESAFE_API_KEY', d.fieldRanges.secrets ?? d.range)
    }

    if (typeof d.fields.model === 'string' && /(?:latest|preview)$/.test(d.fields.model)) {
      add(
        'Decision model alias can move independently of deployment; pin a version for stable thresholds',
        d.fieldRanges.model ?? d.range,
        'warning',
      )
    }
  }

  const declarations = decisionDeclarations(ast, workspace)

  const visit = (nodes: SwirlsFile['workflows'][number]['nodes']) => {
    for (const node of nodes) {
      if (node.subgraph) {
        visit(node.subgraph.nodes)
      }

      if (['decision', 'ai', 'agent'].includes(node.type)) {
        const model = node.configFields.model

        if (
          model &&
          !(
            ['ts_block', 'ts_file_ref'].includes(model.kind) ||
            (model.kind === 'string' && model.value.trim())
          )
        ) {
          add('Model must be a nonempty string or @ts expression returning a string', model.range)
        }
      }

      if (node.type !== 'decision') {
        continue
      }

      const state = node.configFields.state

      if (
        state &&
        !['ts_block', 'ts_file_ref'].includes(state.kind) &&
        (!['string', 'object', 'array'].includes(state.kind) || !isLiteralState(state))
      ) {
        add(
          'Decision state must be a literal string, object or array, or a whole-value @ts expression',
          state.range,
        )
      }

      const ref = node.configFields.decision

      if (ref?.kind !== 'string' || !declarations.has(ref.value)) {
        add('Decision node must reference a declared decision', ref?.range ?? node.range)
      }

      for (const key of Object.keys(node.configFields)) {
        if (!['decision', 'state', 'model', 'failurePolicy'].includes(key)) {
          add(`Decision node does not accept "${key}"`, node.configFields[key]!.range)
        }
      }

      if (node.secretsMap) {
        add(
          'Decision credentials belong on the referenced declaration through secrets: <block>',
          node.range,
        )
      }

      if (node.outputSchema || node.outputSchemaRef || node.inputSchema || node.inputSchemaRef) {
        add(
          'Decision schemas are inferred from the declaration; remove node schema fields',
          node.range,
        )
      }

      if (node.reviewConfig?.enabled !== false && node.reviewConfig != null) {
        add('Use a separate downstream review gate after decision inference', node.range)
      }
    }
  }

  for (const workflow of ast.workflows) {
    visit(workflow.nodes)
  }

  return diagnostics
}
