import type {
  ActionDecl,
  AgentDecl,
  AuthDecl,
  ChannelDecl,
  ComputerDecl,
  ComputerHarnessDecl,
  ConnectionDecl,
  ConnectorDecl,
  DiskDecl,
  FormDecl,
  McpDecl,
  MockDecl,
  NodeDecl,
  PlaybookDecl,
  PolicyDecl,
  PostgresDecl,
  RoleDecl,
  ScheduleDecl,
  SchemaDecl,
  SecretsDecl,
  SkillDecl,
  StreamDecl,
  SwirlsFile,
  TriggerDecl,
  ViewDecl,
  WebhookDecl,
  WorkflowDecl,
} from '@swirls/language'
import {
  HARNESS_PROVIDER_DESCRIPTIONS,
  HARNESS_PROVIDER_PACKAGES,
  HARNESS_PROVIDERS,
  HARNESS_TYPE_DESCRIPTIONS,
  HARNESS_TYPES,
} from '@swirls/language'
import type { Position, Range } from 'vscode-languageserver'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import { positionInRange } from './ts-service/virtual-docs'

/** Markdown content for hover on the `review` property key in a node block. */
export const REVIEW_PROPERTY_HOVER =
  '**Human review** — When enabled, execution pauses at this node for approval.\n\n' +
  'Use `review: true` or `review: { enabled, title, description, content, schema, actions, ... }`. ' +
  'Title, description, and content can be string literals or @ts { } blocks. Schema can be a JSON object or @json { } block.'

/** Return the identifier (word) that contains the given position, or null. */
export function getWordAtPosition(
  document: TextDocument,
  position: Position,
): string | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: 1 << 20 },
  })

  const regex = /[a-zA-Z0-9_]+/g
  let match = regex.exec(line)

  while (match !== null) {
    const start = match.index
    const end = match.index + match[0].length

    if (position.character >= start && position.character <= end) {
      return match[0]
    }

    match = regex.exec(line)
  }

  return null
}

/** Declaration shape used for hover (all decl types have range; most have optional description). */
export type DeclWithDoc = {
  docComment?: string
  description?: string
  range: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
}

type SwirlsDeclaration =
  | { type: 'form'; decl: FormDecl }
  | { type: 'webhook'; decl: WebhookDecl }
  | { type: 'schedule'; decl: ScheduleDecl }
  | { type: 'graph'; decl: WorkflowDecl }
  | { type: 'stream'; decl: StreamDecl }
  | { type: 'view'; decl: ViewDecl }
  | { type: 'schema'; decl: SchemaDecl }
  | { type: 'secret'; decl: SecretsDecl }
  | { type: 'auth'; decl: AuthDecl }
  | { type: 'postgres'; decl: PostgresDecl }
  | { type: 'skill'; decl: SkillDecl }
  | { type: 'disk'; decl: DiskDecl }
  | { type: 'computer'; decl: ComputerDecl }
  | { type: 'agent'; decl: AgentDecl }
  | {
      type: 'decision'
      decl: import('@swirls/language').DecisionDecl & { description?: string }
    }
  | { type: 'mcp'; decl: McpDecl }
  | { type: 'channel'; decl: ChannelDecl }
  | { type: 'connection'; decl: ConnectionDecl }
  | { type: 'connector'; decl: ConnectorDecl }
  | { type: 'action'; decl: ActionDecl }
  | { type: 'mock'; decl: MockDecl }
  | { type: 'playbook'; decl: PlaybookDecl }
  | { type: 'role'; decl: RoleDecl }
  | { type: 'policy'; decl: PolicyDecl }
  | { type: 'trigger'; decl: TriggerDecl }
  | { type: 'node'; decl: NodeDecl; graph: WorkflowDecl }

/**
 * Resolve the swirls declaration at the given position (form, webhook, schedule, graph, trigger, or node).
 * Used for hover and other symbol-based features.
 */
