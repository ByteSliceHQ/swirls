/**
 * Parsing for `computer` top-level blocks. Called from the main parser via delegation.
 */

import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  ComputerDecl,
  ComputerHarnessDecl,
  ComputerResourcesDecl,
  ComputerSoftwarePin,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

/**
 * A software key is a bare name (`gh`) or a quoted one (`"claude-code"`).
 * Flox package names can contain `-`, which a bare identifier cannot.
 */
function parseSoftwarePackageName(d: ResourceParserDelegate): string | null {
  const t = d.peek()
  if (t?.kind === 'string' && typeof t.value === 'string') {
    d.advance()
    return t.value
  }
  return d.parsePropertyKey()
}

function parseSoftwarePins(
  d: ResourceParserDelegate,
): ComputerSoftwarePin[] | null {
  if (!d.expect('lbrace')) {
    d.error('software: expected {', d.peek())
    return null
  }

  const pins: ComputerSoftwarePin[] = []

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment' || t.kind === 'comma') {
      d.advance()
      continue
    }

    const keyTok = t
    const key = parseSoftwarePackageName(d)
    if (!key) {
      break
    }
    if (!d.expect('colon')) {
      d.error('Expected : after software package name', d.peek())
      break
    }

    const valTok = d.peek()
    if (valTok?.kind === 'string') {
      d.advance()
      pins.push({
        packageName: key,
        pin: valTok.value as string,
        range: valTok.range,
      })
      continue
    }

    d.error(
      `software pin for "${key}" must be a non-empty quoted string`,
      valTok ?? keyTok,
    )
    if (valTok) {
      d.parseValue()
    }
  }

  d.expect('rbrace')
  return pins
}

function parseResources(
  d: ResourceParserDelegate,
  valueStart: Token,
): ComputerResourcesDecl | null {
  if (!d.expect('lbrace')) {
    d.error('resources: expected {', d.peek())
    return null
  }

  let cpus: number | undefined
  let cpusRange: SourceRange | undefined
  let memoryMiB: number | undefined
  let memoryMiBRange: SourceRange | undefined
  let diskGiB: number | undefined
  let diskGiBRange: SourceRange | undefined

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment' || t.kind === 'comma') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()
    if (!key) {
      break
    }
    if (!d.expect('colon')) {
      d.error('Expected : after resources key', d.peek())
      break
    }

    const valTok = d.peek()
    const val = d.parseValue()
    if (key !== 'cpus' && key !== 'memoryMiB' && key !== 'diskGiB') {
      d.error(`Unknown computer resources property "${key}"`, t)
      continue
    }
    if (typeof val !== 'number') {
      d.error(`resources.${key} must be a number`, valTok)
      continue
    }
    const range = valTok?.range
    if (key === 'cpus') {
      cpus = val
      cpusRange = range
    } else if (key === 'memoryMiB') {
      memoryMiB = val
      memoryMiBRange = range
    } else {
      diskGiB = val
      diskGiBRange = range
    }
  }

  const endTok = d.expect('rbrace') ?? d.peek() ?? valueStart
  return {
    cpus,
    cpusRange,
    memoryMiB,
    memoryMiBRange,
    diskGiB,
    diskGiBRange,
    range: rangeFromTokens(valueStart, endTok),
  }
}

function parseDiskList(d: ResourceParserDelegate): {
  names: string[]
  ranges: SourceRange[]
} | null {
  if (!d.expect('lbracket')) {
    d.error('disks: expected [', d.peek())
    return null
  }

  const names: string[] = []
  const ranges: SourceRange[] = []

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbracket') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }
    if (t.kind === 'identifier' || t.kind === 'keyword') {
      const tok = d.advance()
      if (!tok) {
        break
      }
      names.push(tok.value as string)
      ranges.push(tok.range)
    } else {
      d.error('Expected disk block name', t)
      d.skipToNextBlock()
      return null
    }
    d.expect('comma')
  }

  if (!d.expect('rbracket')) {
    d.error('Expected ] after disks list', d.peek())
    return null
  }

  return { names, ranges }
}

const HARNESS_KEYS = ['type', 'provider'] as const

type HarnessKey = (typeof HARNESS_KEYS)[number]

function isHarnessKey(value: string): value is HarnessKey {
  return HARNESS_KEYS.some((key) => key === value)
}

function formatAllowed(names: readonly string[]): string {
  return names.join(', ')
}

/** A bare name such as `coding` or `codex`. Keywords count, since `type` is one. */
function bareName(token: Token | null): string | null {
  if (
    token &&
    (token.kind === 'identifier' || token.kind === 'keyword') &&
    typeof token.value === 'string'
  ) {
    return token.value
  }
  return null
}

/**
 * Consume one authored value. Bare names are taken directly; anything else goes
 * through `parseValue`, except a closing brace or comma, which belong to the
 * enclosing block.
 */
