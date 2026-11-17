import type { SwirlsFile, WorkflowDecl } from '@swirls/language'
import {
  HARNESS_PROVIDER_DESCRIPTIONS,
  HARNESS_PROVIDER_PACKAGES,
  HARNESS_PROVIDERS,
  HARNESS_TYPE_DESCRIPTIONS,
  HARNESS_TYPES,
  parse,
} from '@swirls/language'
import type { WorkspaceResourceIndex } from '@swirls/language/workspace'
import type { CompletionItem, Position } from 'vscode-languageserver'
import { CompletionItemKind } from 'vscode-languageserver'
import type { TextDocument } from 'vscode-languageserver-textdocument'

/**
 * If position is inside a `node X { ... }` or `root { ... }` block within a graph, return that graph and node name.
 */
export function getNodeContextAtPosition(
  document: TextDocument,
  position: Position,
  ast: SwirlsFile,
): { graph: WorkflowDecl; nodeName: string } | null {
  const offset = document.offsetAt(position)
  const text = document.getText()

  const blocks: { start: number; nodeName: string }[] = []
  const rootRe = /\broot\s*\{/g
  const nodeRe = /\bnode\s+([a-zA-Z0-9_]+)\s*\{/g
  let m: RegExpExecArray | null = rootRe.exec(text)
  while (m !== null) {
    blocks.push({ start: m.index, nodeName: 'root' })
    m = rootRe.exec(text)
  }
  m = nodeRe.exec(text)
  while (m !== null) {
    blocks.push({ start: m.index, nodeName: m[1] })
    m = nodeRe.exec(text)
  }

  blocks.sort((a, b) => b.start - a.start)
  const block = blocks.find((b) => b.start <= offset)
  if (!block) {
    return null
  }

  const blockStart = block.start + text.slice(block.start).indexOf('{')
  let count = 1
  let pos = blockStart + 1
  while (count > 0 && pos < text.length) {
    const ch = text[pos]
    if (ch === '{') {
      count++
    } else if (ch === '}') {
      count--
    }
    pos++
  }
  const blockEnd = pos - 1
  if (offset > blockEnd) {
    return null
  }

  const textBeforeBlock = text.slice(0, block.start)
  const lastWorkflowMatch = Math.max(
    textBeforeBlock.lastIndexOf('workflow '),
    textBeforeBlock.lastIndexOf('graph '),
  )
  if (lastWorkflowMatch < 0) {
    return null
  }
  const afterWorkflow = text.slice(lastWorkflowMatch)
  const workflowNameMatch =
    afterWorkflow.match(/workflow\s+([a-zA-Z0-9_]+)\s*\{/) ??
    afterWorkflow.match(/graph\s+([a-zA-Z0-9_]+)\s*\{/)
  if (!workflowNameMatch) {
    return null
  }
  const graph = ast.workflows.find((g) => g.name === workflowNameMatch[1])
  if (!graph || !graph.nodes.some((n) => n.name === block.nodeName)) {
    return null
  }
  return { graph, nodeName: block.nodeName }
}

const TOP_LEVEL_KEYWORDS: CompletionItem[] = [
  {
    label: 'decision',
    kind: CompletionItemKind.Keyword,
    detail: 'Reusable typed Jev questions with explicit secret binding',
  },
  {
    label: 'form',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a form resource',
  },
  {
    label: 'webhook',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a webhook resource',
  },
  {
    label: 'schedule',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a schedule resource',
  },
  {
    label: 'graph',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a workflow',
  },
  {
    label: 'workflow',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a workflow',
  },
  {
    label: 'trigger',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a trigger',
  },
  {
    label: 'secret',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a secret keys block',
  },
  {
    label: 'auth',
    kind: CompletionItemKind.Keyword,
    detail: 'Define an auth configuration',
  },
  {
    label: 'postgres',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a PostgreSQL database connection and table schemas',
  },
  {
    label: 'disk',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a platform-managed shared disk for disk nodes and agents',
  },
  {
    label: 'computer',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a named Linux guest bound by shell nodes',
  },
  {
    label: 'operation',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a script that device nodes run on enrolled devices',
  },
  {
    label: 'skill',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a local knowledge skill from .agents/skills/',
  },
  {
    label: 'agent',
    kind: CompletionItemKind.Keyword,
    detail:
      'Declare an agent profile (provider, model, secrets, tools, roles) for agent nodes',
  },
  {
    label: 'mcp',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare an MCP server slot (label, description) for agents',
  },
  {
    label: 'connector',
    kind: CompletionItemKind.Keyword,
    detail:
      'Declare an inbound OAuth application slot (label, description) for MCP channels',
  },
  {
    label: 'network',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a private connectivity boundary and exposure allowlist',
  },
  {
    label: 'stream',
    kind: CompletionItemKind.Keyword,
    detail:
      'Define a named stream for graph output (schema, condition, prepare)',
  },
]

const NODE_TYPES: CompletionItem[] = [
  {
    label: 'decision',
    kind: CompletionItemKind.Value,
    detail: 'Evaluate a reusable Jev decision',
  },
  {
    label: 'ai',
    kind: CompletionItemKind.Constant,
    detail: 'AI node (text, image, embedding, video)',
  },
  {
    label: 'code',
    kind: CompletionItemKind.Constant,
    detail: 'Code transformation node',
  },
  {
    label: 'http',
    kind: CompletionItemKind.Constant,
    detail: 'HTTP request node',
  },
  {
    label: 'integration',
    kind: CompletionItemKind.Constant,
    detail: 'Fabric integration proxy node (OAuth via connection block)',
  },
  {
    label: 'email',
    kind: CompletionItemKind.Constant,
    detail: 'Email node (Resend-backed)',
  },
  {
    label: 'switch',
    kind: CompletionItemKind.Constant,
    detail: 'Switch/branch node',
  },
  {
    label: 'scrape',
    kind: CompletionItemKind.Constant,
    detail: 'Web scrape node (Firecrawl-backed)',
  },
  {
    label: 'search',
    kind: CompletionItemKind.Constant,
    detail: 'Web search node (Firecrawl default, or Telem)',
  },
  {
    label: 'parallel',
    kind: CompletionItemKind.Constant,
    detail: 'Parallel.ai web search and URL extract',
  },
  { label: 'wait', kind: CompletionItemKind.Constant, detail: 'Wait node' },
  {
    label: 'graph',
    kind: CompletionItemKind.Constant,
    detail: 'Workflow node (call another workflow)',
  },
  {
    label: 'workflow',
    kind: CompletionItemKind.Constant,
    detail: 'Workflow node (call another workflow)',
  },
  {
    label: 'map',
    kind: CompletionItemKind.Constant,
    detail: 'Map over array (child workflow per item)',
  },
  {
    label: 'fanout',
    kind: CompletionItemKind.Constant,
    detail: 'Bounded concurrent child workflow per item',
  },
  {
    label: 'while',
    kind: CompletionItemKind.Constant,
    detail: 'While loop (child workflow per iteration)',
  },
  { label: 'stream', kind: CompletionItemKind.Constant, detail: 'Stream node' },
  {
    label: 'postgres',
    kind: CompletionItemKind.Constant,
    detail: 'Postgres SELECT or INSERT node',
  },
  {
    label: 'disk',
    kind: CompletionItemKind.Constant,
    detail: 'Mounted disk: run bash remotely (e.g. Archil disk.exec)',
  },
  {
    label: 'shell',
    kind: CompletionItemKind.Constant,
    detail: 'Run one bash command on a fresh computer guest',
  },
  {
    label: 'device',
    kind: CompletionItemKind.Constant,
    detail: 'Run an operation on an enrolled device or a group of devices',
  },
  {
    label: 'agent',
    kind: CompletionItemKind.Constant,
    detail:
      'LLM agent node: bind to top-level agent block, optional tools + roles',
  },
]

const PROPERTY_KEYS: CompletionItem[] = [
  {
    label: 'decision',
    kind: CompletionItemKind.Property,
    detail: 'Named decision declaration',
    insertText: 'decision: ',
  },
  {
    label: 'state',
    kind: CompletionItemKind.Property,
    detail: 'Decision state: literal or @ts',
    insertText: 'state: ',
  },
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional description',
  },
  {
    label: 'enabled',
    kind: CompletionItemKind.Property,
    detail: 'Enable/disable',
  },
  {
    label: 'concurrency',
    kind: CompletionItemKind.Property,
    detail: 'Maximum concurrent work',
  },
  {
    label: 'executionTokenTtl',
    kind: CompletionItemKind.Property,
    detail: 'Execution authorization lifetime (5m–24h, default 150m)',
  },
  {
    label: 'items',
    kind: CompletionItemKind.Property,
    detail: '@ts block returning iteration items',
  },
  {
    label: 'maxItems',
    kind: CompletionItemKind.Property,
    detail: 'Maximum number of iteration items',
  },
  {
    label: 'maxIterations',
    kind: CompletionItemKind.Property,
    detail: 'Maximum while-loop iterations',
  },
  {
    label: 'subgraph',
    kind: CompletionItemKind.Property,
    detail: 'Inline child workflow block',
  },
  {
    label: 'input',
    kind: CompletionItemKind.Property,
    detail: '@ts block returning child or loop input',
  },
  {
    label: 'workflow',
    kind: CompletionItemKind.Property,
    detail: 'Name of a child workflow',
  },
  {
    label: 'graph',
    kind: CompletionItemKind.Property,
    detail: 'Legacy alias for child workflow',
  },
  { label: 'schema', kind: CompletionItemKind.Property, detail: 'JSON Schema' },
  { label: 'type', kind: CompletionItemKind.Property, detail: 'Node type' },
  {
    label: 'operation',
    kind: CompletionItemKind.Property,
    detail:
      'Node operation (e.g. bucket: download | upload; parallel: search | extract)',
  },
  {
    label: 'kind',
    kind: CompletionItemKind.Property,
    detail: 'AI kind (text, object, image, video, embed)',
  },
  {
    label: 'options',
    kind: CompletionItemKind.Property,
    detail: 'AI options object (model, prompt, etc.)',
  },
  {
    label: 'cron',
    kind: CompletionItemKind.Property,
    detail: 'Cron expression',
  },
  {
    label: 'timezone',
    kind: CompletionItemKind.Property,
    detail: 'Timezone (IANA)',
  },
  {
    label: 'code',
    kind: CompletionItemKind.Property,
    detail: 'TypeScript code block',
  },
  {
    label: 'prompt',
    kind: CompletionItemKind.Property,
    detail: '@ts prompt body (AI `options.prompt`, agent nodes, etc.)',
  },
  { label: 'model', kind: CompletionItemKind.Property, detail: 'LLM model' },
  {
    label: 'mode',
    kind: CompletionItemKind.Property,
    detail: 'Parallel search: one-shot | agentic | fast',
  },
  { label: 'url', kind: CompletionItemKind.Property, detail: 'URL' },
  {
    label: 'query',
    kind: CompletionItemKind.Property,
    detail: 'Search query (string or @ts returning string)',
  },
  {
    label: 'limit',
    kind: CompletionItemKind.Property,
    detail: 'Search: max results (1–20, default 5)',
  },
  {
    label: 'sources',
    kind: CompletionItemKind.Property,
    detail: 'Search: web | news | images',
  },
  {
    label: 'categories',
    kind: CompletionItemKind.Property,
    detail: 'Search: github | research | pdf',
  },
  {
    label: 'location',
    kind: CompletionItemKind.Property,
    detail: 'Search: location bias (string)',
  },
  {
    label: 'country',
    kind: CompletionItemKind.Property,
    detail: 'Search: country code (e.g. US)',
  },
  {
    label: 'tbs',
    kind: CompletionItemKind.Property,
    detail: 'Search: time-based filter (e.g. qdr:w)',
  },
  {
    label: 'includeDomains',
    kind: CompletionItemKind.Property,
    detail: 'Search: only include these domains',
  },
  {
    label: 'excludeDomains',
    kind: CompletionItemKind.Property,
    detail: 'Search: exclude these domains',
  },
  {
    label: 'scrapeFormats',
    kind: CompletionItemKind.Property,
    detail: 'Search: attach page content (e.g. ["markdown"])',
  },
  {
    label: 'urls',
    kind: CompletionItemKind.Property,
    detail: 'Parallel extract: URLs to read (@ts block returning string[])',
  },
  { label: 'method', kind: CompletionItemKind.Property, detail: 'HTTP method' },
  {
    label: 'inputSchema',
    kind: CompletionItemKind.Property,
    detail: 'Input JSON Schema',
  },
  {
    label: 'outputSchema',
    kind: CompletionItemKind.Property,
    detail: 'Output JSON Schema',
  },
  {
    label: 'review',
    kind: CompletionItemKind.Property,
    detail:
      'Human review (true or { enabled, title, description, schema, actions })',
  },
  {
    label: 'objective',
    kind: CompletionItemKind.Property,
    detail: 'Parallel: natural-language objective (@ts block)',
  },
  {
    label: 'searchQueries',
    kind: CompletionItemKind.Property,
    detail: 'Parallel search: keyword queries (@ts block returning string[])',
  },
  {
    label: 'excerptsMaxCharsPerResult',
    kind: CompletionItemKind.Property,
    detail: 'Parallel search: max chars per result (number)',
  },
  {
    label: 'excerptsMaxCharsTotal',
    kind: CompletionItemKind.Property,
    detail: 'Parallel search: max chars total across results (number)',
  },
  {
    label: 'fullContent',
    kind: CompletionItemKind.Property,
    detail: 'Parallel extract: include full page content (boolean)',
  },
  {
    label: 'excerpts',
    kind: CompletionItemKind.Property,
    detail: 'Parallel extract: include excerpts (boolean)',
  },
  {
    label: 'postgres',
    kind: CompletionItemKind.Property,
    detail: 'Name of a top-level postgres block',
  },
  {
    label: 'disk',
    kind: CompletionItemKind.Property,
    detail: 'Name of a top-level disk block',
  },
  {
    label: 'computer',
    kind: CompletionItemKind.Property,
    detail: 'Name of a top-level computer block',
  },
  {
    label: 'device',
    kind: CompletionItemKind.Property,
    detail: 'Id of one enrolled device (quoted string or @ts returning one)',
  },
  {
    label: 'devices',
    kind: CompletionItemKind.Property,
    detail: 'Selector for a group of devices: tags, os, or both',
    insertText: 'devices: { tags: ["kiosk"], os: windows }',
  },
  {
    label: 'waitSeconds',
    kind: CompletionItemKind.Property,
    detail:
      'Seconds to wait for a device to collect its run, 30 to 3600 (default 300)',
  },
  {
    label: 'command',
    kind: CompletionItemKind.Property,
    detail: 'Bash command (quoted string or @ts returning a string)',
  },
  {
    label: 'agent',
    kind: CompletionItemKind.Property,
    detail: 'Name of a top-level agent block',
  },
  {
    label: 'role',
    kind: CompletionItemKind.Property,
    detail: 'Agent node: role name defined on agent block',
  },
  {
    label: 'tools',
    kind: CompletionItemKind.Property,
    detail: 'Workflow names [ a, b ] exposed as LLM-callable tools',
  },
  {
    label: 'team',
    kind: CompletionItemKind.Property,
    detail: 'Agent block names [ a, b ] delegated to as subagents',
  },
  {
    label: 'disks',
    kind: CompletionItemKind.Property,
    detail: 'Shared disk block names [ a, b ] mounted into the agent sandbox',
  },
  {
    label: 'mcp',
    kind: CompletionItemKind.Property,
    detail: 'MCP block names [ a, b ] exposed to the agent as tool servers',
  },
  {
    label: 'system',
    kind: CompletionItemKind.Property,
    detail: '@ts system prompt snippet (agent, role, or node override)',
  },
  {
    label: 'maxSteps',
    kind: CompletionItemKind.Property,
    detail: 'Agent block: maximum model/tool steps per run (default 10)',
  },
  {
    label: 'provider',
    kind: CompletionItemKind.Property,
    detail:
      'Search: firecrawl | telem; LLM: openai | anthropic | google | openrouter',
  },
  {
    label: 'select',
    kind: CompletionItemKind.Property,
    detail: '@sql SELECT block',
  },
  {
    label: 'insert',
    kind: CompletionItemKind.Property,
    detail: '@sql INSERT block',
  },
  {
    label: 'update',
    kind: CompletionItemKind.Property,
    detail: '@sql UPDATE block',
  },
  {
    label: 'delete',
    kind: CompletionItemKind.Property,
    detail: '@sql DELETE block',
  },
  {
    label: 'params',
    kind: CompletionItemKind.Property,
    detail: '@ts block returning named parameters for {{key}} placeholders',
  },
  {
    label: 'condition',
    kind: CompletionItemKind.Property,
    detail: 'Optional @ts block (write nodes): skip write when false',
  },
]

const TRIGGER_RESOURCE_PREFIXES: CompletionItem[] = [
  { label: 'form:', kind: CompletionItemKind.Keyword, detail: 'Form trigger' },
  {
    label: 'webhook:',
    kind: CompletionItemKind.Keyword,
    detail: 'Webhook trigger',
  },
  {
    label: 'schedule:',
    kind: CompletionItemKind.Keyword,
    detail: 'Schedule trigger',
  },
]

const AI_KIND_VALUES: CompletionItem[] = [
  {
    label: 'text',
    kind: CompletionItemKind.Constant,
    detail: 'Plain text output',
  },
  {
    label: 'object',
    kind: CompletionItemKind.Constant,
    detail: 'Structured output (use outputSchema)',
  },
  {
    label: 'image',
    kind: CompletionItemKind.Constant,
    detail: 'Generate image',
  },
  {
    label: 'video',
    kind: CompletionItemKind.Constant,
    detail: 'Generate video',
  },
  { label: 'embed', kind: CompletionItemKind.Constant, detail: 'Embedding(s)' },
]

const GRAPH_LEVEL_KEYWORDS: CompletionItem[] = [
  {
    label: 'flow',
    kind: CompletionItemKind.Keyword,
    detail: 'Edge connections (flow { ... })',
  },
  {
    label: 'root',
    kind: CompletionItemKind.Keyword,
    detail: 'Define the root node',
  },
  { label: 'node', kind: CompletionItemKind.Keyword, detail: 'Define a node' },
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Workflow display label',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional description',
  },
  {
    label: 'concurrency',
    kind: CompletionItemKind.Property,
    detail: 'Maximum ready nodes running at once (1–64, default 8)',
  },
  {
    label: 'executionTokenTtl',
    kind: CompletionItemKind.Property,
    detail: 'Execution authorization lifetime (5m–24h, default 150m)',
  },
]

function pickProperties(labels: string[]): CompletionItem[] {
  const set = new Set(labels)
  return PROPERTY_KEYS.filter((item) => set.has(item.label))
}

const FORM_PROPERTIES: CompletionItem[] = pickProperties([
  'label',
  'description',
  'enabled',
  'schema',
])

const WEBHOOK_PROPERTIES: CompletionItem[] = pickProperties([
  'label',
  'description',
  'enabled',
  'schema',
])

const SCHEDULE_PROPERTIES: CompletionItem[] = pickProperties([
  'label',
  'description',
  'cron',
  'timezone',
  'enabled',
])

const TRIGGER_PROPERTIES: CompletionItem[] = [
  ...pickProperties(['enabled']),
  ...TRIGGER_RESOURCE_PREFIXES,
]

const STREAM_PROPERTIES: CompletionItem[] = [
  ...pickProperties(['label', 'description', 'enabled']),
  {
    label: 'version',
    kind: CompletionItemKind.Property,
    detail:
      'Active writer version (v1, v2, …) — must match a key in versions { }',
  },
  {
    label: 'versions',
    kind: CompletionItemKind.Keyword,
    detail:
      'Per-version schema, condition, and prepare: versions { v1 { … } v2 { … } }',
  },
  {
    label: 'graph',
    kind: CompletionItemKind.Property,
    detail: 'Name of the workflow whose completed runs feed this stream',
  },
  {
    label: 'workflow',
    kind: CompletionItemKind.Property,
    detail: 'Name of the workflow whose completed runs feed this stream',
  },
]

const SECRET_BLOCK_PROPERTIES: CompletionItem[] = [
  ...pickProperties(['label', 'description']),
  {
    label: 'vars',
    kind: CompletionItemKind.Property,
    detail: 'Secret key names [ KEY1, KEY2 ]',
  },
]

const AUTH_BLOCK_PROPERTIES: CompletionItem[] = [
  ...pickProperties(['label', 'description']),
  {
    label: 'type',
    kind: CompletionItemKind.Property,
    detail: 'oauth | api_key | basic | bearer',
  },
  {
    label: 'secrets',
    kind: CompletionItemKind.Property,
    detail: 'Name of a secret block',
  },
  {
    label: 'grant_type',
    kind: CompletionItemKind.Property,
    detail: 'OAuth grant type (e.g. client_credentials)',
  },
  {
    label: 'client_id',
    kind: CompletionItemKind.Property,
    detail: 'OAuth client id (var from secret block)',
  },
  {
    label: 'client_secret',
    kind: CompletionItemKind.Property,
    detail: 'OAuth client secret (var from secret block)',
  },
  {
    label: 'token_url',
    kind: CompletionItemKind.Property,
    detail: 'OAuth token endpoint URL',
  },
  {
    label: 'key',
    kind: CompletionItemKind.Property,
    detail: 'API key value (var from secret block)',
  },
  {
    label: 'header',
    kind: CompletionItemKind.Property,
    detail: 'HTTP header name for API key',
  },
  {
    label: 'query_param',
    kind: CompletionItemKind.Property,
    detail: 'Query parameter name for API key',
  },
  {
    label: 'username',
    kind: CompletionItemKind.Property,
    detail: 'Basic auth username (var from secret block)',
  },
  {
    label: 'password',
    kind: CompletionItemKind.Property,
    detail: 'Basic auth password (var from secret block)',
  },
  {
    label: 'token',
    kind: CompletionItemKind.Property,
    detail: 'Bearer token (var from secret block)',
  },
]

const POSTGRES_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label',
  },
  {
    label: 'secrets',
    kind: CompletionItemKind.Property,
    detail: 'Name of a secret block',
  },
  {
    label: 'connection',
    kind: CompletionItemKind.Property,
    detail: 'Connection credential (secret var or literal string)',
  },
  {
    label: 'network',
    kind: CompletionItemKind.Property,
    detail: 'Private connectivity boundary for this database',
  },
  {
    label: 'table',
    kind: CompletionItemKind.Keyword,
    detail: 'Declare a table schema',
  },
]

