# @swirls/deploy

Lowers `.swirls` source files into a deployment definition: the JSON document a runtime stores and runs, described by `@swirls/definition`.

```ts
import { lowerSwirlsSources, swirlsHost } from '@swirls/deploy'

const result = lowerSwirlsSources(
  {
    'intake.swirls': source,
    'flows/normalize.swirls': other,
    'flows/lower-case.ts.swirls': code,
  },
  { host: swirlsHost },
)

if (!result.ok) {
  for (const d of result.diagnostics) {
    console.error(`${d.path ?? ''}:${d.range?.start.line ?? 0}: ${d.message}`)
  }
} else {
  store(result.definition, result.sourceFiles, result.skillFiles)
}
```

`lowerSwirlsSources` reads nothing from disk or from the environment. The files passed in are the whole project, keyed by posix path relative to the project root. A problem in the sources comes back as a diagnostic and is not thrown, so every problem in every file is reported at once.

## `lowerSwirlsSources(files, options?)`

| Argument        | Type                                              | Meaning                                                                                                                            |
| --------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `files`         | `Map<string, string>` or `Record<string, string>` | Path to text. Include `.swirls` files, the `.ts.swirls` files they reference, and `.agents/skills/<name>/` files of skills in use. |
| `options.host`  | `LanguageHost`                                    | The runtime's provider catalog, `@openui` checker and harness catalog. Without it those checks are skipped.                        |
| `options.newId` | `() => string`                                    | Makes the id of every resource and node. Defaults to a UUIDv7. Pass a counter for reproducible output.                             |

It returns a `LowerResult`:

| Field               | Meaning                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `ok`                | True when a definition was built. Warnings do not make it false.                                        |
| `definition`        | The definition as a JSON document, or `null`. It has passed `parseDeploymentDefinition`.                |
| `diagnostics`       | `{ severity, stage, message, path?, range? }` for every error and warning.                              |
| `sourceFiles`       | Each `.swirls` file with its size and SHA-256, sorted by path.                                          |
| `sourceFingerprint` | A stable hash of `sourceFiles`.                                                                         |
| `skillFiles`        | The files of each skill an agent uses, base64 encoded.                                                  |
| `ast`               | The merged syntax tree, or `null`. `buildDeploymentSourceManifest` takes it to map resources to source. |

A diagnostic's `stage` says which step reported it: `parse` and `validate` for one file, `merge` for combining files (a name declared twice), `lower` for building the definition, and `definition` for the built document failing its schema.

## The steps, for a host that reads a directory

`lowerSwirlsSources` is these steps over an in-memory file system. They are exported for a caller that wants to read a real directory or stop between them. The first two throw on a problem in the sources.

```ts
import fs from 'node:fs'
import {
  buildDeploymentDefinitionPayload,
  collectDeploymentSkillFiles,
  collectDeploymentSourceFiles,
  collectReferencedSkillBlocksFromAst,
  computeDeploymentSourceFingerprint,
  createNodeDeployBundleFs,
  mergeProjectSwirlsFiles,
} from '@swirls/deploy'

const files = createNodeDeployBundleFs(fs)
const merged = mergeProjectSwirlsFiles(files, dir, { host })
const { definition, parseError } = buildDeploymentDefinitionPayload(merged, { newId })
const sourceFiles = collectDeploymentSourceFiles(files, dir)
const skillFiles = collectDeploymentSkillFiles(
  files,
  dir,
  collectReferencedSkillBlocksFromAst(merged),
)
const name = computeDeploymentSourceFingerprint(sourceFiles).slice(0, 12)
```

Also exported: `createMemoryRepoFs` (a file system over a path-to-text map), `computeDeploymentDefinitionFingerprint` (a hash of a definition that ignores ids and ordering), `computeDefinitionHash`, `buildDeploymentSourceManifest`, `compileComputerRecipe`, `compileOperationBlock`, `resolveSkillTree` and `classifySkillBundle`.

## What is not here

Storing a deployment is the runtime's job. This package does not upload skill files or sources anywhere, and it does not build computer images: `compileComputerRecipe` only works out the recipe and its hash.

## Tests

`bun test` runs the unit tests and a golden test that lowers every recipe in the repository's [`cookbook`](../../cookbook) and compares the result with the output recorded under `src/__golden__/cookbook`.

## Build

`bun run build` writes `dist/index.js` and `dist/index.d.ts`. `@swirls/language` and `@swirls/definition` are compiled in, so the package depends only on `zod`, `ajv` and `pathe`. It imports `node:crypto` and `node:fs`, so it runs on Node 20 or later, Bun, and Workers with Node compatibility turned on.