function skipHarnessValue(d: ResourceParserDelegate): void {
  const t = d.peek()
  if (!t || t.kind === 'rbrace' || t.kind === 'comma') {
    return
  }
  if (bareName(t) !== null) {
    d.advance()
    return
  }
  d.parseValue()
}

/**
 * Parse `harness: { type: coding, provider: codex }`. Values are bare names,
 * which `parseValue` cannot read because it rejects bare identifiers. Which
 * names exist is the runtime's decision, so that is checked by the validator
 * against the host's harness catalog. Returns null when the block is
 * incomplete; each problem is reported as an error.
 */
function parseHarness(
  d: ResourceParserDelegate,
  harnessKey: Token,
): ComputerHarnessDecl | null {
  if (!d.expect('lbrace')) {
    d.error(
      'harness: expected { type: coding, provider: <name> }',
      d.peek() ?? harnessKey,
    )
    skipHarnessValue(d)
    return null
  }

  let type: string | undefined
  let typeRange: SourceRange | undefined
  let provider: string | undefined
  let providerRange: SourceRange | undefined
  const seen = new Set<HarnessKey>()
  let valid = true

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment' || t.kind === 'comma') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()
    if (!key) {
      d.error('Expected harness property name', t)
      valid = false
      break
    }
    if (!d.expect('colon')) {
      d.error(`Expected : after harness property "${key}"`, d.peek())
      valid = false
      break
    }

    const valTok = d.peek()
    const value = bareName(valTok)
    skipHarnessValue(d)

    if (!isHarnessKey(key)) {
      d.error(
        `Unknown harness property "${key}"; expected ${formatAllowed(HARNESS_KEYS)}`,
        t,
      )
      valid = false
      continue
    }
    if (seen.has(key)) {
      d.error(`Duplicate harness property "${key}"`, t)
      valid = false
      continue
    }
    seen.add(key)

    if (value === null) {
      d.error(`harness.${key} must be a bare name, not a quoted string`, valTok ?? t)
      valid = false
      continue
    }

    if (key === 'type') {
      type = value
      typeRange = valTok?.range
    } else {
      provider = value
      providerRange = valTok?.range
    }
  }

  const endTok = d.expect('rbrace')
  if (!endTok) {
    d.error('Expected } after harness block', d.peek())
    return null
  }

  if (!seen.has('type')) {
    d.error('harness requires "type"', harnessKey)
    valid = false
  }
  if (!seen.has('provider')) {
    d.error('harness requires "provider"', harnessKey)
    valid = false
  }

  if (
    !valid ||
    type === undefined ||
    typeRange === undefined ||
    provider === undefined ||
    providerRange === undefined
  ) {
    return null
  }

  return {
    type,
    typeRange,
    provider,
    providerRange,
    range: rangeFromTokens(harnessKey, endTok),
  }
}

export function parseComputerBlock(
  d: ResourceParserDelegate,
  docComment: string | undefined,
): ComputerDecl | null {
  const start = d.expect('keyword')
  if (!start || (start.value as string) !== 'computer') {
    return null
  }

  const nameTok = d.advance()
  if (!nameTok || nameTok.kind !== 'identifier') {
    d.error('Expected computer block name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let description: string | undefined
  let software: ComputerSoftwarePin[] | undefined
  let disks: string[] | undefined
  let disksRanges: SourceRange[] | undefined
  let resources: ComputerResourcesDecl | undefined
  let harness: ComputerHarnessDecl | undefined
  let harnessSeen = false

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const key = d.parsePropertyKey()
    if (!key) {
      break
    }
    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'label' || key === 'description') {
      const v = d.parseValue()
      if (typeof v === 'string') {
        if (key === 'label') {
          label = v
        } else {
          description = v
        }
      }
      continue
    }

    if (key === 'software') {
      const vs = d.peek()
      if (!vs) {
        break
      }
      const pins = parseSoftwarePins(d)
      if (pins) {
        software = pins
      }
      continue
    }

    if (key === 'disks') {
      const parsed = parseDiskList(d)
      if (parsed) {
        disks = parsed.names
        disksRanges = parsed.ranges
      }
      continue
    }

    if (key === 'resources') {
      const vs = d.peek()
      if (!vs) {
        break
      }
      const decl = parseResources(d, vs)
      if (decl) {
        resources = decl
      }
      continue
    }

    if (key === 'harness') {
      const decl = parseHarness(d, t)
      if (harnessSeen) {
        d.error(
          `Computer "${String(nameTok.value)}" declares more than one harness block`,
          t,
        )
        continue
      }
      harnessSeen = true
      if (decl) {
        harness = decl
      }
      continue
    }

    d.error(`Unknown computer property "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    description,
    software,
    disks,
    disksRanges,
    resources,
    harness,
    docComment,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
