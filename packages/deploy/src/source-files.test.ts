import { describe, expect, test } from 'bun:test'

import { parseDeploymentDefinition } from '@swirls/definition/deployment-definition'

import { buildDeploymentDefinitionPayload, mergeProjectSwirlsFiles } from './bundle'
import { createMemoryRepoFs, sliceRepoFilesToRoot, virtualRepoCwd } from './memory-repo-fs'
import {
  buildDeploymentSourceManifest,
  collectDeploymentSourceFiles,
  computeDeploymentSourceFingerprint,
  validateDeploymentSourceInput,
} from './source-files'

describe('deployment source files', () => {
  test('collects .swirls and .ts.swirls files with normalized nested paths', () => {
    const files = new Map([
      [
        'app/workflows/main.swirls',
        'workflow x { label: "X" root { type: code label: "r" code: @ts { return {} } } }',
      ],
      ['app/workflows/helpers/normalize.ts.swirls', 'return context.nodes.root.input'],
      ['app/node_modules/ignored.swirls', 'workflow ignored {}'],
    ])

    const sliced = sliceRepoFilesToRoot(files, 'app')
    const fs = createMemoryRepoFs(sliced, '/repo')

    const sourceFiles = collectDeploymentSourceFiles(fs, virtualRepoCwd('/repo'))

    expect(sourceFiles.map((file) => file.path)).toEqual([
      'workflows/helpers/normalize.ts.swirls',
      'workflows/main.swirls',
    ])

    expect(sourceFiles.every((file) => file.sha256.length === 64)).toBe(true)
  })

  test('maps deployed resources and workflow nodes back to source ranges', () => {
    const files = new Map([
      [
        'nested/main.swirls',
        `
schema contact_payload {
  label: "Contact payload"
  schema: @json { { "type": "object", "properties": { "email": { "type": "string" } } } }
}

form contact {
  label: "Contact"
  schema: contact_payload
}

workflow process_contact {
  label: "Process contact"
  root {
    type: code
    label: "Entry"
    code: @ts { return context.nodes.root.input ?? {} }
  }

  node normalize {
    type: code
    label: "Normalize"
    code: @ts { return context.nodes.root.output }
  }

  flow {
    root -> normalize
  }
}

trigger on_contact {
  form:contact -> process_contact
}
`,
      ],
    ])

    const fs = createMemoryRepoFs(files, '/repo')
    const cwd = virtualRepoCwd('/repo')
    const ast = mergeProjectSwirlsFiles(fs, cwd)
    const built = buildDeploymentDefinitionPayload(ast)
    expect(built.parseError).toBeNull()
    const parsed = parseDeploymentDefinition(built.definition)
    expect(parsed.success).toBe(true)

    if (!parsed.success) {
      return
    }

    const manifest = buildDeploymentSourceManifest({
      definition: parsed.data,
      ast,
      files: collectDeploymentSourceFiles(fs, cwd),
    })

    expect(manifest.files.map((file) => file.path)).toEqual(['nested/main.swirls'])

    expect(
      manifest.resources.find(
        (location) => location.kind === 'workflow' && location.name === 'process_contact',
      ),
    ).toMatchObject({
      path: 'nested/main.swirls',
    })

    expect(manifest.nodes.find((location) => location.nodeName === 'normalize')).toMatchObject({
      workflowName: 'process_contact',
      path: 'nested/main.swirls',
    })
  })

  test('source fingerprint changes for source-only edits', () => {
    const before = computeDeploymentSourceFingerprint([
      { path: 'workflow.swirls', sha256: 'a'.repeat(64) },
    ])

    const after = computeDeploymentSourceFingerprint([
      { path: 'workflow.swirls', sha256: 'b'.repeat(64) },
    ])

    expect(after).not.toBe(before)
  })

  test('validateDeploymentSourceInput rejects fingerprint mismatch', () => {
    const files = [
      {
        path: 'main.swirls',
        content: 'workflow x {}',
        size: 14,
        sha256: 'a'.repeat(64),
      },
    ]

    const manifest = {
      version: 1 as const,
      files: [{ path: 'main.swirls', size: 14, sha256: 'a'.repeat(64) }],
      resources: [],
      nodes: [],
      sourceFingerprint: 'b'.repeat(64),
    }

    expect(() => validateDeploymentSourceInput(files, manifest)).toThrow(
      /fingerprint does not match/i,
    )
  })
})
