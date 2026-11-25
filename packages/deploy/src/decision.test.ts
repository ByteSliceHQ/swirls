import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { parseDeploymentDefinition } from '@swirls/definition/deployment-definition'
import { parse } from '@swirls/language'

import { buildDeploymentDefinitionPayload, mergeProjectSwirlsFiles } from './bundle'
import { computeDeploymentDefinitionFingerprint } from './deployment-fingerprint'
import { createMemoryRepoFs, virtualRepoCwd } from './memory-repo-fs'

const source = readFileSync(
  new URL('../../language/examples/decisions.swirls', import.meta.url),
  'utf8',
)

test('managed decisions snapshot an explicit secret binding without credential values', () => {
  const text = source.replace('secret decision_vendor {', 'secret decision_vendor { type: managed')
  const built = buildDeploymentDefinitionPayload(parse(text).ast)
  expect(built.parseError).toBeNull()
  const result = parseDeploymentDefinition(built.definition)
  expect(result.success).toBe(true)

  if (!result.success) {
    return
  }

  expect(result.data.secretBlocks?.find((block) => block.name === 'decision_vendor')).toMatchObject(
    { type: 'managed', vars: ['TYPESAFE_API_KEY'] },
  )

  expect(result.data.decisionBlocks?.[0]?.secrets).toBe('decision_vendor')
  const node = result.data.workflows?.[0]?.nodes.find((n) => n.type === 'decision')
  expect(node?.secretsMap).toEqual({ decision_vendor: ['TYPESAFE_API_KEY'] })
})

test('decision snapshot fingerprints ignore UUIDs but preserve model syntax and rubric changes', () => {
  const build = (text: string) => {
    const result = parseDeploymentDefinition(
      buildDeploymentDefinitionPayload(parse(text).ast).definition,
    )

    if (!result.success) {
      throw result.error
    }

    return result.data
  }

  const first = build(source)
  const second = build(source)

  expect(computeDeploymentDefinitionFingerprint(first)).toBe(
    computeDeploymentDefinitionFingerprint(second),
  )

  expect(computeDeploymentDefinitionFingerprint(first)).not.toBe(
    computeDeploymentDefinitionFingerprint(
      build(source.replace('Work is blocked', 'Everything is blocked')),
    ),
  )

  const changed = structuredClone(second)
  const node = changed.workflows![0]!.nodes.find((n) => n.type === 'decision')!
  node.configValueKinds = { ...node.configValueKinds, model: 'literal' }

  expect(computeDeploymentDefinitionFingerprint(first)).not.toBe(
    computeDeploymentDefinitionFingerprint(changed),
  )
})

test('deployment snapshots carry resolved decisions and executable model metadata', () => {
  const built = buildDeploymentDefinitionPayload(parse(source).ast)
  expect(built.parseError).toBeNull()
  const result = parseDeploymentDefinition(built.definition)
  expect(result.success).toBe(true)

  if (!result.success) {
    return
  }

  const nodes = result.data.workflows![0]!.nodes
  const decision = nodes.find((n) => n.type === 'decision')!
  expect(decision.configValueKinds).toEqual({ model: 'ts', state: 'ts' })
  expect(decision.secretsMap).toEqual({ decision_vendor: ['TYPESAFE_API_KEY'] })

  expect(decision.config.type === 'decision' && decision.config.definition?.inputSchema.type).toBe(
    'object',
  )

  expect(nodes.find((n) => n.type === 'agent')?.configValueKinds?.model).toBe('ts')
  expect(nodes.find((n) => n.type === 'ai')?.configValueKinds?.model).toBe('ts')
})

test('cross-file decisions, schemas and file-backed model overrides resolve in the bundle', () => {
  const split = source.indexOf('workflow decision_triage')

  const files = {
    'decisions.swirls': source.slice(0, split),
    'workflow.swirls': source
      .slice(split)
      .replace('model: @ts { return "jev-1.13.0" }', 'model: @ts "choose.ts.swirls"'),
    'choose.ts.swirls': 'return "jev-1.13.0"',
  }

  const ast = mergeProjectSwirlsFiles(
    createMemoryRepoFs(new Map(Object.entries(files)), '/repo'),
    virtualRepoCwd('/repo'),
  )

  const built = buildDeploymentDefinitionPayload(ast)
  expect(built.parseError).toBeNull()
  expect(ast.decisions).toHaveLength(1)
})
