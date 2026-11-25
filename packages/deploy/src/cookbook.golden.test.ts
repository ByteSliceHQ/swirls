/**
 * Lowers every recipe in the repository's cookbook and compares the result
 * with the output recorded in `__golden__/cookbook`. That output was produced
 * by the implementation this package was ported from, so the test holds the
 * two to the same definition for the same source.
 *
 * Each recipe is its own project: the recipe plus the `.ts.swirls` files
 * beside it. Ids are random, so both sides have them replaced by `id-<n>` in
 * order of first appearance. A recipe the reference refused (it uses an
 * action block the cookbook does not carry) must be refused here for the same
 * reason.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'

import { join } from 'pathe'

import {
  type DeploymentDefinition,
  parseDeploymentDefinition,
} from '@swirls/definition/deployment-definition'
import { swirlsHost } from '@swirls/language'

import { computeDeploymentDefinitionFingerprint } from './deployment-fingerprint'
import { lowerSwirlsSources } from './lower'

const COOKBOOK = join(import.meta.dir, '../../../cookbook')
const GOLDEN = join(import.meta.dir, '__golden__/cookbook')

type Golden =
  | {
      ok: true
      definition: Record<string, unknown>
      definitionFingerprint: string
      sourceFingerprint: string
    }
  | { ok: false; error: string }

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g

function withStableIds(value: unknown): unknown {
  const seen = new Map<string, string>()

  const json = JSON.stringify(value).replace(UUID, (id) => {
    const known = seen.get(id)

    if (known) {
      return known
    }

    const stable = `id-${seen.size + 1}`
    seen.set(id, stable)

    return stable
  })

  return JSON.parse(json)
}

function recipes(): string[] {
  const found: string[] = []

  for (const category of readdirSync(COOKBOOK, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue
    }

    for (const name of readdirSync(join(COOKBOOK, category.name))) {
      if (name.endsWith('.swirls') && !name.endsWith('.ts.swirls')) {
        found.push(`${category.name}/${name}`)
      }
    }
  }

  return found.sort()
}

function projectFor(recipe: string): Record<string, string> {
  const [category = '', name = ''] = recipe.split('/')

  const files: Record<string, string> = {
    [name]: readFileSync(join(COOKBOOK, recipe), 'utf8'),
  }

  for (const sibling of readdirSync(join(COOKBOOK, category))) {
    if (sibling.endsWith('.ts.swirls')) {
      files[sibling] = readFileSync(join(COOKBOOK, category, sibling), 'utf8')
    }
  }

  return files
}

function goldenFor(recipe: string): Golden {
  return JSON.parse(readFileSync(join(GOLDEN, recipe.replace(/\.swirls$/, '.json')), 'utf8'))
}

describe('cookbook golden output', () => {
  const all = recipes()

  test('every recipe has recorded output, and nothing else does', () => {
    const recorded = readdirSync(GOLDEN)
      .flatMap((category) =>
        readdirSync(join(GOLDEN, category)).map((name) => `${category}/${name}`),
      )
      .map((path) => path.replace(/\.json$/, '.swirls'))
      .sort()

    expect(recorded).toEqual(all)
  })

  for (const recipe of all) {
    test(recipe, () => {
      const golden = goldenFor(recipe)
      const result = lowerSwirlsSources(projectFor(recipe), { host: swirlsHost })
      const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

      if (!golden.ok) {
        expect(result.ok).toBe(false)
        expect(result.definition).toBeNull()
        expect(errors.some((error) => golden.error.includes(error.message))).toBe(true)

        return
      }

      expect(errors).toEqual([])
      expect(result.ok).toBe(true)
      expect(withStableIds(result.definition)).toEqual(golden.definition)
      expect(result.sourceFingerprint).toBe(golden.sourceFingerprint)

      // The reference fingerprinted the definition as built, before the schema
      // filled in defaults, so the same document is fingerprinted here.
      expect(parseDeploymentDefinition(result.definition).success).toBe(true)

      expect(
        computeDeploymentDefinitionFingerprint(result.definition as DeploymentDefinition),
      ).toBe(golden.definitionFingerprint)
    })
  }
})
