import type {
  DatabaseDecl,
  MigrationDecl,
  NodeDecl,
  PostgresDecl,
  SourceRange,
  StreamDecl,
  StreamVersionDecl,
  SwirlsFile,
  WorkflowDecl,
} from '@swirls/language'
import type { WorkspaceResourceIndex } from '@swirls/language/workspace'
import type { Position } from 'vscode-languageserver'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import type { TsSwirlsBinding } from '../ts-bindings'
import {
  generateContextTypePreamble,
  generateMigrationContextPreamble,
  generateStreamBlockContextPreamble,
  generateStreamBlockMissingGraphPreamble,
  getRootNode,
  mergedWorkflowDecls,
} from './context-types'
import {
  integrationActionsForAst,
  integrationConnectionsForAst,
} from './integration-types'
import {
  getExpectedReturnType,
  getExpectedReturnTypePreamble,
} from './return-types'

/** Minimal graph for `.ts.swirls` files with no parent binding. */
const UNBOUND_STANDALONE_WORKFLOW: WorkflowDecl = {
  name: '__unbound',
  label: '',
  nodes: [
    {
      name: '_',
      type: 'code',
      label: '',
      configFields: {},
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    },
  ],
  edges: [],
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
}

const UNBOUND_NODE = UNBOUND_STANDALONE_WORKFLOW.nodes[0]!

/**
 * Map the whole TextDocument to a Swirls 1-based `innerRange` (for virtual TS offset math).
 */
function wholeDocumentSourceRange(doc: TextDocument): SourceRange {
  const lineCount = doc.lineCount
  const lastIdx = Math.max(0, lineCount - 1)
  const lastLineText = doc.getText({
    start: { line: lastIdx, character: 0 },
    end: { line: lastIdx, character: Number.MAX_SAFE_INTEGER },
  })
  const text = doc.getText()

  return {
    start: { line: 1, column: 1, offset: 0 },
    end: {
      line: Math.max(1, lineCount),
      column: lastLineText.length + 1,
      offset: text.length,
    },
  }
}

export function buildStandaloneTsBlockInfoFromBindings(
  doc: TextDocument,
  bindings: TsSwirlsBinding[],
): { block: TsBlockInfo; ambiguous: boolean; unbound: boolean } {
  const innerRange = wholeDocumentSourceRange(doc)
  const code = doc.getText()

  if (bindings.length === 0) {
    return {
      block: {
        code,
        innerRange,
        configKey: 'code',
        workflowName: UNBOUND_STANDALONE_WORKFLOW.name,
        nodeName: UNBOUND_NODE.name,
        graph: UNBOUND_STANDALONE_WORKFLOW,
        node: UNBOUND_NODE,
        allWorkflows: [],
        postgresBlocks: [],
        streams: [],
      },
      ambiguous: false,
      unbound: true,
    }
  }

  const b = bindings[0]!
  return {
    block: {
      code,
      innerRange,
      configKey: b.configKey,
      workflowName: b.workflowName,
      nodeName: b.nodeName,
      graph: b.graph,
      node: b.node,
      allWorkflows: b.allWorkflows,
      postgresBlocks: b.postgresBlocks ?? [],
      streams: b.streams ?? [],
      streamDecl: b.streamDecl,
      streamVersionDecl: b.streamVersionDecl,
      referencedWorkflow: b.referencedWorkflow,
      databases: b.databases ?? [],
    },
    ambiguous: bindings.length > 1,
    unbound: false,
  }
}