const SKILL_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'name',
    kind: CompletionItemKind.Property,
    detail: 'On-disk skill slug under .agents/skills/<name>/',
  },
]

const MCP_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label for the MCP server slot',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional description of what the MCP server exposes',
  },
  {
    label: 'network',
    kind: CompletionItemKind.Property,
    detail: 'Private connectivity boundary for this MCP server',
  },
]

const NETWORK_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label for the network',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional network purpose and scope',
  },
  {
    label: 'expose',
    kind: CompletionItemKind.Keyword,
    detail: 'Central allowlist of project interfaces exposed to the network',
  },
  ...['apps', 'channels', 'forms', 'webhooks', 'services', 'databases'].map(
    (label): CompletionItem => ({
      label,
      kind: CompletionItemKind.Property,
      detail: 'Network exposure allowlist',
    }),
  ),
]

const CONNECTOR_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label for the inbound OAuth connector application',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional description of the connector application',
  },
]

const OPERATION_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional description',
  },
  {
    label: 'platform',
    kind: CompletionItemKind.Property,
    detail: 'Only run on devices with this system: windows, linux or macos',
  },
  {
    label: 'runAs',
    kind: CompletionItemKind.Property,
    detail: 'Identity the script runs as: system (default) or signed_in_user',
  },
  {
    label: 'timeout',
    kind: CompletionItemKind.Property,
    detail: 'Seconds the script may run, 1 to 3600 (default 300)',
  },
  {
    label: 'inputSchema',
    kind: CompletionItemKind.Property,
    detail: 'JSON Schema the node input is checked against before signing',
    insertText: 'inputSchema: @json {\n  { "type": "object" }\n}',
  },
  {
    label: 'outputSchema',
    kind: CompletionItemKind.Property,
    detail: 'JSON Schema for the JSON the script prints, returned as result',
    insertText: 'outputSchema: @json {\n  { "type": "object" }\n}',
  },
  {
    label: 'command',
    kind: CompletionItemKind.Property,
    detail: 'The script: @ps { } or @sh { }, or @ps "file.ps1" / @sh "file.sh"',
    insertText: 'command: @ps {\n  \n}',
  },
]

