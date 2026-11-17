/**
 * Build-time stand-in for `@prisma/config`.
 *
 * `@prisma/language-server` imports it only for `PrismaSchema.load()`, which
 * reads a project's Prisma config from disk. This server only ever calls
 * `PrismaSchema.singleFile()` on the text of a `@prisma { }` block, so the
 * real package (and the 4 MB of `effect`, `c12`, `jiti`, `giget` and
 * `chokidar` it pulls in) would be dead weight in the bundle.
 */
export default {}