export interface TsBlockInfo {
  code: string
  innerRange: SourceRange
  /** Config field key (e.g. "input", "code", "prompt", "router") for return type resolution. */
  configKey: string
  workflowName: string
  nodeName: string
  graph: WorkflowDecl
  node: NodeDecl
  /** All graphs in the file; used to resolve subgraph output types. */
  allWorkflows: WorkflowDecl[]
  /** Postgres block declarations from the file; used to infer select/insert/update/delete output types. */
  postgresBlocks: PostgresDecl[]
  /** Top-level stream blocks; used to type `type: stream` node output from referenced JSON Schema. */
  streams: StreamDecl[]
  /** Set when this block is inside `stream { versions { vN { ... }}}` (condition / prepare under a specific version). */
  streamDecl?: StreamDecl
  /** The `vN { }` decl when collecting per-version TS blocks */
  streamVersionDecl?: StreamVersionDecl
  /** Referenced graph from `stream.graph`; used for stream-block context preamble. */
  referencedWorkflow?: WorkflowDecl
  /**
   * When this @ts is inside a map/fanout/while `subgraph { }`, the map or while node (for `context.iteration` typing).
   */
  loopParent?: NodeDecl
  /**
   * When this @ts is `condition:` or `update:` on a `while` node in the parent graph (not inside subgraph).
   */
  loopHost?: NodeDecl
  /** Full `.swirls` AST; used to resolve named `schema` references in return-type inference. */
  fileAst?: SwirlsFile
  /** Top-level connection blocks; used to resolve integration action typing. */
  connections?: SwirlsFile['connections']
  /** Top-level action blocks; used to resolve integration action typing. */
  actions?: SwirlsFile['actions']
  /** Workspace index for cross-file action/schema resolution. */
  workspace?: WorkspaceResourceIndex
  /** Read project files by path relative to workspace root (for GraphQL schema sidecars). */
  readWorkspaceFile?: import('./integration-types').WorkspaceFileReader
  /**
   * Managed `database` blocks visible to this block (current file merged with
   * the workspace index); used to type `context.db`.
   */
  databases?: DatabaseDecl[]
  /**
   * Set when this @ts is a top-level `migration` block's `operation` body. The
   * preamble then types `context.db` for the target database only (full action
   * set, no $transaction) with empty node context.
   */
  migration?: MigrationDecl
}

/**
 * Databases visible to TS blocks in a file: current-file decls plus
 * workspace-indexed ones from other files (current file wins on name clash).
 */
function mergedDatabases(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): DatabaseDecl[] {
  const out = [...(ast.databases ?? [])]
  if (workspace) {
    for (const [name, decl] of workspace.databaseBlocks) {
      if (!out.some((d) => d.name === name)) {
        out.push(decl)
      }
    }
  }
  return out
}

function collectTsBlocksFromGraph(
  graph: WorkflowDecl,
  ast: SwirlsFile,
  loopParent: NodeDecl | undefined,
  connections: SwirlsFile['connections'],
  actions: SwirlsFile['actions'],
  workspace: WorkspaceResourceIndex | undefined,
  databases: DatabaseDecl[],
  readWorkspaceFile?: import('./integration-types').WorkspaceFileReader,
): TsBlockInfo[] {
  const blocks: TsBlockInfo[] = []
  const pgBlocks = ast.postgres ?? []
  const streamDecls = ast.streams ?? []
  const allWorkflows = mergedWorkflowDecls(ast, workspace)
  for (const node of graph.nodes) {
    for (const [configKey, value] of Object.entries(node.configFields)) {
      if (value?.kind === 'ts_block' && value.innerRange) {
        const loopHost =
          node.type === 'while' &&
          (configKey === 'condition' || configKey === 'update')
            ? node
            : undefined
        blocks.push({
          code: value.code,
          innerRange: value.innerRange,
          configKey,
          workflowName: graph.name,
          nodeName: node.name,
          graph,
          node,
          allWorkflows,
          postgresBlocks: pgBlocks,
          streams: streamDecls,
          loopParent,
          loopHost,
          fileAst: ast,
          connections,
          actions,
          workspace,
          databases,
          readWorkspaceFile,
        })
      }
    }
    if (node.subgraph) {
      const subGraph: WorkflowDecl = {
        name: `${graph.name}__${node.name}__subgraph`,
        label: '',
        nodes: node.subgraph.nodes,
        edges: node.subgraph.edges,
        flowRange: node.subgraph.flowRange,
        range: node.subgraph.range,
      }
      if (
        node.type === 'map' ||
        node.type === 'fanout' ||
        node.type === 'while'
      ) {
        blocks.push(
          ...collectTsBlocksFromGraph(
            subGraph,
            ast,
            node,
            connections,
            actions,
            workspace,
            databases,
            readWorkspaceFile,
          ),
        )
      }
    }
  }
  return blocks
}