export function getDeclarationAtPosition(
  document: TextDocument,
  position: Position,
  ast: SwirlsFile,
  workspace?: import('@swirls/language/workspace').WorkspaceResourceIndex,
): SwirlsDeclaration | null {
  const word = getWordAtPosition(document, position)

  if (!word) {
    return null
  }

  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: 1 << 20 },
  })

  const trimmed = lineText.trim()
  const line = position.line
  const character = position.character

  // Top-level: form Name { ... }
  const formMatch = trimmed.match(/^\s*form\s+([a-zA-Z0-9_]+)/)

  if (formMatch && (word === 'form' || word === formMatch[1])) {
    const form = ast.forms.find((f) => f.name === formMatch[1])

    if (form) {
      return { type: 'form', decl: form }
    }
  }

  const webhookMatch = trimmed.match(/^\s*webhook\s+([a-zA-Z0-9_]+)/)

  if (webhookMatch && (word === 'webhook' || word === webhookMatch[1])) {
    const webhook = ast.webhooks.find((w) => w.name === webhookMatch[1])

    if (webhook) {
      return { type: 'webhook', decl: webhook }
    }
  }

  const scheduleMatch = trimmed.match(/^\s*schedule\s+([a-zA-Z0-9_]+)/)

  if (scheduleMatch && (word === 'schedule' || word === scheduleMatch[1])) {
    const schedule = ast.schedules.find((s) => s.name === scheduleMatch[1])

    if (schedule) {
      return { type: 'schedule', decl: schedule }
    }
  }

  const workflowMatch =
    trimmed.match(/^\s*workflow\s+([a-zA-Z0-9_]+)/) ??
    trimmed.match(/^\s*graph\s+([a-zA-Z0-9_]+)/)

  if (
    workflowMatch &&
    (word === 'workflow' || word === 'graph' || word === workflowMatch[1])
  ) {
    const graph = ast.workflows.find((g) => g.name === workflowMatch[1])

    if (graph) {
      return { type: 'graph', decl: graph }
    }
  }

  const streamMatch = trimmed.match(/^\s*stream\s+([a-zA-Z0-9_]+)/)

  if (streamMatch && (word === 'stream' || word === streamMatch[1])) {
    const stream = ast.streams?.find((s) => s.name === streamMatch[1])

    if (stream) {
      return { type: 'stream', decl: stream }
    }
  }

  const viewMatch = trimmed.match(/^\s*view\s+([a-zA-Z0-9_]+)/)

  if (viewMatch && (word === 'view' || word === viewMatch[1])) {
    const view = ast.views?.find((v) => v.name === viewMatch[1])

    if (view) {
      return { type: 'view', decl: view }
    }
  }

  const schemaMatch = trimmed.match(/^\s*schema\s+([a-zA-Z0-9_]+)/)

  if (schemaMatch && (word === 'schema' || word === schemaMatch[1])) {
    const schema = ast.schemas.find((s) => s.name === schemaMatch[1])

    if (schema) {
      return { type: 'schema', decl: schema }
    }
  }

  const secretMatch = trimmed.match(/^\s*secret\s+([a-zA-Z0-9_]+)/)

  if (secretMatch && (word === 'secret' || word === secretMatch[1])) {
    const secret = ast.secrets.find((s) => s.name === secretMatch[1])

    if (secret) {
      return { type: 'secret', decl: secret }
    }
  }

  const authMatch = trimmed.match(/^\s*auth\s+([a-zA-Z0-9_]+)/)

  if (authMatch && (word === 'auth' || word === authMatch[1])) {
    const auth = ast.auths.find((a) => a.name === authMatch[1])

    if (auth) {
      return { type: 'auth', decl: auth }
    }
  }

  const postgresMatch = trimmed.match(/^\s*postgres\s+([a-zA-Z0-9_]+)/)

  if (postgresMatch && (word === 'postgres' || word === postgresMatch[1])) {
    const postgres = ast.postgres.find((p) => p.name === postgresMatch[1])

    if (postgres) {
      return { type: 'postgres', decl: postgres }
    }
  }

  const skillMatch = trimmed.match(/^\s*skill\s+([a-zA-Z0-9_]+)/)

  if (skillMatch && (word === 'skill' || word === skillMatch[1])) {
    const skill = ast.skill?.find((s) => s.name === skillMatch[1])

    if (skill) {
      return { type: 'skill', decl: skill }
    }
  }

  const diskMatch = trimmed.match(/^\s*disk\s+([a-zA-Z0-9_]+)/)

  if (diskMatch && (word === 'disk' || word === diskMatch[1])) {
    const disk = ast.disk?.find((d) => d.name === diskMatch[1])

    if (disk) {
      return { type: 'disk', decl: disk }
    }
  }

  const computerMatch = trimmed.match(/^\s*computer\s+([a-zA-Z0-9_]+)/)

  if (computerMatch && (word === 'computer' || word === computerMatch[1])) {
    const computer = ast.computer?.find((d) => d.name === computerMatch[1])

    if (computer) {
      return { type: 'computer', decl: computer }
    }
  }

  const decisionMatch = trimmed.match(/^\s*decision\s+([a-zA-Z0-9_]+)/)
  const declaration = ast.decisions?.find((d) => d.name === decisionMatch?.[1])
  if (declaration && (word === 'decision' || word === declaration.name)) {
    return {
      type: 'decision',
      decl: {
        ...declaration,
        description:
          typeof declaration.fields.description === 'string'
            ? declaration.fields.description
            : 'Typed Choice, Score and Noul questions evaluated together by Jev. Credentials use the named secret block.',
      },
    }
  }

  const agentMatch = trimmed.match(/^\s*agent\s+([a-zA-Z0-9_]+)/)

  if (agentMatch && (word === 'agent' || word === agentMatch[1])) {
    const agent = ast.agent?.find((a) => a.name === agentMatch[1])

    if (agent) {
      return { type: 'agent', decl: agent }
    }
  }

  const mcpMatch = trimmed.match(/^\s*mcp\s+([a-zA-Z0-9_]+)/)

  if (mcpMatch && (word === 'mcp' || word === mcpMatch[1])) {
    const mcp = ast.mcp?.find((m) => m.name === mcpMatch[1])

    if (mcp) {
      return { type: 'mcp', decl: mcp }
    }
  }

  const channelMatch = trimmed.match(/^\s*channel\s+([a-zA-Z0-9_]+)/)

  if (channelMatch && (word === 'channel' || word === channelMatch[1])) {
    const channel = ast.channels?.find((c) => c.name === channelMatch[1])

    if (channel) {
      return { type: 'channel', decl: channel }
    }
  }

  const connectionMatch = trimmed.match(/^\s*connection\s+([a-zA-Z0-9_]+)/)

  if (
    connectionMatch &&
    (word === 'connection' || word === connectionMatch[1])
  ) {
    const connection = ast.connections?.find(
      (c) => c.name === connectionMatch[1],
    )

    if (connection) {
      return { type: 'connection', decl: connection }
    }
  }

  const connectorMatch = trimmed.match(/^\s*connector\s+([a-zA-Z0-9_]+)/)

  if (connectorMatch && (word === 'connector' || word === connectorMatch[1])) {
    const connector = ast.connector?.find((c) => c.name === connectorMatch[1])

    if (connector) {
      return { type: 'connector', decl: connector }
    }
  }

  const actionMatch = trimmed.match(/^\s*action\s+([a-zA-Z0-9_]+)/)

  if (actionMatch && (word === 'action' || word === actionMatch[1])) {
    const action = ast.actions?.find((a) => a.name === actionMatch[1])

    if (action) {
      return { type: 'action', decl: action }
    }
  }

  const mockMatch = trimmed.match(/^\s*mock\s+([a-zA-Z0-9_]+)/)

  if (mockMatch && (word === 'mock' || word === mockMatch[1])) {
    const mock = ast.mocks?.find((m) => m.name === mockMatch[1])

    if (mock) {
      return { type: 'mock', decl: mock }
    }
  }

  const playbookMatch = trimmed.match(/^\s*playbook\s+([a-zA-Z0-9_]+)/)

  if (playbookMatch && (word === 'playbook' || word === playbookMatch[1])) {
    const playbook = ast.playbooks?.find((p) => p.name === playbookMatch[1])

    if (playbook) {
      return { type: 'playbook', decl: playbook }
    }
  }

  const roleMatch = trimmed.match(/^\s*role\s+([a-zA-Z0-9_]+)/)

  if (roleMatch && (word === 'role' || word === roleMatch[1])) {
    const role = ast.roles?.find((r) => r.name === roleMatch[1])

    if (role) {
      return { type: 'role', decl: role }
    }
  }

  if (trimmed.match(/^\s*policy\s*\{?/) && word === 'policy') {
    const policy = ast.policies?.find((p) =>
      positionInRange(line, character, p.range),
    )

    if (policy) {
      return { type: 'policy', decl: policy }
    }
  }

  const triggerMatch = trimmed.match(/^\s*trigger\s+([a-zA-Z0-9_]+)/)

  if (triggerMatch && (word === 'trigger' || word === triggerMatch[1])) {
    const trigger = ast.triggers.find((t) => t.name === triggerMatch[1])

    if (trigger) {
      return { type: 'trigger', decl: trigger }
    }
  }

  // Trigger binding line: form: ResourceName -> GraphName
  if (
    /^\s*(form|webhook|schedule)\s*:\s*[a-zA-Z0-9_]+\s*->\s*[a-zA-Z0-9_]+/.test(
      trimmed,
    )
  ) {
    const bindingMatch = trimmed.match(
      /(form|webhook|schedule)\s*:\s*([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)/,
    )

    if (bindingMatch) {
      const [, resourceType, resourceName, workflowName] = bindingMatch

      if (word === resourceName) {
        if (resourceType === 'form') {
          const form = ast.forms.find((f) => f.name === word)

          if (form) {
            return { type: 'form', decl: form }
          }
        }

        if (resourceType === 'webhook') {
          const webhook = ast.webhooks.find((w) => w.name === word)

          if (webhook) {
            return { type: 'webhook', decl: webhook }
          }
        }

        if (resourceType === 'schedule') {
          const schedule = ast.schedules.find((s) => s.name === word)

          if (schedule) {
            return { type: 'schedule', decl: schedule }
          }
        }
      }

      if (word === workflowName) {
        const graph = ast.workflows.find((g) => g.name === word)

        if (graph) {
          return { type: 'graph', decl: graph }
        }
      }
    }
  }

  // Inside a graph: find which graph contains this position, then resolve node or edge
  const containingWorkflow = ast.workflows.find((g) =>
    positionInRange(line, character, g.range),
  )

  if (containingWorkflow) {
    // root { ... }
    const rootMatch = trimmed.match(/^\s*root\s*\{?/)
    if (rootMatch && word === 'root') {
      const node = containingWorkflow.nodes.find((n) => n.name === 'root')

      if (node) {
        return { type: 'node', decl: node, graph: containingWorkflow }
      }
    }

    // node Name { ... }
    const nodeMatch = trimmed.match(/^\s*node\s+([a-zA-Z0-9_]+)/)
    if (nodeMatch && (word === 'node' || word === nodeMatch[1])) {
      const node = containingWorkflow.nodes.find((n) => n.name === nodeMatch[1])

      if (node) {
        return { type: 'node', decl: node, graph: containingWorkflow }
      }
    }

    // Edge: Source -> Target or Source -["label"]-> Target
    if (trimmed.includes('->') && !trimmed.includes(':')) {
      const parts = trimmed.split(/\s*->\s*/)

      if (parts.length === 2) {
        const source =
          parts[0]
            ?.trim()
            .split(/\s*:\s*$/)[0]
            ?.trim() ?? ''

        const targetMatch = parts[1]?.trim().match(/^([a-zA-Z0-9_]+)/)
        const target = targetMatch?.[1] ?? ''

        if (word === source || word === target) {
          const node = containingWorkflow.nodes.find((n) => n.name === word)

          if (node) {
            return { type: 'node', decl: node, graph: containingWorkflow }
          }
        }
      }
    }
  }

  // workflow: / graph: on workflow, map, fanout, or while nodes
  for (const g of ast.workflows) {
    const nodesToScan: NodeDecl[] = []
    const collect = (nodes: NodeDecl[]) => {
      for (const node of nodes) {
        nodesToScan.push(node)
        if (node.subgraph?.nodes?.length) {
          collect(node.subgraph.nodes)
        }
      }
    }
    collect(g.nodes)

    for (const node of nodesToScan) {
      const decisionRef = node.configFields.decision
      if (
        node.type === 'decision' &&
        decisionRef?.kind === 'string' &&
        word === decisionRef.value &&
        positionInRange(line, character, decisionRef.range)
      ) {
        const declaration =
          ast.decisions?.find((d) => d.name === decisionRef.value) ??
          workspace?.decisionBlocks?.get(decisionRef.value)
        if (declaration) {
          return {
            type: 'decision',
            decl: {
              ...declaration,
              range: decisionRef.range,
              description: `${declaration.name}: TypeSafe ${declaration.fields.model}. ${typeof declaration.fields.description === 'string' ? declaration.fields.description : 'Typed Choice, Score and Noul questions; explicit secret block binding.'}`,
            },
          }
        }
      }
      const workflowConfig =
        node.configFields.workflow ?? node.configFields.graph

      if (!workflowConfig || workflowConfig.kind !== 'string') {
        continue
      }

      const value = workflowConfig.value

      if (word !== value) {
        continue
      }

      if (!positionInRange(line, character, workflowConfig.range)) {
        continue
      }

      const targetWorkflow = ast.workflows.find((gr) => gr.name === value)

      if (targetWorkflow) {
        return { type: 'graph', decl: targetWorkflow }
      }
    }
  }

  return null
}

/**
 * Build markdown content for hover from a swirls declaration (description only).
 */
export function buildHoverContent(decl: { description?: string }): string {
  return decl.description?.trim() ?? ''
}

/**
 * Format TypeScript quick-info for LSP Markdown hover. Fenced `typescript`
 * blocks are highlighted in VS Code / Cursor; a plain string renders as one color.
 */
export function markdownTsQuickInfo(
  display: string,
  documentation: string,
): string {
  const block = ['```typescript', display, '```'].join('\n')
  return documentation ? `${block}\n\n${documentation}` : block
}

/** Markdown for hover on a `harness` key inside a computer block. */
export const HARNESS_BLOCK_HOVER =
  '**Coding harness**: a coding agent CLI that Swirls installs and versions on this computer. ' +
  'A computer declares at most one, as `harness: { type: coding, provider: <name> }`. ' +
  `Providers: ${HARNESS_PROVIDERS.map((provider) => `\`${provider}\``).join(', ')}. ` +
  'Do not pin the provider package in `software:`.'

const HARNESS_TYPE_KEY_HOVER = `**harness.type**: the kind of harness. Allowed: ${HARNESS_TYPES.map((type) => `\`${type}\``).join(', ')}.`

const HARNESS_PROVIDER_KEY_HOVER = `**harness.provider**: which coding agent runs on the guest. Allowed: ${HARNESS_PROVIDERS.map((provider) => `\`${provider}\``).join(', ')}.`

/** Hover text and LSP range for a position inside a `harness: { }` block. */
export interface HarnessHover {
  value: string
  range: Range
}

function sourceToLspRange(range: {
  start: { line: number; column: number }
  end: { line: number; column: number }
}): Range {
  return {
    start: { line: range.start.line - 1, character: range.start.column - 1 },
    end: { line: range.end.line - 1, character: range.end.column - 1 },
  }
}

/** The 0-based range of `word` on `line` that covers `character`, if any. */
function wordRangeOnLine(
  document: TextDocument,
  position: Position,
  word: string,
): Range | null {
  const text = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: 1 << 20 },
  })
  const regex = new RegExp(`\\b${word}\\b`, 'g')
  let match = regex.exec(text)
  while (match !== null) {
    const start = match.index
    const end = start + word.length
    if (position.character >= start && position.character <= end) {
      return {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end },
      }
    }
    match = regex.exec(text)
  }
  return null
}

function harnessAtPosition(
  ast: SwirlsFile,
  line: number,
  character: number,
): ComputerHarnessDecl | null {
  for (const computer of ast.computer ?? []) {
    const harness = computer.harness
    if (harness && positionInRange(line, character, harness.range)) {
      return harness
    }
  }
  return null
}

/**
 * Hover for the `harness` key, its `type` and `provider` keys, and the catalog
 * values, read from the parsed computer block so ranges come from the AST.
 */
export function getHarnessHover(
  document: TextDocument,
  position: Position,
  ast: SwirlsFile,
): HarnessHover | null {
  const { line, character } = position
  const harness = harnessAtPosition(ast, line, character)
  if (!harness) {
    return null
  }

  if (positionInRange(line, character, harness.typeRange)) {
    return {
      value: `**${harness.type}** harness: ${HARNESS_TYPE_DESCRIPTIONS[harness.type]}.`,
      range: sourceToLspRange(harness.typeRange),
    }
  }

  if (positionInRange(line, character, harness.providerRange)) {
    return {
      value: `**${harness.provider}** harness: ${HARNESS_PROVIDER_DESCRIPTIONS[harness.provider]}.\n\nShips as the Flox package \`${HARNESS_PROVIDER_PACKAGES[harness.provider]}\`; Swirls owns its version.`,
      range: sourceToLspRange(harness.providerRange),
    }
  }

  const word = getWordAtPosition(document, position)
  const keyHover =
    word === 'harness' && line === harness.range.start.line - 1
      ? HARNESS_BLOCK_HOVER
      : word === 'type'
        ? HARNESS_TYPE_KEY_HOVER
        : word === 'provider'
          ? HARNESS_PROVIDER_KEY_HOVER
          : null
  if (!keyHover || !word) {
    return null
  }
  const range = wordRangeOnLine(document, position, word)
  return range ? { value: keyHover, range } : null
}
