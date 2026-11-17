import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { buildWorkspaceResourceIndex, workspaceDuplicates } from './workspace-resources'

describe('stream blocks across files', () => {
  test('unions stream names from multiple files and detects duplicates', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-ws-'))

    try {
      fs.writeFileSync(
        path.join(dir, 'a.swirls'),
        `version: 1
stream foo { workflow: g version: v1 versions: { v1 { schema: @json { {} } prepare: @ts { return {} } } } }
workflow g { label: "G" root { type: code label: "R" code: @ts { return {} } } }
`,
        'utf-8',
      )

      fs.writeFileSync(
        path.join(dir, 'b.swirls'),
        `version: 1
stream foo { workflow: h version: v1 versions: { v1 { schema: @json { {} } prepare: @ts { return {} } } } }
workflow h { label: "H" root { type: code label: "R" code: @ts { return {} } } }
`,
        'utf-8',
      )

      fs.writeFileSync(
        path.join(dir, 'c.swirls'),
        `version: 1
stream bar { workflow: i version: v1 versions: { v1 { schema: @json { {} } prepare: @ts { return {} } } } }
workflow i { label: "I" root { type: code label: "R" code: @ts { return {} } } }
`,
        'utf-8',
      )

      const { streams } = buildWorkspaceResourceIndex({ cwd: dir })
      expect([...streams.keys()].sort()).toEqual(['bar', 'foo'])
      expect(streams.get('foo')?.length).toBe(2)
      expect(streams.get('bar')?.length).toBe(1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildWorkspaceResourceIndex', () => {
  test('indexes secrets vars and schemaLiterals across files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-ws2-'))

    try {
      fs.writeFileSync(
        path.join(dir, 'schemas.swirls'),
        `version: 1
schema base { label: "B" schema: @json { { "type": "object", "properties": { "x": { "type": "string" } } } } }
`,
        'utf-8',
      )

      fs.writeFileSync(
        path.join(dir, 'rest.swirls'),
        `version: 1
schema derived { label: "D" schema: base }
secret s1 { label: "S" vars: [K1, K2] }
`,
        'utf-8',
      )

      const idx = buildWorkspaceResourceIndex({ cwd: dir })
      expect(idx.schemas.has('base')).toBe(true)
      expect(idx.schemas.has('derived')).toBe(true)
      const baseSite = idx.schemas.get('base')?.[0]
      expect(baseSite?.range).toBeDefined()
      expect(baseSite?.range?.start.line).toBe(baseSite?.line)
      const secretSite = idx.secrets.get('s1')?.sites[0]
      expect(secretSite?.range).toBeDefined()
      expect(secretSite?.range?.start.line).toBe(secretSite?.line)

      expect(idx.schemaLiterals.get('derived')).toEqual({
        type: 'object',
        properties: { x: { type: 'string' } },
      })

      expect(idx.secrets.get('s1')?.vars.sort()).toEqual(['K1', 'K2'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('workspaceDuplicates lists multiple resource kinds', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-ws3-'))

    try {
      fs.writeFileSync(
        path.join(dir, 'a.swirls'),
        `version: 1
workflow g { label: "G" root { type: code label: "R" code: @ts { return {} } } }
schema dup { label: "D" schema: @json { {} } }
`,
        'utf-8',
      )

      fs.writeFileSync(
        path.join(dir, 'b.swirls'),
        `version: 1
workflow g { label: "G2" root { type: code label: "R" code: @ts { return {} } } }
schema dup { label: "D2" schema: @json { {} } }
`,
        'utf-8',
      )

      const idx = buildWorkspaceResourceIndex({ cwd: dir })
      const dupes = workspaceDuplicates(idx)
      const kinds = new Set(dupes.map((d) => d.kind))
      expect(kinds.has('workflow')).toBe(true)
      expect(kinds.has('schema')).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('indexes mcp blocks and detects cross-file duplicates', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-ws-mcp-'))

    try {
      fs.writeFileSync(
        path.join(dir, 'a.swirls'),
        `version: 1
mcp axiom { label: "Axiom" url: "https://mcp.example.com/mcp" }
`,
        'utf-8',
      )

      fs.writeFileSync(
        path.join(dir, 'b.swirls'),
        `version: 1
mcp axiom { label: "Axiom 2" url: "https://mcp.example.com/mcp2" }
mcp other { label: "Other" url: "https://mcp.example.com/other" }
`,
        'utf-8',
      )

      const idx = buildWorkspaceResourceIndex({ cwd: dir })
      expect(idx.mcp.has('axiom')).toBe(true)
      expect(idx.mcp.has('other')).toBe(true)
      expect(idx.mcpBlocks.has('axiom')).toBe(true)

      const dupes = workspaceDuplicates(idx)
      const mcpDup = dupes.find((d) => d.kind === 'mcp' && d.name === 'axiom')
      expect(mcpDup?.sites.length).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('indexes connector blocks and detects cross-file duplicates', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-ws-connector-'))

    try {
      fs.writeFileSync(
        path.join(dir, 'a.swirls'),
        `version: 1
connector client_portal { label: "Client connector" }
`,
        'utf-8',
      )

      fs.writeFileSync(
        path.join(dir, 'b.swirls'),
        `version: 1
connector client_portal { label: "Client connector 2" }
connector other_portal { label: "Other" }
`,
        'utf-8',
      )

      const idx = buildWorkspaceResourceIndex({ cwd: dir })
      expect(idx.connector.has('client_portal')).toBe(true)
      expect(idx.connector.has('other_portal')).toBe(true)
      expect(idx.connectorBlocks.has('client_portal')).toBe(true)

      const dupes = workspaceDuplicates(idx)
      const connectorDup = dupes.find((d) => d.kind === 'connector' && d.name === 'client_portal')
      expect(connectorDup?.sites.length).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