/**
 * Collect all fenced TypeScript blocks from the AST with their source ranges.
 */
export function collectTsBlocks(
  ast: SwirlsFile,
  opts?: {
    workspace?: WorkspaceResourceIndex
    readWorkspaceFile?: import('./integration-types').WorkspaceFileReader
  },
): TsBlockInfo[] {
  const blocks: TsBlockInfo[] = []
  const pgBlocks = ast.postgres ?? []
  const streamDecls = ast.streams ?? []
  const connections = integrationConnectionsForAst(ast, opts?.workspace)
  const actions = integrationActionsForAst(ast, opts?.workspace)
  const databases = mergedDatabases(ast, opts?.workspace)
  const allWorkflows = mergedWorkflowDecls(ast, opts?.workspace)
  for (const graph of ast.workflows) {
    blocks.push(
      ...collectTsBlocksFromGraph(
        graph,
        ast,
        undefined,
        connections,
        actions,
        opts?.workspace,
        databases,
        opts?.readWorkspaceFile,
      ),
    )
  }

  for (const migration of ast.migrations ?? []) {
    const op = migration.operation
    if (op?.kind === 'ts_block' && op.innerRange) {
      blocks.push({
        code: op.code,
        innerRange: op.innerRange,
        configKey: 'operation',
        workflowName: UNBOUND_STANDALONE_WORKFLOW.name,
        nodeName: UNBOUND_NODE.name,
        graph: UNBOUND_STANDALONE_WORKFLOW,
        node: UNBOUND_NODE,
        allWorkflows: ast.workflows,
        postgresBlocks: pgBlocks,
        streams: streamDecls,
        fileAst: ast,
        databases,
        migration,
      })
    }
  }

  for (const stream of streamDecls) {
    const referencedWorkflow =
      ast.workflows.find((g) => g.name === stream.workflowName) ??
      opts?.workspace?.workflowBlocks.get(stream.workflowName)
    const workflowForBlock = referencedWorkflow ?? UNBOUND_STANDALONE_WORKFLOW
    const rootNode = referencedWorkflow
      ? (getRootNode(referencedWorkflow) ?? referencedWorkflow.nodes[0])
      : UNBOUND_NODE

    if (!rootNode) {
      continue
    }

    for (const sv of stream.versions ?? []) {
      for (const configKey of ['condition', 'prepare'] as const) {
        const value = sv[configKey]
        if (value?.kind === 'ts_block' && value.innerRange) {
          blocks.push({
            code: value.code,
            innerRange: value.innerRange,
            configKey,
            workflowName: workflowForBlock.name,
            nodeName: rootNode.name,
            graph: workflowForBlock,
            node: rootNode,
            allWorkflows,
            postgresBlocks: pgBlocks,
            streams: streamDecls,
            streamDecl: stream,
            streamVersionDecl: sv,
            referencedWorkflow: referencedWorkflow ?? undefined,
            fileAst: ast,
            workspace: opts?.workspace,
            readWorkspaceFile: opts?.readWorkspaceFile,
          })
        }
      }
    }
  }

  return blocks
}

/**
 * Check if a position (0-based line, 0-based character) is inside the given range (1-based line/column).
 */
export function positionInRange(
  line: number,
  character: number,
  range: SourceRange,
): boolean {
  const start = range.start
  const end = range.end

  if (line + 1 < start.line || line + 1 > end.line) {
    return false
  }

  if (line + 1 === start.line && character + 1 < start.column) {
    return false
  }

  if (line + 1 === end.line && character + 1 > end.column) {
    return false
  }

  return true
}

/**
 * 0-based offset within `innerRange` text (matches `code` length) for a document position, or null.
 */
export function offsetInInnerRangeCode(
  document: TextDocument,
  position: Position,
  innerRange: SourceRange,
  codeLength: number,
): number | null {
  if (!positionInRange(position.line, position.character, innerRange)) {
    return null
  }
  const start = {
    line: innerRange.start.line - 1,
    character: innerRange.start.column - 1,
  }
  const end = {
    line: innerRange.end.line - 1,
    character: innerRange.end.column - 1,
  }
  const dStart = document.offsetAt(start)
  const dPos = document.offsetAt(position)
  const dEnd = document.offsetAt(end)
  if (dPos < dStart || dPos > dEnd) {
    return null
  }
  const off = dPos - dStart
  if (off < 0 || off > codeLength) {
    return null
  }
  return off
}

