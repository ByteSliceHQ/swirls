# Contributing to the Swirls VS Code extension

How to run the extension from this repository, so changes to `packages/lsp` or `editors/vscode` can be tried in an editor.

## Run it locally

1. Open the repository root in VS Code or Cursor.

2. Disable the published Swirls extension in this profile (Extensions panel, Swirls, Disable). With both enabled you get two language servers.

3. Build the language server and the extension from the repository root:

   ```bash
   bun install
   ```

   ```bash
   bun run build
   ```

   This bundles `packages/lsp` into `packages/lsp/dist/server.js`, then copies it into `editors/vscode/server/` with `prisma_schema_build_bg.wasm` and the TypeScript `lib*.d.ts` files (`server/typescript-lib/`). A packaged extension has no `node_modules`, so the server reads the standard library typings from that folder.

4. Run and Debug, select **Launch Swirls Extension**, press F5. The configuration is in [`.vscode/launch.json`](../../.vscode/launch.json).

5. A window titled **[Extension Development Host]** opens. Open `.swirls` files there, for example anything under `packages/language/examples/`.

6. After changing the language server, run `bun run build` again and reload the host window (Command Palette, **Developer: Reload Window**).

## Release

Releases go through Changesets and the `release` workflow. See [RELEASE.md](../../RELEASE.md).
