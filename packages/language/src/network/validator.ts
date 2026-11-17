import { resourceNameSchema } from '@swirls/definition/schemas'

import type { Diagnostic, SourceRange, SwirlsFile } from '../ast'
import type { ChannelDecl } from '../channel/ast'
import type { DatabaseDecl } from '../database/ast'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { NetworkDatabaseExposureDecl, NetworkDecl, NetworkNamedExposureRef } from './ast'

function diag(message: string, range: SourceRange): Diagnostic {
  return { message, range, severity: 'error' }
}

function validateName(name: string, range: SourceRange): Diagnostic[] {
  const parsed = resourceNameSchema.safeParse(name)

  if (parsed.success) {
    return []
  }

  return [diag(`Network name: ${parsed.error.issues[0]?.message ?? 'Invalid name'}`, range)]
}

function validateNamedRefs(args: {
  network: NetworkDecl
  kind: string
  refs: NetworkNamedExposureRef[]
  available: Set<string>
}): Diagnostic[] {
  const out: Diagnostic[] = []
  const seen = new Set<string>()

  for (const ref of args.refs) {
    if (seen.has(ref.name)) {
      out.push(
        diag(
          `Network "${args.network.name}" exposes duplicate ${args.kind} "${ref.name}"`,
          ref.range,
        ),
      )
    }

    seen.add(ref.name)

    if (!args.available.has(ref.name)) {
      out.push(
        diag(
          `Network "${args.network.name}" references undefined ${args.kind} "${ref.name}"`,
          ref.range,
        ),
      )
    }
  }

  return out
}

function databaseBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, DatabaseDecl> {
  const result = new Map<string, DatabaseDecl>()

  for (const database of ast.databases ?? []) {
    result.set(database.name, database)
  }

  for (const [name, database] of workspace?.databaseBlocks ?? []) {
    result.set(name, database)
  }

  return result
}

function channelBlockMap(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, ChannelDecl> {
  const result = new Map<string, ChannelDecl>()

  for (const channel of ast.channels ?? []) {
    result.set(channel.name, channel)
  }

  for (const [name, channel] of workspace?.channelBlocks ?? []) {
    result.set(name, channel)
  }

  return result
}

function validateDatabaseExposures(
  network: NetworkDecl,
  refs: NetworkDatabaseExposureDecl[],
  databases: Map<string, DatabaseDecl>,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const seenDatabases = new Set<string>()

  for (const ref of refs) {
    if (seenDatabases.has(ref.database)) {
      out.push(
        diag(
          `Network "${network.name}" has duplicate database exposure "${ref.database}"; combine its connections into one entry`,
          ref.databaseRange ?? ref.range,
        ),
      )
    }

    seenDatabases.add(ref.database)

    const database = databases.get(ref.database)

    if (!database) {
      out.push(
        diag(
          `Network "${network.name}" references undefined database "${ref.database}"`,
          ref.databaseRange ?? ref.range,
        ),
      )

      continue
    }

    if (ref.connections.length === 0) {
      out.push(
        diag(
          `Network "${network.name}" database "${ref.database}" must expose at least one named connection`,
          ref.range,
        ),
      )

      continue
    }

    const availableConnections = new Set(database.connections.map((connection) => connection.name))
    const seenConnections = new Set<string>()

    for (const connection of ref.connections) {
      if (seenConnections.has(connection.name)) {
        out.push(
          diag(
            `Network "${network.name}" exposes duplicate database connection "${ref.database}.${connection.name}"`,
            connection.range,
          ),
        )
      }

      seenConnections.add(connection.name)

      if (!availableConnections.has(connection.name)) {
        out.push(
          diag(
            `Network "${network.name}" references undefined database connection "${ref.database}.${connection.name}"`,
            connection.range,
          ),
        )
      }
    }
  }

  return out
}

export function validateNetworkBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const workspace = options?.workspace
  const networks = ast.networks ?? []
  const apps = nameLookup(new Set((ast.apps ?? []).map((app) => app.name)), workspace?.apps)
  const forms = nameLookup(new Set((ast.forms ?? []).map((form) => form.name)), workspace?.forms)

  const webhooks = nameLookup(
    new Set((ast.webhooks ?? []).map((webhook) => webhook.name)),
    workspace?.webhooks,
  )

  const channels = channelBlockMap(ast, workspace)
  const databases = databaseBlockMap(ast, workspace)
  const networkNameCounts = new Map<string, number>()

  for (const network of networks) {
    networkNameCounts.set(network.name, (networkNameCounts.get(network.name) ?? 0) + 1)
  }

  for (const network of networks) {
    out.push(...validateName(network.name, network.range))

    if ((networkNameCounts.get(network.name) ?? 0) > 1) {
      out.push(diag(`Duplicate network name "${network.name}"`, network.range))
    }

    const expose = network.expose

    if (!expose) {
      continue
    }

    out.push(
      ...validateNamedRefs({
        network,
        kind: 'app',
        refs: expose.apps,
        available: apps,
      }),
      ...validateNamedRefs({
        network,
        kind: 'form',
        refs: expose.forms,
        available: forms,
      }),
      ...validateNamedRefs({
        network,
        kind: 'webhook',
        refs: expose.webhooks,
        available: webhooks,
      }),
    )

    const channelNames = new Set(channels.keys())

    out.push(
      ...validateNamedRefs({
        network,
        kind: 'channel',
        refs: expose.channels,
        available: channelNames,
      }),
    )

    for (const ref of expose.channels) {
      const channel = channels.get(ref.name)

      if (
        channel &&
        channel.platform !== 'mcp' &&
        channel.platform !== 'web' &&
        channel.platform !== 'swirls'
      ) {
        out.push(
          diag(
            `Network "${network.name}" cannot expose channel "${ref.name}" with platform "${channel.platform}"; only mcp, web, and swirls channels have a Swirls-hosted network interface`,
            ref.range,
          ),
        )
      }
    }

    for (const service of expose.services) {
      out.push(
        diag(
          `Network "${network.name}" cannot expose service "${service.name}" until the service primitive is available`,
          service.range,
        ),
      )
    }

    out.push(...validateDatabaseExposures(network, expose.databases, databases))
  }

  return out
}

export function validateNetworkConsumerReference(args: {
  owner: string
  network?: string
  range?: SourceRange
  ast: SwirlsFile
  workspace?: WorkspaceResourceIndex
}): Diagnostic[] {
  if (!args.network) {
    return []
  }

  const available = nameLookup(
    new Set((args.ast.networks ?? []).map((network) => network.name)),
    args.workspace?.networks,
  )

  if (available.has(args.network)) {
    return []
  }

  return [
    diag(
      `${args.owner} references undefined network "${args.network}"`,
      args.range ??
        args.ast.networks?.[0]?.range ?? {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
    ),
  ]
}