const COMPUTER_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label',
  },
  {
    label: 'description',
    kind: CompletionItemKind.Property,
    detail: 'Optional description',
  },
  {
    label: 'software',
    kind: CompletionItemKind.Property,
    detail: 'Pinned catalog packages beyond the PATH baseline',
    insertText: 'software: { pkg: "1.0.0" }',
  },
  {
    label: 'disks',
    kind: CompletionItemKind.Property,
    detail: 'Disk blocks mounted at /mnt/disks/<name>',
    insertText: 'disks: [disk]',
  },
  {
    label: 'resources',
    kind: CompletionItemKind.Property,
    detail: 'Guest sizing fixed on the snapshot',
    insertText: 'resources: { cpus: 2, memoryMiB: 1024 }',
  },
  {
    label: 'harness',
    kind: CompletionItemKind.Property,
    detail: `Coding harness on the guest (${HARNESS_PROVIDERS.join(' | ')}); at most one`,
    insertText: 'harness: { type: coding, provider: codex }',
  },
]

const HARNESS_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'type',
    kind: CompletionItemKind.Property,
    detail: `Kind of harness (${HARNESS_TYPES.join(' | ')})`,
    insertText: 'type: ',
  },
  {
    label: 'provider',
    kind: CompletionItemKind.Property,
    detail: `Harness provider (${HARNESS_PROVIDERS.join(' | ')})`,
    insertText: 'provider: ',
  },
]

