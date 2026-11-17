import { connectionModePairError } from '@swirls/definition/connection-mode'
import type { Diagnostic, SwirlsFile } from '../ast'
import { isProviderKey, type LanguageHost } from '../host'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { isSelfManagedConnection } from './ast'

function diag(
  message: string,
  range: SwirlsFile['connections'][number]['range'],
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { message, range, severity }
}

function authNameLookup(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Set<string> {
  const names = new Set((ast.auths ?? []).map((a) => a.name))
  for (const name of workspace?.auths.keys() ?? []) {
    names.add(name)
  }
  return names
}

/**
 * Validates `connection` blocks: a supported provider is required, and names
 * must be unique. Self-managed connections (`base_url` + `auth`) skip the
 * catalog warning and must resolve their auth ref. Reference resolution
 * (nodes/channels/agents pointing at a connection) is handled by the main
 * validator, which holds the full name set.
 */
export function validateConnectionBlocks(
  ast: SwirlsFile,
  opts?: { workspace?: WorkspaceResourceIndex; host?: LanguageHost },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const catalog = opts?.host?.providers
  const connections = ast.connections ?? []
  const auths = authNameLookup(ast, opts?.workspace)

  for (const c of connections) {
    const sameName = connections.filter((x) => x.name === c.name)
    if (sameName.length > 1) {
      out.push(diag(`Duplicate connection block name "${c.name}"`, c.range))
    }

    if (!c.provider) {
      out.push(diag(`Connection "${c.name}" requires a provider`, c.range))
      continue
    }

    if (!isProviderKey(c.provider)) {
      out.push(
        diag(
          `Connection "${c.name}" provider "${c.provider}" must be a valid integration provider key (letters, digits, underscore, hyphen)`,
          c.providerRange ?? c.range,
        ),
      )
      continue
    }

    const pairError = connectionModePairError(c.name, c.baseUrl, c.authRef)
    if (pairError) {
      out.push(diag(pairError, c.baseUrlRange ?? c.authRefRange ?? c.range))
    }

    if (isSelfManagedConnection(c)) {
      if (c.authRef && !auths.has(c.authRef)) {
        out.push(
          diag(
            `Connection "${c.name}" references undefined auth block "${c.authRef}"`,
            c.authRefRange ?? c.range,
          ),
        )
      }
      if (c.baseUrl) {
        try {
          const parsed = new URL(c.baseUrl)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            out.push(
              diag(
                `Connection "${c.name}" base_url must be an http(s) URL`,
                c.baseUrlRange ?? c.range,
              ),
            )
          }
        } catch {
          out.push(
            diag(
              `Connection "${c.name}" base_url must be a valid absolute URL`,
              c.baseUrlRange ?? c.range,
            ),
          )
        }
      }
      continue
    }

    if (catalog && !catalog.has(c.provider)) {
      out.push(
        diag(
          `Connection "${c.name}" uses provider "${c.provider}" which is not in the integration catalog. Deploy will fail until this provider is supported, or add base_url and auth for self-managed credentials.`,
          c.providerRange ?? c.range,
          'warning',
        ),
      )
    }
  }

  return out
}
