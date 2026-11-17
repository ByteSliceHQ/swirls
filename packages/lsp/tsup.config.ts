import { fileURLToPath } from 'node:url'

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  outDir: 'dist',
  noExternal: [/.*/],
  shims: true,
  minify: true,
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      '@prisma/config': fileURLToPath(
        new URL('./src/prisma-service/prisma-config-stub.ts', import.meta.url),
      ),
    }
  },
})
