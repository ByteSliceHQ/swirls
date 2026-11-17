# Contributing — Swirls VS Code extension

This document is for **developers working in the monorepo** who change `@swirls/lsp`, `editors/vscode`, or related packages and want to **run and debug the extension locally**.

## Development

### Reproduce LSP and extension changes locally

You need the editor to load **this folder** as the extension (`editors/vscode`), not the copy from the Marketplace. Use the **Extension Development Host** and your freshly built `server/server.js`.

1. **Open the monorepo root** (`swirls`) in VS Code or Cursor.

2. **Disable the published Swirls extension** in this profile (Extensions panel → Swirls → Disable).  
   If you leave it enabled, you can get **two** language servers or mixed behavior.  
   Note: with every Swirls extension disabled, `.swirls` files in a normal window have **no** syntax highlighting until you use the dev host (step 4).

3. **Build the LSP** and **copy the bundled server** into this package.

   From the **repo root** (one command):

   ```bash
   bun run sync:lsp-vscode
   ```

   Or manually:

   ```bash
   bun run build --filter @swirls/lsp
   cd editors/vscode && bun run build:server
   ```

   Both end up with `packages/lsp/dist/server.js` and `prisma_schema_build_bg.wasm` copied into `editors/vscode/server/`, and **`node_modules/typescript/lib`** copied to **`editors/vscode/server/typescript-lib`**. The packaged extension has no `node_modules`; the LSP loads those `.d.ts` files from `typescript-lib` next to `server.js`, and requires the wasm sibling at startup. If you skip the LSP build, the copy step fails because `dist/server.js` is missing.

   The `build:server` script copies from **`../../packages/lsp/dist/server.js`** (relative to `editors/vscode`) so it always tracks the **built output in the repo**, not whatever happens to be under `node_modules`.

4. **Launch the local extension:** Run and Debug (`Cmd+Shift+D` / `Ctrl+Shift+D`) → select **Launch Swirls Extension** → **F5** (or Start).  
   The config lives at [`.vscode/launch.json`](../../.vscode/launch.json) in the repo; it sets `--extensionDevelopmentPath` to `editors/vscode`.

5. A new window opens titled **[Extension Development Host]**. **Open your `.swirls` files there** (e.g. `apps/web/swirls/feedback.swirls`). That window uses your local grammars and `server/server.js`.

6. **After you change the LSP and copy the server again**, reload the server process: in the **Extension Development Host** window, Command Palette → **Developer: Reload Window**, or stop the debug session (red square) and press **F5** again from the main window.

If you change **extension host code** (`src/extension.ts`, etc.), run `bun run build` or `bun run build:client` from `editors/vscode` (or full `bun run build`) before testing, then reload the Extension Development Host the same way.

### Release process

Repo-wide release steps (versioning, tags, CI) are documented in [RELEASING.md](../../RELEASING.md) at the monorepo root.