const HARNESS_TYPE_VALUES: CompletionItem[] = HARNESS_TYPES.map((type) => ({
  label: type,
  kind: CompletionItemKind.EnumMember,
  detail: HARNESS_TYPE_DESCRIPTIONS[type],
}))

const HARNESS_PROVIDER_VALUES: CompletionItem[] = HARNESS_PROVIDERS.map(
  (provider) => ({
    label: provider,
    kind: CompletionItemKind.EnumMember,
    detail: `${HARNESS_PROVIDER_DESCRIPTIONS[provider]} (Flox package ${HARNESS_PROVIDER_PACKAGES[provider]})`,
  }),
)

/** Value completions for `type:` and `provider:` inside `harness: { }`. */
function harnessValueCompletions(trimmed: string): CompletionItem[] | null {
  if (/\btype\s*:\s*\w*$/.test(trimmed)) {
    return HARNESS_TYPE_VALUES
  }
  if (/\bprovider\s*:\s*\w*$/.test(trimmed)) {
    return HARNESS_PROVIDER_VALUES
  }
  return null
}

const DISK_BLOCK_PROPERTIES: CompletionItem[] = [
  {
    label: 'label',
    kind: CompletionItemKind.Property,
    detail: 'Display label',
  },
  {
    label: 'region',
    kind: CompletionItemKind.Property,
    detail: 'Optional control-plane region (e.g. aws-us-east-1)',
  },
]

