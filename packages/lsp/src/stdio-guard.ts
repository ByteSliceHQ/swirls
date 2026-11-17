/**
 * The server runs over stdio, so stdout carries JSON-RPC frames. Any stray
 * console output on stdout corrupts the stream and the client tears the
 * connection down ("Header must provide a Content-Length property").
 *
 * Dependencies we bundle do log to stdout — @prisma/language-server's lint()
 * unconditionally console.log's "running lint() from prisma-schema-wasm"
 * (harmless in upstream's IPC transport, fatal over stdio). Reroute every
 * stdout-writing console method to stderr, which the client surfaces in the
 * output channel without touching the protocol.
 *
 * This module must be imported before anything else in the server entry.
 */
console.log = console.error.bind(console)
console.info = console.error.bind(console)
console.debug = console.error.bind(console)
