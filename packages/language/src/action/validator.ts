import type { Diagnostic, SwirlsFile } from '../ast'
import { isProviderKey, type LanguageHost } from '../host'
import { ACTION_ENCODINGS, ACTION_HTTP_METHODS, type ActionDecl } from './ast'

function diag(
  message: string,
  range: ActionDecl['range'],
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { message, range, severity }
}

const methodSet: ReadonlySet<string> = new Set(ACTION_HTTP_METHODS)
const encodingSet: ReadonlySet<string> = new Set(ACTION_ENCODINGS)

/**
 * Validates top-level `action` blocks: required fields, provider/method/encoding
 * enums, and unique names.
 */
export function validateActionBlocks(
  ast: SwirlsFile,
  opts?: { host?: LanguageHost },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const catalog = opts?.host?.providers
  const actions = ast.actions ?? []

  const duplicateNames = new Set<string>()
  const nameCounts = new Map<string, number>()
  for (const a of actions) {
    nameCounts.set(a.name, (nameCounts.get(a.name) ?? 0) + 1)
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      duplicateNames.add(name)
    }
  }
  for (const name of duplicateNames) {
    const first = actions.find((a) => a.name === name)
    if (first) {
      out.push(diag(`Duplicate action block name "${name}"`, first.range))
    }
  }

  for (const a of actions) {
    if (!a.provider) {
      out.push(diag(`Action "${a.name}" requires a provider`, a.range))
    } else if (!isProviderKey(a.provider)) {
      out.push(
        diag(
          `Action "${a.name}" provider "${a.provider}" must be a valid integration provider key (letters, digits, underscore, hyphen)`,
          a.providerRange ?? a.range,
        ),
      )
    } else if (catalog && !catalog.has(a.provider)) {
      out.push(
        diag(
          `Action "${a.name}" uses provider "${a.provider}" which is not in the integration catalog. Deploy will fail until this provider is supported.`,
          a.providerRange ?? a.range,
          'warning',
        ),
      )
    }

    if (!a.method) {
      out.push(diag(`Action "${a.name}" requires method`, a.range))
    } else if (!methodSet.has(a.method.toUpperCase())) {
      out.push(
        diag(
          `Action "${a.name}" method "${a.method}" must be one of: ${ACTION_HTTP_METHODS.join(', ')}`,
          a.methodRange ?? a.range,
        ),
      )
    }

    if (!a.path) {
      out.push(diag(`Action "${a.name}" requires path`, a.range))
    }

    if (a.graphqlDocument !== undefined && a.graphqlDocument !== '') {
      if (a.method.toUpperCase() !== 'POST') {
        out.push(
          diag(
            `Action "${a.name}" with document requires method POST`,
            a.methodRange ?? a.range,
          ),
        )
      }
      if (
        a.input !== undefined ||
        a.inputRef !== undefined ||
        a.output !== undefined ||
        a.outputRef !== undefined
      ) {
        out.push(
          diag(
            `Action "${a.name}" with document must not declare input or output (use the sibling GraphQL schema instead)`,
            a.graphqlDocumentRange ?? a.range,
          ),
        )
      }
    }

    if (a.encoding !== undefined && a.encoding !== '') {
      if (!encodingSet.has(a.encoding)) {
        out.push(
          diag(
            `Action "${a.name}" encoding "${a.encoding}" must be one of: ${ACTION_ENCODINGS.join(', ')}`,
            a.encodingRange ?? a.range,
          ),
        )
      }
    }
  }

  return out
}
