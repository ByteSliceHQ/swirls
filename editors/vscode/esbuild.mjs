import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outFile = join(__dirname, 'out', 'extension.js')

mkdirSync(dirname(outFile), { recursive: true })

await esbuild.build({
  entryPoints: [join(__dirname, 'src', 'extension.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: outFile,
  external: ['vscode'],
  sourcemap: false,
})
