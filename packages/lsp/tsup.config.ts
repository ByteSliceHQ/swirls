import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  outDir: 'dist',
  noExternal: [/.*/],
  shims: true,
})