/** Pull in DOM typings (URLSearchParams, URL, etc.) for every virtual @ts file without fighting LanguageService default-lib resolution. */
const VIRTUAL_TS_DOM_REFERENCE = '/// <reference lib="dom" />\n'

/** Suffix after user code. Preamble has no trailing newline; wrapper starts with \n. */
const FUNCTION_WRAPPER_SUFFIX = '\n}\n'

/**
 * Ensures each virtual file is a module so that when multiple blocks share one Program,
 * their declarations (SwirlsContext, context, inputs) are file-scoped and don't conflict.
 */
const MODULE_MARKER = '\nexport {}\n'

/**
 * Build the full preamble (context types + optional __ExpectedReturn type) and the function wrapper prefix.
 * Used by both buildVirtualTsContent and getPreambleLineCount so line counts stay in sync.
 */
function getPreambleAndWrapper(block: TsBlockInfo): {
  fullPreamble: string
  wrapperPrefix: string
} {
  const basePreamble = block.migration
    ? generateMigrationContextPreamble(block.migration, block.databases ?? [])
    : block.streamDecl
      ? block.referencedWorkflow
        ? generateStreamBlockContextPreamble(
            block.referencedWorkflow,
            block.allWorkflows,
            block.postgresBlocks,
            block.streams,
            block.fileAst,
            block.connections,
            block.actions,
            block.workspace,
            block.readWorkspaceFile,
          )
        : generateStreamBlockMissingGraphPreamble()
      : generateContextTypePreamble(
          block.graph,
          block.nodeName,
          block.allWorkflows,
          block.postgresBlocks,
          block.streams,
          block.loopParent,
          block.loopHost,
          block.fileAst,
          block.connections,
          block.actions,
          block.workspace,
          block.databases,
          block.configKey,
          block.readWorkspaceFile,
        )

  const returnTypePreamble = getExpectedReturnTypePreamble(block) ?? ''
  const returnType = getExpectedReturnType(block)
  let returnTypeLine = ''

  if (returnType !== undefined) {
    returnTypeLine = `type __ExpectedReturn = ${returnType}\n`
  }

  // The executor runs block bodies inside `async function (context) { ... }`,
  // so `await` is legal at the top of a block; the virtual wrapper must be
  // async too. With an expected return type the annotation is Promise-wrapped
  // (an async function may resolve either T or Promise<T>).
  const fullPreamble = basePreamble + returnTypePreamble + returnTypeLine
  let wrapperPrefix = '\nasync function __expr() {\n'

  if (returnType !== undefined) {
    wrapperPrefix = '\nasync function __expr(): Promise<__ExpectedReturn> {\n'
  }

  return { fullPreamble, wrapperPrefix }
}

/**
 * Build virtual TypeScript document content for a block (preamble + function wrapper + user code).
 * User code is wrapped in a function so 'return' is valid (they write only the body).
 * When the block has an expected return type (input, prompt, router, code with outputSchema, parallel objective/searchQueries/urls, …), the function is annotated so TS validates the return value.
 * Ends with export {} so the file is a module and does not pollute the global scope in a multi-file Program.
 */
export function buildVirtualTsContent(block: TsBlockInfo): string {
  const { fullPreamble, wrapperPrefix } = getPreambleAndWrapper(block)
  return (
    VIRTUAL_TS_DOM_REFERENCE +
    fullPreamble +
    wrapperPrefix +
    block.code +
    FUNCTION_WRAPPER_SUFFIX +
    MODULE_MARKER
  )
}

/**
 * Number of lines before the first line of user code (0-based).
 * First line is /// <reference lib="dom" />. Preamble has no trailing newline. Wrapper prefix "\nfunction __expr() {\n" (or with return type) follows; first user line is at fullPreambleLines+2.
 */