const AGENT_BLOCK_PROPERTIES: CompletionItem[] = [
  ...pickProperties([
    'label',
    'description',
    'secrets',
    'provider',
    'model',
    'system',
    'temperature',
    'maxTokens',
    'maxSteps',
    'tools',
    'skills',
    'mcp',
    'team',
    'disks',
    'sandbox',
    'wallet',
  ]),
  {
    label: 'computer',
    kind: CompletionItemKind.Property,
    detail:
      "Named computer whose guest runs this agent's workspace tools. Cannot be combined with sandbox or disks.",
  },
]

/** `profile { }` is nested in an agent; its body must not offer `computer:`. */
function cursorInsideProfile(text: string, offset: number): boolean {
  const before = text.slice(0, offset)
  const profileBlock = /\bprofile\s+[a-zA-Z0-9_]+\s*\{/g
  let match = profileBlock.exec(before)
  while (match !== null) {
    const openBrace = match.index + match[0].indexOf('{')
    const closingBrace = findBlockEnd(text, openBrace)
    const end = closingBrace < 0 ? text.length : closingBrace
    if (offset <= end) {
      return true
    }
    match = profileBlock.exec(before)
  }
  return false
}

function agentBodyCompletions(text: string, offset: number): CompletionItem[] {
  const items = [...AGENT_BODY_LINE_KEYWORDS, ...AGENT_BLOCK_PROPERTIES]
  if (!cursorInsideProfile(text, offset)) {
    return items
  }
  return items.filter((item) => item.label !== 'computer')
}

const AGENT_ROLE_BODY_PROPERTIES: CompletionItem[] = pickProperties([
  'description',
  'system',
  'tools',
  'skills',
  'mcp',
])

const AGENT_BODY_LINE_KEYWORDS: CompletionItem[] = [
  {
    label: 'role',
    kind: CompletionItemKind.Keyword,
    detail:
      'Nested role block — optional description, tools subset, system @ts snippet',
  },
]

const ROOT_NODE_PROPERTIES: CompletionItem[] = pickProperties([
  'type',
  'label',
  'description',
  'code',
  'inputSchema',
  'outputSchema',
  'review',
])

const COMMON_NODE_PROPERTIES: CompletionItem[] = pickProperties([
  'type',
  'label',
  'description',
  'code',
  'schema',
  'review',
])

const NODE_TYPE_EXTRA_PROPERTY_LABELS: Record<string, string[]> = {
  ai: ['kind', 'options', 'model', 'prompt', 'temperature', 'maxTokens'],
  code: ['code'],
  switch: ['cases', 'router'],
  http: ['url', 'method', 'headers', 'body', 'auth', 'connection', 'network'],
  integration: ['connection', 'action', 'method', 'path', 'params'],
  scrape: ['url'],
  search: [
    'provider',
    'query',
    'limit',
    'sources',
    'categories',
    'location',
    'country',
    'tbs',
    'includeDomains',
    'excludeDomains',
    'scrapeFormats',
  ],
  parallel: [
    'operation',
    'objective',
    'urls',
    'searchQueries',
    'mode',
    'excerpts',
    'fullContent',
    'excerptsMaxCharsPerResult',
    'excerptsMaxCharsTotal',
  ],
  wait: [],
  graph: ['workflow', 'graph', 'input'],
  workflow: ['workflow', 'graph', 'input'],
  map: ['items', 'maxItems', 'subgraph', 'workflow', 'graph'],
  fanout: ['items', 'maxItems', 'concurrency', 'subgraph', 'workflow', 'graph'],
  while: [
    'input',
    'condition',
    'update',
    'maxIterations',
    'subgraph',
    'workflow',
    'graph',
  ],
  stream: ['stream', 'version', 'filter'],
  email: ['from', 'to', 'subject'],
  postgres: [
    'postgres',
    'select',
    'insert',
    'update',
    'delete',
    'params',
    'condition',
  ],
  disk: ['disk', 'command', 'operation', 'path', 'file', 'overwrite'],
  shell: ['computer', 'command'],
  device: ['operation', 'device', 'devices', 'input', 'waitSeconds'],
  agent: ['agent', 'prompt', 'profile', 'role', 'tools', 'system', 'model'],
  decision: ['decision', 'state', 'model'],
}

function getNodePropertiesForType(nodeType: string): CompletionItem[] {
  const extraLabels = NODE_TYPE_EXTRA_PROPERTY_LABELS[nodeType] ?? []
  const extra = pickProperties(extraLabels)
  const seen = new Set(COMMON_NODE_PROPERTIES.map((c) => c.label))
  const merged = [...COMMON_NODE_PROPERTIES]
  for (const item of extra) {
    if (!seen.has(item.label)) {
      seen.add(item.label)
      merged.push(item)
    }
  }
  return merged
}

type BlockContextType =
  | 'form'
  | 'webhook'
  | 'schedule'
  | 'graph'
  | 'stream'
  | 'trigger'
  | 'secret'
  | 'auth'
  | 'postgres'
  | 'disk'
  | 'computer'
  | 'computer_harness'
  | 'operation'
  | 'skill'
  | 'agent'
  | 'decision'
  | 'agent_role'
  | 'mcp'
  | 'connector'
  | 'channel'
  | 'network'
  | 'node'
  | 'root'
  | 'flow'
  | null

interface BlockSpan {
  type: BlockContextType
  start: number
  end: number
}

const BLOCK_PATTERNS: { type: BlockContextType; regex: RegExp }[] = [
  { type: 'form', regex: /\bform\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'webhook', regex: /\bwebhook\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'schedule', regex: /\bschedule\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'graph', regex: /\bgraph\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'graph', regex: /\bworkflow\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'trigger', regex: /\btrigger\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'secret', regex: /\bsecret\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'auth', regex: /\bauth\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'postgres', regex: /\bpostgres\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'disk', regex: /\bdisk\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'computer', regex: /\bcomputer\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'operation', regex: /\boperation\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'computer_harness', regex: /\bharness\s*:\s*\{/g },
  { type: 'skill', regex: /\bskill\s+[a-zA-Z0-9_]+\s*\{/g },
  {
    type: 'agent_role',
    regex: /\brole\s+[a-zA-Z0-9_]+\s*\{/g,
  },
  { type: 'decision', regex: /\bdecision\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'agent', regex: /\bagent\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'mcp', regex: /\bmcp\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'channel', regex: /\bchannel\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'connector', regex: /\bconnector\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'network', regex: /\bnetwork\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'stream', regex: /\bstream\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'node', regex: /\bnode\s+[a-zA-Z0-9_]+\s*\{/g },
  { type: 'root', regex: /\broot\s*\{/g },
  { type: 'flow', regex: /\bflow\s*\{/g },
]

function findBlockEnd(text: string, openBraceOffset: number): number {
  let depth = 0
  let pos = openBraceOffset
  while (pos < text.length) {
    const ch = text[pos]
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
    }
    if (depth === 0) {
      return pos
    }
    pos++
  }
  return -1
}

/**
 * Returns the innermost block type containing the given offset, or null if outside all blocks.
 */
export function getBlockContext(
  text: string,
  offset: number,
): BlockContextType {
  const spans: BlockSpan[] = []
  const before = text.slice(0, offset)

  for (const { type, regex } of BLOCK_PATTERNS) {
    regex.lastIndex = 0
    let m = regex.exec(before)
    while (m !== null) {
      const openBrace = m.index + m[0].indexOf('{')
      const closingBrace = findBlockEnd(text, openBrace)
      const end = closingBrace < 0 ? text.length : closingBrace
      if (offset <= end) {
        spans.push({ type, start: openBrace, end })
      }
      m = regex.exec(before)
    }
  }

  if (spans.length === 0) {
    return null
  }
  // Innermost = largest start position that still contains offset
  spans.sort((a, b) => b.start - a.start)
  return spans[0].type
}

function getLineBeforeCursor(
  document: TextDocument,
  position: Position,
): string {
  const offset = document.offsetAt(position)
  const text = document.getText()
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  return text.slice(lineStart, offset)
}

export function getCompletions(
  document: TextDocument,
  position: Position,
  workspace?: WorkspaceResourceIndex,
): CompletionItem[] {
  const text = document.getText()
  const offset = document.offsetAt(position)
  const linePrefix = getLineBeforeCursor(document, position)
  const trimmed = linePrefix.replace(/^\s*/, '')
  const result = parse(text)
  const ast = result.ast
  const blockContext = getBlockContext(text, offset)
  if (
    (blockContext === 'channel' &&
      /^workflows\s*:\s*\[[^\]]*$/.test(trimmed)) ||
    /^(allow|deny)\s+\w+\s*->\s*workflow\s+\w*$/.test(trimmed)
  ) {
    return [
      ...new Set([
        ...ast.workflows.map((workflow) => workflow.name),
        ...(workspace?.workflowBlocks.keys() ?? []),
      ]),
    ].map((label) => ({ label, kind: CompletionItemKind.Reference }))
  }
  if (/^decision\s*:\s*\w*$/.test(trimmed)) {
    return [
      ...new Set([
        ...(ast.decisions ?? []).map((d) => d.name),
        ...(workspace?.decisionBlocks?.keys() ?? []),
      ]),
    ].map((label) => ({
      label,
      kind: CompletionItemKind.Reference,
      detail: 'Declared decision',
    }))
  }
  if (blockContext === 'decision' && /^secrets\s*:\s*\w*$/.test(trimmed)) {
    return [
      ...new Set([
        ...ast.secrets.map((s) => s.name),
        ...(workspace?.secrets.keys() ?? []),
      ]),
    ].map((label) => ({
      label,
      kind: CompletionItemKind.Reference,
      detail: 'Explicit secret block binding',
    }))
  }

  function completionsForEmptyLine(): CompletionItem[] {
    switch (blockContext) {
      case null:
        return []
      case 'graph':
        return GRAPH_LEVEL_KEYWORDS
      case 'root':
        return ROOT_NODE_PROPERTIES
      case 'node': {
        const nodeContext = getNodeContextAtPosition(document, position, ast)
        if (!nodeContext) {
          return COMMON_NODE_PROPERTIES
        }
        const node = nodeContext.graph.nodes.find(
          (n) => n.name === nodeContext.nodeName,
        )
        const nodeType = node?.type ?? 'code'
        return getNodePropertiesForType(nodeType)
      }
      case 'flow':
        return []
      case 'form':
        return FORM_PROPERTIES
      case 'webhook':
        return WEBHOOK_PROPERTIES
      case 'schedule':
        return SCHEDULE_PROPERTIES
      case 'trigger':
        return TRIGGER_PROPERTIES
      case 'secret':
        return SECRET_BLOCK_PROPERTIES
      case 'auth':
        return AUTH_BLOCK_PROPERTIES
      case 'postgres':
        return POSTGRES_BLOCK_PROPERTIES
      case 'disk':
        return DISK_BLOCK_PROPERTIES
      case 'computer':
        return COMPUTER_BLOCK_PROPERTIES
      case 'operation':
        return OPERATION_BLOCK_PROPERTIES
      case 'computer_harness':
        return HARNESS_BLOCK_PROPERTIES
      case 'skill':
        return SKILL_BLOCK_PROPERTIES
      case 'decision':
        return [
          'label',
          'description',
          'provider',
          'model',
          'secrets',
          'inputSchema',
          'questions',
        ].map((label) => ({
          label,
          kind: CompletionItemKind.Property,
          insertText: `${label}: `,
        }))
      case 'agent':
        return agentBodyCompletions(text, offset)
      case 'agent_role':
        return AGENT_ROLE_BODY_PROPERTIES
      case 'mcp':
        return MCP_BLOCK_PROPERTIES
      case 'channel':
        return [
          'label',
          'description',
          'platform',
          'agent',
          'workflows',
          'connector',
          'connection',
          'enabled',
          'mode',
        ].map((label) => ({ label, kind: CompletionItemKind.Property }))
      case 'connector':
        return CONNECTOR_BLOCK_PROPERTIES
      case 'network':
        return NETWORK_BLOCK_PROPERTIES
      case 'stream':
        return STREAM_PROPERTIES
      default:
        return []
    }
  }

  if (trimmed.length === 0) {
    return completionsForEmptyLine()
  }

  if (blockContext === 'computer_harness') {
    const values = harnessValueCompletions(trimmed)
    if (values) {
      return values
    }
  }

  if (
    /^(form|webhook|schedule|graph|stream|trigger|secret|auth|postgres|disk|skill|agent|mcp|connector|network)\s+[a-zA-Z0-9_]*$/.test(
      trimmed,
    )
  ) {
    return []
  }

  if (
    /^(form|webhook|schedule|graph|stream|trigger|secret|auth|postgres|disk|skill|agent|mcp|connector|network)\s*$/.test(
      trimmed,
    )
  ) {
    if (blockContext !== null) {
      return []
    }
    return TOP_LEVEL_KEYWORDS.filter((k) => k.label !== trimmed.split(/\s/)[0])
  }

  if (/^node\s+[a-zA-Z0-9_]*$/.test(trimmed) || /^node\s*$/.test(trimmed)) {
    return []
  }

  if (
    (trimmed.endsWith('type') || trimmed.endsWith('type ')) &&
    (blockContext === 'node' || blockContext === 'root')
  ) {
    return NODE_TYPES
  }

  if (
    /\btype\s*:\s*$/.test(trimmed) &&
    (blockContext === 'node' || blockContext === 'root')
  ) {
    return NODE_TYPES
  }

  if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*$/.test(trimmed)) {
    return []
  }

  if (
    trimmed.match(/^\s*(form|webhook|schedule)\s*:\s*$/) &&
    blockContext === 'trigger'
  ) {
    const resourceType = trimmed.includes('form')
      ? 'form'
      : trimmed.includes('webhook')
        ? 'webhook'
        : 'schedule'
    const names: CompletionItem[] =
      resourceType === 'form'
        ? ast.forms.map((f) => ({
            label: f.name,
            kind: CompletionItemKind.Reference,
            detail: `Form: ${f.label}`,
          }))
        : resourceType === 'webhook'
          ? ast.webhooks.map((w) => ({
              label: w.name,
              kind: CompletionItemKind.Reference,
              detail: `Webhook: ${w.label}`,
            }))
          : ast.schedules.map((s) => ({
              label: s.name,
              kind: CompletionItemKind.Reference,
              detail: `Schedule: ${s.label}`,
            }))
    return names
  }

  if (
    trimmed.match(/^\s*(form|webhook|schedule)\s*:\s*[a-zA-Z0-9_]+\s*->\s*$/) &&
    blockContext === 'trigger'
  ) {
    return ast.workflows.map((g) => ({
      label: g.name,
      kind: CompletionItemKind.Reference,
      detail: `Graph: ${g.label}`,
    }))
  }

  if (/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*->\s*$/.test(trimmed)) {
    if (blockContext !== 'flow') {
      return []
    }
    const lastWorkflowMatch = Math.max(
      text.slice(0, offset).lastIndexOf('workflow '),
      text.slice(0, offset).lastIndexOf('graph '),
    )
    if (lastWorkflowMatch >= 0) {
      const afterWorkflow = text.slice(lastWorkflowMatch)
      const workflowNameMatch =
        afterWorkflow.match(/workflow\s+([a-zA-Z0-9_]+)\s*\{/) ??
        afterWorkflow.match(/graph\s+([a-zA-Z0-9_]+)\s*\{/)
      if (workflowNameMatch) {
        const graph = ast.workflows.find((g) => g.name === workflowNameMatch[1])
        if (graph) {
          return graph.nodes.map((node) => ({
            label: node.name,
            kind: CompletionItemKind.Reference,
            detail: node.label,
          }))
        }
      }
    }
    return []
  }

  if (
    /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*$/.test(trimmed) &&
    !trimmed.includes(':') &&
    blockContext === 'flow'
  ) {
    const lastWorkflowMatch = Math.max(
      text.slice(0, offset).lastIndexOf('workflow '),
      text.slice(0, offset).lastIndexOf('graph '),
    )
    const slice = text.slice(lastWorkflowMatch)
    const workflowNameMatch =
      slice.match(/workflow\s+([a-zA-Z0-9_]+)\s*\{/) ??
      slice.match(/graph\s+([a-zA-Z0-9_]+)\s*\{/)
    if (workflowNameMatch) {
      const graph = ast.workflows.find((g) => g.name === workflowNameMatch[1])
      if (graph) {
        return graph.nodes.map((node) => ({
          label: node.name,
          kind: CompletionItemKind.Reference,
          detail: `Edge target: ${node.label}`,
        }))
      }
    }
  }

  const inBlock = /\{\s*$/.test(text.slice(0, offset)) || blockContext !== null
  if (
    inBlock &&
    (trimmed.endsWith(' ') ||
      trimmed.endsWith(':') ||
      /^\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/.test(trimmed) ||
      /^[a-zA-Z_][a-zA-Z0-9_]*\s*$/.test(trimmed))
  ) {
    switch (blockContext) {
      case 'root':
        return ROOT_NODE_PROPERTIES
      case 'node': {
        const nodeContext = getNodeContextAtPosition(document, position, ast)
        if (nodeContext) {
          const node = nodeContext.graph.nodes.find(
            (n) => n.name === nodeContext.nodeName,
          )
          const isAiNode = node?.type === 'ai'
          const completingKindValue =
            /\bkind\s*:\s*$/.test(trimmed) || /\bkind\s*:\s*\S*$/.test(trimmed)
          if (isAiNode && completingKindValue) {
            return AI_KIND_VALUES
          }
          const nodeType = node?.type ?? 'code'
          return getNodePropertiesForType(nodeType)
        }
        return COMMON_NODE_PROPERTIES
      }
      case 'graph':
        return GRAPH_LEVEL_KEYWORDS
      case 'flow':
        return []
      case 'form':
        return FORM_PROPERTIES
      case 'webhook':
        return WEBHOOK_PROPERTIES
      case 'schedule':
        return SCHEDULE_PROPERTIES
      case 'trigger':
        return TRIGGER_PROPERTIES
      case 'secret':
        return SECRET_BLOCK_PROPERTIES
      case 'auth':
        return AUTH_BLOCK_PROPERTIES
      case 'postgres':
        return POSTGRES_BLOCK_PROPERTIES
      case 'disk':
        return DISK_BLOCK_PROPERTIES
      case 'computer':
        return COMPUTER_BLOCK_PROPERTIES
      case 'operation':
        return OPERATION_BLOCK_PROPERTIES
      case 'computer_harness':
        return HARNESS_BLOCK_PROPERTIES
      case 'skill':
        return SKILL_BLOCK_PROPERTIES
      case 'decision':
        return [
          'label',
          'description',
          'provider',
          'model',
          'secrets',
          'inputSchema',
          'questions',
        ].map((label) => ({
          label,
          kind: CompletionItemKind.Property,
          insertText: `${label}: `,
        }))
      case 'agent':
        return agentBodyCompletions(text, offset)
      case 'agent_role':
        return AGENT_ROLE_BODY_PROPERTIES
      case 'mcp':
        return MCP_BLOCK_PROPERTIES
      case 'connector':
        return CONNECTOR_BLOCK_PROPERTIES
      case 'network':
        return NETWORK_BLOCK_PROPERTIES
      case 'stream':
        return STREAM_PROPERTIES
      default:
        return []
    }
  }

  if (
    trimmed.length < 3 &&
    /^(f|w|s|g|t|n|a|p)$/.test(trimmed) &&
    blockContext === null
  ) {
    const keywordMap: Record<string, string> = {
      f: 'form',
      w: 'webhook',
      s: 'schedule',
      g: 'graph',
      t: 'trigger',
      n: 'node',
      a: 'auth',
      p: 'postgres',
    }
    const full = keywordMap[trimmed]
    if (full) {
      return TOP_LEVEL_KEYWORDS.filter((keyword) => keyword.label === full)
    }
  }

  if (blockContext === null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    const matches = TOP_LEVEL_KEYWORDS.filter((k) =>
      k.label.startsWith(trimmed),
    )
    if (matches.length > 0) {
      return matches
    }
  }

  return []
}
