import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildWorkspaceResourceIndex } from '@swirls/language/workspace'
import type { Location } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getDefinition as getDefinitionResult } from './definition'
import { lineIndexOf, positionAt } from './nav-test-helpers'

const EXAMPLES_DIR = path.join(import.meta.dir, '../../language/examples')
const URI = 'file:///switch-routing.swirls'

function getDefinition(
  ...args: Parameters<typeof getDefinitionResult>
): Location | null {
  const result = getDefinitionResult(...args)
  if (Array.isArray(result)) {
    if (result.length > 1) {
      throw new Error('Expected one definition location in this test.')
    }
    return result[0] ?? null
  }
  return result
}

function loadSwitchRouting(): { doc: TextDocument; content: string } {
  const p = path.join(EXAMPLES_DIR, 'switch-routing.swirls')
  const content = fs.readFileSync(p, 'utf8')
  const doc = TextDocument.create(URI, 'swirls', 1, content)
  return { doc, content }
}

describe('getDefinition', () => {
  test('go-to-definition on node name in flow block returns node declaration', () => {
    const { doc } = loadSwitchRouting()
    const flowLine = 107
    const lineText = doc.getText({
      start: { line: flowLine, character: 0 },
      end: { line: flowLine, character: 200 },
    })
    const rootIndex = lineText.indexOf('root')
    expect(rootIndex).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(
      doc,
      { line: flowLine, character: rootIndex },
      URI,
    )
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(URI)
    expect(loc?.range.start.line).toBe(20)
    expect(loc?.range.start.character).toBeGreaterThanOrEqual(0)
  })

  test('go-to-definition on graph name in trigger returns graph declaration', () => {
    const { doc } = loadSwitchRouting()
    const triggerBindingLine = 115
    const lineText = doc.getText({
      start: { line: triggerBindingLine, character: 0 },
      end: { line: triggerBindingLine, character: 200 },
    })
    const workflowNameIndex = lineText.indexOf('triage_ticket')
    expect(workflowNameIndex).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(
      doc,
      { line: triggerBindingLine, character: workflowNameIndex },
      URI,
    )
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(URI)
    expect(loc?.range.start.line).toBe(17)
  })

  test('go-to-definition on form name in trigger returns form declaration', () => {
    const { doc } = loadSwitchRouting()
    const triggerBindingLine = 115
    const lineText = doc.getText({
      start: { line: triggerBindingLine, character: 0 },
      end: { line: triggerBindingLine, character: 200 },
    })
    const formNameIndex = lineText.indexOf('support_ticket')
    expect(formNameIndex).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(
      doc,
      { line: triggerBindingLine, character: formNameIndex },
      URI,
    )
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(URI)
    expect(loc?.range.start.line).toBe(0)
  })

  test('returns null for position on empty line', () => {
    const { doc } = loadSwitchRouting()
    const loc = getDefinition(doc, { line: 1, character: 0 }, URI)
    expect(loc).toBeNull()
  })

  test('returns null when parse has errors', () => {
    const doc = TextDocument.create(
      'file:///broken.swirls',
      'swirls',
      1,
      'form 123 {',
    )

    const loc = getDefinition(
      doc,
      { line: 0, character: 6 },
      'file:///broken.swirls',
    )

    expect(loc).toBeNull()
  })

  test('go-to-definition on auth secrets: ref jumps to secret block', () => {
    const p = path.join(
      import.meta.dir,
      '../../language/src/__fixtures__/valid-auth.swirls',
    )
    const content = fs.readFileSync(p, 'utf8')
    const uri = 'file:///valid-auth.swirls'
    const doc = TextDocument.create(uri, 'swirls', 1, content)
    const secretsLine = 23
    const lineText = doc.getText({
      start: { line: secretsLine, character: 0 },
      end: { line: secretsLine, character: 200 },
    })
    const ghIndex = lineText.indexOf('gh')
    expect(ghIndex).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(
      doc,
      { line: secretsLine, character: ghIndex },
      uri,
    )
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(uri)
    expect(loc?.range.start.line).toBe(2)
  })

  test('go-to-definition on node auth: ref jumps to auth block', () => {
    const p = path.join(
      import.meta.dir,
      '../../language/src/__fixtures__/valid-auth.swirls',
    )
    const content = fs.readFileSync(p, 'utf8')
    const uri = 'file:///valid-auth.swirls'
    const doc = TextDocument.create(uri, 'swirls', 1, content)
    const authLine = 60
    const lineText = doc.getText({
      start: { line: authLine, character: 0 },
      end: { line: authLine, character: 200 },
    })
    const idx = lineText.indexOf('oauth_ex')
    expect(idx).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(doc, { line: authLine, character: idx }, uri)
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(uri)
    expect(loc?.range.start.line).toBe(20)
  })

  test('go-to-definition on secrets map block name jumps to secret', () => {
    const p = path.join(
      import.meta.dir,
      '../../language/examples/secrets-declaration.swirls',
    )
    const content = fs.readFileSync(p, 'utf8')
    const uri = 'file:///secrets-declaration.swirls'
    const doc = TextDocument.create(uri, 'swirls', 1, content)
    const mapLine = lineIndexOf(content, 'my_svc:')
    const lineText = doc.getText({
      start: { line: mapLine, character: 0 },
      end: { line: mapLine, character: 200 },
    })
    const idx = lineText.indexOf('my_svc')
    expect(idx).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(doc, { line: mapLine, character: idx }, uri)
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(uri)
    expect(loc?.range.start.line).toBe(lineIndexOf(content, 'secret my_svc'))
  })

  test('go-to-definition on stream graph: ref jumps to graph', () => {
    const p = path.join(
      import.meta.dir,
      '../../language/src/__fixtures__/valid-stream.swirls',
    )
    const content = fs.readFileSync(p, 'utf8')
    const uri = 'file:///valid-stream.swirls'
    const doc = TextDocument.create(uri, 'swirls', 1, content)
    const graphLine = 41
    const lineText = doc.getText({
      start: { line: graphLine, character: 0 },
      end: { line: graphLine, character: 200 },
    })
    const idx = lineText.indexOf('process_leads')
    expect(idx).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(doc, { line: graphLine, character: idx }, uri)
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(uri)
    expect(loc?.range.start.line).toBe(0)
  })

  test('go-to-definition on named schema ref jumps to schema declaration', () => {
    const p = path.join(
      import.meta.dir,
      '../../language/examples/named-schema.swirls',
    )
    const content = fs.readFileSync(p, 'utf8')
    const uri = 'file:///named-schema.swirls'
    const doc = TextDocument.create(uri, 'swirls', 1, content)
    const formSchemaLine = 24
    const lineText = doc.getText({
      start: { line: formSchemaLine, character: 0 },
      end: { line: formSchemaLine, character: 200 },
    })
    const idx = lineText.indexOf('contact_payload')
    expect(idx).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(
      doc,
      { line: formSchemaLine, character: idx },
      uri,
    )
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe(uri)
    expect(loc?.range.start.line).toBe(5)
  })

  test('go-to-definition on graph name in graph node config returns graph declaration', () => {
    const subgraphPath = path.join(EXAMPLES_DIR, 'subgraph-workflow.swirls')
    const content = fs.readFileSync(subgraphPath, 'utf8')
    const doc = TextDocument.create(
      'file:///subgraph-workflow.swirls',
      'swirls',
      1,
      content,
    )
    const graphNodeConfigLine = 61
    const lineText = doc.getText({
      start: { line: graphNodeConfigLine, character: 0 },
      end: { line: graphNodeConfigLine, character: 80 },
    })
    const helperGraphIndex = lineText.indexOf('helper_graph')
    expect(helperGraphIndex).toBeGreaterThanOrEqual(0)
    const loc = getDefinition(
      doc,
      { line: graphNodeConfigLine, character: helperGraphIndex },
      'file:///subgraph-workflow.swirls',
    )
    expect(loc).not.toBeNull()
    expect(loc?.uri).toBe('file:///subgraph-workflow.swirls')
    expect(loc?.range.start.line).toBe(27)
  })

  describe('chat-delegating example (agent and tool refs)', () => {
    const uri = 'file:///chat-delegating.swirls'
    const p = path.join(EXAMPLES_DIR, 'chat-delegating.swirls')
    const content = fs.readFileSync(p, 'utf8')
    const doc = TextDocument.create(uri, 'swirls', 1, content)

    test('go-to-definition on agent secrets: ref jumps to secret block', () => {
      const line = 16
      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })
      const idx = lineText.indexOf('research_svc')
      expect(idx).toBeGreaterThanOrEqual(0)
      const loc = getDefinition(doc, { line, character: idx }, uri)
      expect(loc).not.toBeNull()
      expect(loc?.uri).toBe(uri)
      expect(loc?.range.start.line).toBe(8)
    })

    test('go-to-definition on agent tools[] entry jumps to workflow', () => {
      const line = 37
      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })
      const idx = lineText.indexOf('fake_search')
      expect(idx).toBeGreaterThanOrEqual(0)
      const loc = getDefinition(doc, { line, character: idx }, uri)
      expect(loc).not.toBeNull()
      expect(loc?.range.start.line).toBe(48)
    })

    test('go-to-definition on specialist team[] entry jumps to agent', () => {
      const line = 20
      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })
      const idx = lineText.indexOf('research_specialist')
      expect(idx).toBeGreaterThanOrEqual(0)
      const loc = getDefinition(doc, { line, character: idx }, uri)
      expect(loc).not.toBeNull()
      expect(loc?.range.start.line).toBe(31)
    })
  })

  describe('integration fixture (connection and action refs)', () => {
    const uri = 'file:///valid-integration.swirls'
    const p = path.join(
      import.meta.dir,
      '../../language/src/__fixtures__/valid-integration.swirls',
    )
    const content = fs.readFileSync(p, 'utf8')
    const doc = TextDocument.create(uri, 'swirls', 1, content)

    test('go-to-definition on integration connection: jumps to connection block', () => {
      const line = 73
      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })
      const idx = lineText.indexOf('team_slack')
      expect(idx).toBeGreaterThanOrEqual(0)
      const loc = getDefinition(doc, { line, character: idx }, uri)
      expect(loc).not.toBeNull()
      expect(loc?.range.start.line).toBe(35)
    })

    test('go-to-definition on integration action: jumps to action block', () => {
      const line = 74
      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })
      const idx = lineText.indexOf('slack_post_message')
      expect(idx).toBeGreaterThanOrEqual(0)
      const loc = getDefinition(doc, { line, character: idx }, uri)
      expect(loc).not.toBeNull()
      expect(loc?.range.start.line).toBe(2)
    })
  })

  describe('slack-team-orchestrator (channel agent ref)', () => {
    const uri = 'file:///slack-team-orchestrator.swirls'
    const p = path.join(EXAMPLES_DIR, 'slack-team-orchestrator.swirls')
    const content = fs.readFileSync(p, 'utf8')
    const doc = TextDocument.create(uri, 'swirls', 1, content)

    test('go-to-definition on channel agent: jumps to agent block', () => {
      const line = 36
      const lineText = doc.getText({
        start: { line, character: 0 },
        end: { line, character: 200 },
      })
      const idx = lineText.indexOf('slack_orchestrator')
      expect(idx).toBeGreaterThanOrEqual(0)
      const loc = getDefinition(doc, { line, character: idx }, uri)
      expect(loc).not.toBeNull()
      expect(loc?.range.start.line).toBe(16)
    })
  })

  describe('cross-file workspace index', () => {
    const crossFileDir = path.join(
      import.meta.dir,
      '__fixtures__/cross-file-secrets',
    )
    const duplicateDir = path.join(
      import.meta.dir,
      '__fixtures__/cross-file-duplicate',
    )

    test('go-to-definition on agent secrets: ref jumps to secret in sibling file', () => {
      const agentPath = path.join(crossFileDir, 'agent.swirls')
      const secretsPath = path.join(crossFileDir, 'secrets.swirls')
      const agentContent = fs.readFileSync(agentPath, 'utf8')
      const secretsContent = fs.readFileSync(secretsPath, 'utf8')
      const agentUri = pathToFileURL(agentPath).href
      const secretsUri = pathToFileURL(secretsPath).href
      const doc = TextDocument.create(agentUri, 'swirls', 1, agentContent)
      const refLine = lineIndexOf(agentContent, 'secrets: engineer_openrouter')
      const pos = positionAt(doc, refLine, 'engineer_openrouter')
      const workspaceIndex = buildWorkspaceResourceIndex({ cwd: crossFileDir })
      const loc = getDefinitionResult(doc, pos, agentUri, {
        workspaceIndex,
        workspaceRoot: crossFileDir,
      })

      expect(loc).not.toBeNull()
      const single = Array.isArray(loc) ? loc[0] : loc
      expect(single?.uri).toBe(secretsUri)
      expect(single?.range.start.line).toBe(
        lineIndexOf(secretsContent, 'secret engineer_openrouter'),
      )
    })

    test('duplicate secret name across files returns Location[]', () => {
      const agentPath = path.join(duplicateDir, 'b.swirls')
      const agentContent = fs.readFileSync(agentPath, 'utf8')
      const agentUri = pathToFileURL(agentPath).href
      const doc = TextDocument.create(agentUri, 'swirls', 1, agentContent)
      const refLine = lineIndexOf(agentContent, 'secrets: dup_secret')
      const pos = positionAt(doc, refLine, 'dup_secret')
      const workspaceIndex = buildWorkspaceResourceIndex({ cwd: duplicateDir })
      const loc = getDefinitionResult(doc, pos, agentUri, {
        workspaceIndex,
        workspaceRoot: duplicateDir,
      })

      expect(Array.isArray(loc)).toBe(true)
      expect((loc as { uri: string }[]).length).toBeGreaterThanOrEqual(2)
    })

    test('without ctx stays local-only on cross-file miss', () => {
      const agentPath = path.join(crossFileDir, 'agent.swirls')
      const agentContent = fs.readFileSync(agentPath, 'utf8')
      const agentUri = pathToFileURL(agentPath).href
      const doc = TextDocument.create(agentUri, 'swirls', 1, agentContent)
      const refLine = lineIndexOf(agentContent, 'secrets: engineer_openrouter')
      const pos = positionAt(doc, refLine, 'engineer_openrouter')
      const loc = getDefinitionResult(doc, pos, agentUri)

      expect(loc).toBeNull()
    })

    test('cross-file trigger form: ref jumps to form in sibling file', () => {
      const triggerDir = path.join(
        import.meta.dir,
        '__fixtures__/cross-file-trigger',
      )
      const triggersPath = path.join(triggerDir, 'triggers.swirls')
      const resourcesPath = path.join(triggerDir, 'resources.swirls')
      const triggersContent = fs.readFileSync(triggersPath, 'utf8')
      const resourcesContent = fs.readFileSync(resourcesPath, 'utf8')
      const triggersUri = pathToFileURL(triggersPath).href
      const resourcesUri = pathToFileURL(resourcesPath).href
      const doc = TextDocument.create(triggersUri, 'swirls', 1, triggersContent)
      const refLine = lineIndexOf(triggersContent, 'form: intake -> process')
      const pos = positionAt(doc, refLine, 'intake')
      const workspaceIndex = buildWorkspaceResourceIndex({ cwd: triggerDir })
      const loc = getDefinitionResult(doc, pos, triggersUri, {
        workspaceIndex,
        workspaceRoot: triggerDir,
      })

      expect(loc).not.toBeNull()
      const single = Array.isArray(loc) ? loc[0] : loc
      expect(single?.uri).toBe(resourcesUri)
      expect(single?.range.start.line).toBe(
        lineIndexOf(resourcesContent, 'form intake'),
      )
    })

    test('cross-file trigger workflow ref jumps to workflow in sibling file', () => {
      const triggerDir = path.join(
        import.meta.dir,
        '__fixtures__/cross-file-trigger',
      )
      const triggersPath = path.join(triggerDir, 'triggers.swirls')
      const resourcesPath = path.join(triggerDir, 'resources.swirls')
      const triggersContent = fs.readFileSync(triggersPath, 'utf8')
      const resourcesContent = fs.readFileSync(resourcesPath, 'utf8')
      const triggersUri = pathToFileURL(triggersPath).href
      const resourcesUri = pathToFileURL(resourcesPath).href
      const doc = TextDocument.create(triggersUri, 'swirls', 1, triggersContent)
      const refLine = lineIndexOf(triggersContent, 'form: intake -> process')
      const pos = positionAt(doc, refLine, 'process')
      const workspaceIndex = buildWorkspaceResourceIndex({ cwd: triggerDir })
      const loc = getDefinitionResult(doc, pos, triggersUri, {
        workspaceIndex,
        workspaceRoot: triggerDir,
      })

      expect(loc).not.toBeNull()
      const single = Array.isArray(loc) ? loc[0] : loc
      expect(single?.uri).toBe(resourcesUri)
      expect(single?.range.start.line).toBe(
        lineIndexOf(resourcesContent, 'workflow process'),
      )
    })
  })

  test('go-to-definition on app page channel: jumps to channel block', () => {
    const uri = 'file:///app-page-channel.swirls'
    const content = `
agent triage {
  provider: openrouter
  model: "gpt4o"
  secrets: ai_creds
}

secret ai_creds {
  vars: [ OPENROUTER_API_KEY ]
}

channel support_room {
  platform: swirls
  agent: triage
}

app support_center {
  label: "Acme Support Center"
  page room {
    channel: support_room
  }
}
`
    const doc = TextDocument.create(uri, 'swirls', 1, content)
    const refLine = lineIndexOf(content, 'channel: support_room')
    const pos = positionAt(doc, refLine, 'support_room')
    const loc = getDefinition(doc, pos, uri)

    expect(loc).not.toBeNull()
    expect(loc?.range.start.line).toBe(
      lineIndexOf(content, 'channel support_room'),
    )
  })
})