function getPreambleLineCount(block: TsBlockInfo): number {
  const { fullPreamble } = getPreambleAndWrapper(block)
  const preambleLines = fullPreamble.split('\n').length
  return preambleLines + 2
}

/**
 * Map from virtual document position (0-based) to original .swirls position (0-based).
 * User code in the virtual file is block.code unchanged, so column offsets match (no startChar adjustment).
 */
export function virtualToOriginal(
  block: TsBlockInfo,
  virtualLine: number,
  virtualChar: number,
): { line: number; character: number } {
  const preambleLines = getPreambleLineCount(block)
  if (virtualLine < preambleLines) {
    return {
      line: block.innerRange.start.line - 1,
      character: block.innerRange.start.column - 1,
    }
  }
  const originalLine =
    block.innerRange.start.line - 1 + (virtualLine - preambleLines)
  const originalChar = virtualChar
  return { line: originalLine, character: originalChar }
}

/**
 * Map from original .swirls position (0-based) to virtual document position (0-based).
 * User code in the virtual file is block.code unchanged, so line and column offsets match.
 */
export function originalToVirtual(
  block: TsBlockInfo,
  originalLine: number,
  originalChar: number,
): { line: number; character: number } {
  const preambleLines = getPreambleLineCount(block)
  const startLine = block.innerRange.start.line - 1
  const virtualLine = preambleLines + (originalLine - startLine)
  const virtualChar = originalChar
  return { line: virtualLine, character: virtualChar }
}

// --- JSON blocks (schema definitions) ---

export interface JsonBlockInfo {
  code: string
  innerRange: SourceRange
  /** Context for diagnostics (form/webhook name or graph/node for node schemas). */
  label?: string
}

/**
 * Collect all @json { } schema regions from the AST (form, webhook, node inputSchema/outputSchema).
 */
export function collectJsonBlocks(ast: SwirlsFile): JsonBlockInfo[] {
  const blocks: JsonBlockInfo[] = []

  for (const form of ast.forms) {
    if (form.schemaBlock) {
      blocks.push({
        code: form.schemaBlock.code,
        innerRange: form.schemaBlock.innerRange,
        label: `form ${form.name}`,
      })
    }
  }

  for (const webhook of ast.webhooks) {
    if (webhook.schemaBlock) {
      blocks.push({
        code: webhook.schemaBlock.code,
        innerRange: webhook.schemaBlock.innerRange,
        label: `webhook ${webhook.name}`,
      })
    }
  }

  for (const graph of ast.workflows) {
    for (const node of graph.nodes) {
      if (node.inputSchemaBlock) {
        blocks.push({
          code: node.inputSchemaBlock.code,
          innerRange: node.inputSchemaBlock.innerRange,
          label: `workflow ${graph.name} node ${node.name} inputSchema`,
        })
      }

      if (node.outputSchemaBlock) {
        blocks.push({
          code: node.outputSchemaBlock.code,
          innerRange: node.outputSchemaBlock.innerRange,
          label: `workflow ${graph.name} node ${node.name} outputSchema`,
        })
      }
    }
  }

  for (const stream of ast.streams ?? []) {
    for (const sv of stream.versions ?? []) {
      if (sv.schemaBlock) {
        blocks.push({
          code: sv.schemaBlock.code,
          innerRange: sv.schemaBlock.innerRange,
          label: `stream ${stream.name} ${sv.key} schema`,
        })
      }
    }
  }

  for (const sch of ast.schemas ?? []) {
    if (sch.schemaBlock) {
      blocks.push({
        code: sch.schemaBlock.code,
        innerRange: sch.schemaBlock.innerRange,
        label: `schema ${sch.name}`,
      })
    }
  }

  return blocks
}

/**
 * Map a position inside a JSON block from virtual (0-based, relative to block content) to original .swirls (0-based).
 */
export function jsonVirtualToOriginal(
  block: JsonBlockInfo,
  virtualLine: number,
  virtualChar: number,
): { line: number; character: number } {
  const start = block.innerRange.start

  return {
    line: start.line - 1 + virtualLine,
    character: virtualLine === 0 ? start.column - 1 + virtualChar : virtualChar,
  }
}
