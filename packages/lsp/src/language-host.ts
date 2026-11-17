/**
 * The runtime the language server assumes when it validates, completes and
 * hovers: the hosted Swirls catalog that ships with `@swirls/language`.
 *
 * It has no integration provider catalog and no `@openui` checker, so the
 * editor does not flag unknown providers or check `@openui` bodies. A server
 * embedded in another runtime would build its own host here.
 */

import type { HarnessEntry, LanguageHost } from '@swirls/language'
import { swirlsHost } from '@swirls/language'

export const languageHost: LanguageHost = swirlsHost

export const harnessTypes: readonly HarnessEntry[] =
  languageHost.harnesses?.types ?? []

export const harnessProviders: readonly HarnessEntry[] =
  languageHost.harnesses?.providers ?? []

export function harnessProviderDetail(entry: HarnessEntry): string {
  const description = entry.description ?? `${entry.name} harness`
  return entry.package
    ? `${description} (package ${entry.package})`
    : description
}
