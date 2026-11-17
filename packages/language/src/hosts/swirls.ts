/**
 * The catalog of the hosted Swirls runtime, for callers that want its rules:
 * `validate(ast, { host: swirlsHost })`.
 *
 * It does not include the integration provider catalog or the `@openui`
 * checker. Those are large and change with the runtime, so the runtime
 * supplies them: `{ ...swirlsHost, providers, openui }`.
 */

import { SWIRLS_HARNESSES } from '../computer/harness'
import type { LanguageHost } from '../host'

export { SWIRLS_HARNESSES }

export const swirlsHost: LanguageHost = {
  harnesses: SWIRLS_HARNESSES,
}
