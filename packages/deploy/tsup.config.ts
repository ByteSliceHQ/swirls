import { defineConfig } from 'tsup'

/**
 * `@swirls/language` and `@swirls/definition` are compiled in, types included,
 * so the published package stands on its own. Their own dependencies (zod, ajv,
 * pathe) stay external and are this package's dependencies.
 *
 * The declaration build cannot follow a workspace package's `exports`, so the
 * two packages are pointed at their source with `paths`.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  removeNodeProtocol: false,
  clean: true,
  outDir: 'dist',
  noExternal: [/^@swirls\//],
  dts: {
    resolve: [/^@swirls\//],
    compilerOptions: {
      paths: {
        '@swirls/definition': ['../definition/src/deployment-definition.ts'],
        '@swirls/definition/*': ['../definition/src/*'],
        '@swirls/language': ['../language/src/index.ts'],
        '@swirls/language/workspace': ['../language/src/workspace/index.ts'],
        '@swirls/language/*': ['../language/src/*'],
      },
    },
  },
})
