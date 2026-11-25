import { createHash } from 'node:crypto'

import type { DeploymentDefinition } from '@swirls/definition/deployment-definition'

import { canonicalizeForStableJson } from './canonical-json'

/**
 * Semantic fingerprint of a validated deployment definition: ignores all UUIDs
 * and resolves edge/trigger references to stable names so two builds of the same
 * project produce the same hash even when `buildDeploymentDefinitionPayload` assigns
 * new ids.
 */
export function computeDeploymentDefinitionFingerprint(def: DeploymentDefinition): string {
  const normalized = normalizeDeploymentDefinition(def)
  const json = JSON.stringify(canonicalizeForStableJson(normalized))
  return createHash('sha256').update(json, 'utf8').digest('hex')
}

function normalizeDeploymentDefinition(def: DeploymentDefinition): unknown {
  const schemas = [...(def.schemas ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      name: s.name,
      label: s.label,
      description: s.description,
      schema: s.schema,
    }))

  const forms = [...(def.forms ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({
      name: f.name,
      label: f.label,
      description: f.description,
      schema: f.schema,
      enabled: f.enabled,
    }))

  const webhooks = [...(def.webhooks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((w) => ({
      name: w.name,
      label: w.label,
      description: w.description,
      schema: w.schema,
      enabled: w.enabled,
    }))

  const schedules = [...(def.schedules ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      name: s.name,
      label: s.label,
      description: s.description,
      cron: s.cron,
      timezone: s.timezone,
      enabled: s.enabled,
    }))

  const formById = new Map((def.forms ?? []).map((f) => [f.id, f.name]))
  const webhookById = new Map((def.webhooks ?? []).map((w) => [w.id, w.name]))
  const scheduleById = new Map((def.schedules ?? []).map((s) => [s.id, s.name]))
  const workflowById = new Map((def.workflows ?? []).map((g) => [g.id, g.name]))

  const workflows = [...(def.workflows ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const idToName = new Map(g.nodes.map((n) => [n.id, n.name]))

      const nodes = [...g.nodes]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => ({
          name: n.name,
          type: n.type,
          label: n.label,
          description: n.description,
          isRoot: n.isRoot,
          config: n.config,
          configValueKinds: n.configValueKinds,
          reviewConfig: n.reviewConfig,
          inputSchema: n.inputSchema,
          outputSchema: n.outputSchema,
          secretsMap: n.secretsMap,
          authRef: n.authRef,
          connectionRef: n.connectionRef,
          actionRef: n.actionRef,
          outputFormat: n.outputFormat,
          position: n.position,
        }))

      const edges = [...g.edges]
        .map((e) => {
          const source = idToName.get(e.sourceNodeId)
          const target = idToName.get(e.targetNodeId)
          return {
            source: source ?? e.sourceNodeId,
            target: target ?? e.targetNodeId,
            label: e.label,
          }
        })
        .sort((a, b) => {
          const s = a.source.localeCompare(b.source)

          if (s !== 0) {
            return s
          }

          const t = a.target.localeCompare(b.target)

          if (t !== 0) {
            return t
          }

          return (a.label ?? '').localeCompare(b.label ?? '')
        })

      return {
        name: g.name,
        label: g.label,
        description: g.description,
        nodes,
        edges,
      }
    })

  const triggers = [...(def.triggers ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const workflowName = workflowById.get(t.workflowId)
      let resourceName: string | undefined

      switch (t.resourceType) {
        case 'form':
          resourceName = formById.get(t.resourceId)
          break
        case 'webhook':
          resourceName = webhookById.get(t.resourceId)
          break
        case 'schedule':
          resourceName = scheduleById.get(t.resourceId)
          break
        default:
          resourceName = undefined
      }

      return {
        name: t.name,
        resourceType: t.resourceType,
        resourceName: resourceName ?? t.resourceId,
        workflowName: workflowName ?? t.workflowId,
        enabled: t.enabled,
      }
    })

  const secretBlocks = [...(def.secretBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      name: s.name,
      label: s.label,
      description: s.description,
      vars: s.vars,
    }))

  const authBlocks = [...(def.authBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({
      name: a.name,
      label: a.label,
      description: a.description,
      authType: a.authType,
      secretBlockName: a.secretBlockName,
      config: a.config,
    }))

  const postgresBlocks = [...(def.postgresBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      name: p.name,
      secretsRef: p.secretsRef,
      connection: p.connection,
      connectionIsLiteral: p.connectionIsLiteral,
      networkRef: p.networkRef,
      tables: p.tables,
    }))

  const databaseBlocks = [...(def.databaseBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({
      name: d.name,
      label: d.label,
      description: d.description,
      schema: d.schema,
      schemaChecksum: d.schemaChecksum,
      connections: [...(d.connections ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          name: c.name,
          label: c.label,
          description: c.description,
        })),
    }))

  const databaseMigrations = [...(def.databaseMigrations ?? [])]
    .sort((a, b) => {
      const byDatabase = a.database.localeCompare(b.database)

      if (byDatabase !== 0) {
        return byDatabase
      }

      return a.order - b.order
    })
    .map((m) => ({
      name: m.name,
      database: m.database,
      order: m.order,
      operationCode: m.operationCode,
    }))

  const diskBlocks = [...(def.diskBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({
      name: a.name,
      label: a.label,
      region: a.region,
    }))

  // Computers are not otherwise part of the fingerprint: their authored
  // recipe is covered by the source fingerprint. A harness runtime is chosen
  // by the platform, not the source, so it is fingerprinted here, and only
  // when some computer has a harness, so every other definition keeps the
  // fingerprint it had before harnesses existed.
  const computerHarnesses = [...(def.computerBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((computer) =>
      computer.harness
        ? [
            {
              name: computer.name,
              type: computer.harness.type,
              provider: computer.harness.provider,
              runtime: computer.harness.runtime,
            },
          ]
        : [],
    )

  const streams = [...(def.streams ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      name: s.name,
      label: s.label,
      description: s.description,
      enabled: s.enabled,
      workflowName: s.workflowName,
      version: s.version,
      versions: s.versions,
    }))

  const views = [...(def.views ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => ({
      name: v.name,
      label: v.label,
      description: v.description,
      enabled: v.enabled,
      streams: v.streams,
      schema: v.schema,
      columnsCode: v.columnsCode,
      computed: [...(v.computed ?? [])].sort((x, y) => x.name.localeCompare(y.name)),
    }))

  const apps = [...(def.apps ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({
      name: a.name,
      label: a.label,
      description: a.description,
      icon: a.icon,
      brand: a.brand,
      shell: a.shell,
      nav: a.nav,
      pages: a.pages,
      audience: a.audience,
      landing: a.landing,
    }))

  const agentBlocks = [...(def.agentBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({
      name: a.name,
      label: a.label,
      description: a.description,
      provider: a.provider,
      model: a.model,
      secretsRef: a.secretsRef,
      secretVars: a.secretVars,
      defaultSystemCode: a.defaultSystemCode,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
      maxSteps: a.maxSteps,
      tools: a.tools,
      team: a.team,
      computer: a.computer,
      disks: a.disks,
      sandbox: a.sandbox,
      wallet: a.wallet,
      context: a.context,
      roles: [...(a.roles ?? [])]
        .sort((x, y) => x.name.localeCompare(y.name))
        .map((r) => ({
          name: r.name,
          description: r.description,
          systemCode: r.systemCode,
          tools: r.tools,
        })),
    }))

  const queryBlocks = [...(def.queryBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((q) => ({
      name: q.name,
      label: q.label,
      description: q.description,
      enabled: q.enabled,
      database: q.database,
      sql: q.sql,
      params: q.params,
    }))

  const channelBlocks = [...(def.channelBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      label: c.label,
      description: c.description,
      platform: c.platform,
      agent: c.agent,
      workflows: c.workflows ? [...c.workflows].sort() : undefined,
      enabled: c.enabled,
      connectionRef: c.connectionRef,
      connectorRef: c.connectorRef,
      mode: c.mode,
      engagementTimeoutSeconds: c.engagementTimeoutSeconds,
      cooldownSeconds: c.cooldownSeconds,
      maxUnpromptedPerHour: c.maxUnpromptedPerHour,
    }))

  const connectionBlocks = [...(def.connectionBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      label: c.label,
      description: c.description,
      provider: c.provider,
      baseUrl: c.baseUrl,
      authRef: c.authRef,
      networkRef: c.networkRef,
    }))

  const mcpBlocks = [...(def.mcpBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({
      name: m.name,
      label: m.label,
      description: m.description,
      url: m.url,
      auth: m.auth,
      networkRef: m.networkRef,
    }))

  const networkBlocks = [...(def.networkBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((network) => ({
      name: network.name,
      label: network.label,
      description: network.description,
      expose: {
        apps: [...network.expose.apps].sort(),
        channels: [...network.expose.channels].sort(),
        forms: [...network.expose.forms].sort(),
        webhooks: [...network.expose.webhooks].sort(),
        services: [...network.expose.services].sort(),
        databases: [...network.expose.databases]
          .sort((a, b) => a.database.localeCompare(b.database))
          .map((database) => ({
            database: database.database,
            connections: [...database.connections].sort(),
          })),
      },
    }))

  const connectorBlocks = [...(def.connectorBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      label: c.label,
      description: c.description,
    }))

  const actionBlocks = [...(def.actionBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({
      name: a.name,
      label: a.label,
      description: a.description,
      provider: a.provider,
      method: a.method,
      path: a.path,
      encoding: a.encoding,
      scopes: a.scopes,
      inputSchema: a.inputSchema,
      outputSchema: a.outputSchema,
    }))

  const roles = [...(def.roles ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({
      name: r.name,
      description: r.description,
      match: r.match,
    }))

  const policies = [...(def.policies ?? [])].map((p) => ({
    grants: p.grants,
    ...(p.files ? { files: p.files } : {}),
  }))

  const out: Record<string, unknown> = {}

  if (def.version !== undefined) {
    out.version = def.version
  }

  out.forms = forms
  out.webhooks = webhooks
  out.schedules = schedules
  out.schemas = schemas
  out.workflows = workflows
  out.triggers = triggers
  out.secretBlocks = secretBlocks
  out.authBlocks = authBlocks
  out.postgresBlocks = postgresBlocks
  out.databaseBlocks = databaseBlocks
  out.databaseMigrations = databaseMigrations
  out.diskBlocks = diskBlocks
  out.streams = streams
  out.views = views
  out.apps = apps
  out.agentBlocks = agentBlocks

  out.decisionBlocks = [...(def.decisionBlocks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id: _id, ...definition }) => definition)

  out.queryBlocks = queryBlocks
  out.channelBlocks = channelBlocks
  out.connectionBlocks = connectionBlocks
  out.mcpBlocks = mcpBlocks
  out.networkBlocks = networkBlocks
  out.connectorBlocks = connectorBlocks
  out.actionBlocks = actionBlocks
  out.roles = roles
  out.policies = policies
  return computerHarnesses.length > 0 ? { ...out, computerHarnesses } : out
}
