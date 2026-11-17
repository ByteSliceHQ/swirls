/**
 * Duration literals for the .swirls DSL.
 *
 * The lexer has no duration token: `30m` lexes as the number `30` followed by
 * the identifier `m`, so a bare duration would desync every numeric position in
 * the grammar. Durations are therefore written as quoted literals (`"30m"`),
 * following the precedent set by `cron: "0 9 * * *"`, where a domain grammar
 * that the lexer does not model rides inside a string. They are normalized to
 * whole seconds before reaching a deployment definition so nothing downstream
 * has to re-parse the surface syntax.
 */

/** Units a duration literal accepts, mapped to their length in seconds. */
export const DURATION_UNIT_SECONDS = {
  s: 1,
  m: 60,
  h: 3600,
} as const

export type DurationUnit = keyof typeof DURATION_UNIT_SECONDS

/** `12h`, `30m`, `15s`: a whole number of units, no sign and no fraction. */
const DURATION_PATTERN = /^([0-9]+)(s|m|h)$/

/** Human-facing description of the grammar, reused verbatim in diagnostics. */
export const DURATION_SYNTAX_HINT =
  'a quoted duration like "30m" (whole number followed by s, m, or h)'

function isDurationUnit(value: string): value is DurationUnit {
  return Object.hasOwn(DURATION_UNIT_SECONDS, value)
}

/**
 * Parse a duration literal into whole seconds, or `null` when the literal does
 * not match the grammar. Callers turn `null` into a diagnostic; nothing in the
 * language guesses at a unit for a bare number.
 */
export function parseDurationSeconds(literal: string): number | null {
  const match = DURATION_PATTERN.exec(literal.trim())
  const amountText = match?.[1]
  const unit = match?.[2]

  if (amountText === undefined || unit === undefined || !isDurationUnit(unit)) {
    return null
  }

  const amount = Number(amountText)
  if (!Number.isSafeInteger(amount)) {
    return null
  }

  const seconds = amount * DURATION_UNIT_SECONDS[unit]
  return Number.isSafeInteger(seconds) ? seconds : null
}
