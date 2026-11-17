import * as path from 'node:path'

import type * as vscode from 'vscode'
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/lib/node/main'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const serverModule = path.join(context.extensionPath, 'server', 'server.js')

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=9229'] },
    },
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'swirls' },
      { scheme: 'file', language: 'swirls-ts' },
    ],
  }

  client = new LanguageClient('swirls', 'Swirls', serverOptions, clientOptions)
  await client.start()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
