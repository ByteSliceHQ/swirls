/**
 * Copies @prisma/prisma-schema-wasm's wasm binary into dist/.
 *
 * The bundled server (dist/server.js) inlines @prisma/prisma-schema-wasm's JS,
 * which at module load does readFileSync(`${__dirname}/prisma_schema_build_bg.wasm`),
 * so the .wasm file must sit next to the bundled server.js at runtime.
 *
 * @prisma/prisma-schema-wasm is a transitive dependency of
 * @prisma/language-server and is not hoisted to a stable node_modules path
 * (bun keeps it in the hashed .bun store), so we resolve it through
 * @prisma/language-server's own require context.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireFromHere = createRequire(import.meta.url)
const languageServerPkg = requireFromHere.resolve(
  '@prisma/language-server/package.json',
)
const requireFromLanguageServer = createRequire(languageServerPkg)
const wasmPkg = requireFromLanguageServer.resolve(
  '@prisma/prisma-schema-wasm/package.json',
)
const wasmSource = join(dirname(wasmPkg), 'src', 'prisma_schema_build_bg.wasm')

const distDir = join(
  dirname(dirname(new URL(import.meta.url).pathname)),
  'dist',
)
const wasmDest = join(distDir, 'prisma_schema_build_bg.wasm')

mkdirSync(distDir, { recursive: true })
copyFileSync(wasmSource, wasmDest)
console.log(`Copied ${wasmSource} -> ${wasmDest}`)
