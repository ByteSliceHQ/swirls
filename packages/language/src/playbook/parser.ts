/**
 * Parsing for top-level `playbook` blocks (cases, evals, expects, judges).
 */

import type { ConfigValue, JsonBlockInfo, SourceRange } from '../ast'
import { parseDurationSeconds } from '../duration'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  AssertionSeverity,
  ExpectAssertion,
  ExpectDecl,
  ExpectStatus,
  JudgeDecl,
  PlaybookCaseDecl,
  PlaybookDecl,
  PlaybookEvalDecl,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

function parseIdentOrString(d: ResourceParserDelegate): string | null {
  const peeked = d.peek()

  if (
    peeked &&
    (peeked.kind === 'identifier' || peeked.kind === 'keyword' || peeked.kind === 'string')
  ) {
    d.advance()
    return String(peeked.value)
  }

  return null
}

function parseJsonBlock(d: ResourceParserDelegate): JsonBlockInfo | null {
  const peeked = d.peek()

  if (peeked?.kind !== 'fenced_block' || peeked.fencedLang !== 'json') {
    return null
  }

  const tok = d.advance()!
  return {
    code: tok.fencedContent ?? '',
    innerRange: tok.fencedContentRange ?? tok.range,
  }
}

function parseNameList(d: ResourceParserDelegate): string[] {
  const peeked = d.peek()

  if (peeked?.kind !== 'lbracket') {
    const v = d.parseValue()
    return typeof v === 'string' ? [v] : []
  }

  d.advance()
  const out: string[] = []

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbracket') {
      break
    }

    if (t.kind === 'comma') {
      d.advance()
      continue
    }

    if (t.kind === 'identifier' || t.kind === 'keyword' || t.kind === 'string') {
      d.advance()
      out.push(String(t.value))
      continue
    }

    d.parseValue()
  }

  d.expect('rbracket')
  return out
}

function parseDurationLiteral(
  d: ResourceParserDelegate,
): { literal: string; seconds: number | null } | null {
  const peeked = d.peek()

  if (peeked?.kind === 'string') {
    d.advance()
    const literal = peeked.value as string
    return { literal, seconds: parseDurationSeconds(literal) }
  }

  // Bare `2m` is invalid DSL (lexer splits number + ident); require quotes.
  d.error(
    'Duration must be a quoted literal like "2m" (whole number followed by s, m, or h)',
    peeked,
  )

  d.parseValue()
  return null
}

function parseSeverity(v: unknown): AssertionSeverity | undefined {
  return v === 'soft' || v === 'gate' ? v : undefined
}

function parseStatus(v: unknown): ExpectStatus | undefined {
  return v === 'completed' || v === 'failed' || v === 'waiting' ? v : undefined
}

function parseQualifiedNodeKey(
  d: ResourceParserDelegate,
  firstKey: 'node',
  startRange: SourceRange,
): { node: string; field: 'output' | 'status'; range: SourceRange } | null {
  // After seeing `node`, expect `<name>.output` or `<name>.status` as
  // identifier + optional dot-path, then the caller has already consumed `:`.
  // Alternate authoring: property key was already just `node` — read name.field.
  void firstKey
  const nameTok = d.peek()

  if (!nameTok || (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')) {
    d.error('Expected node name after node', nameTok)
    return null
  }

  d.advance()
  let field: 'output' | 'status' | undefined

  if (d.peek()?.kind === 'dot') {
    d.advance()
    const fieldTok = d.peek()

    if (
      fieldTok &&
      (fieldTok.kind === 'identifier' || fieldTok.kind === 'keyword') &&
      (fieldTok.value === 'output' || fieldTok.value === 'status')
    ) {
      d.advance()
      field = fieldTok.value
    }
  }

  // Support `node summarize.output` when summarize.output is a single identifier
  // containing a dot? Lexer won't do that. Support key form `nodeOutput` separately.
  if (!field) {
    // Allow `node: { name: … field already handled elsewhere }` — here require .field
    d.error('Expected node <name>.output or node <name>.status', d.peek())
    return null
  }

  if (!d.expect('colon')) {
    d.error('Expected : after node field', d.peek())
    return null
  }

  return {
    node: String(nameTok.value),
    field,
    range: {
      start: { ...startRange.start },
      end: { ...(d.peek()?.range.end ?? nameTok.range.end) },
    },
  }
}

function parseBudgetObject(
  d: ResourceParserDelegate,
  range: SourceRange,
  severity?: AssertionSeverity,
  label?: string,
): ExpectAssertion {
  if (!d.expect('lbrace')) {
    return { kind: 'budget', severity, label, range }
  }

  let duration: string | undefined
  let durationSeconds: number | undefined
  let tokens: number | undefined
  let cost: number | undefined

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      break
    }

    if (key === 'duration') {
      const dur = parseDurationLiteral(d)

      if (dur) {
        duration = dur.literal
        durationSeconds = dur.seconds ?? undefined
      }

      continue
    }

    if (key === 'tokens') {
      const v = d.parseValue()

      if (typeof v === 'number') {
        tokens = v
      }

      continue
    }

    if (key === 'cost') {
      const v = d.parseValue()

      if (typeof v === 'number') {
        cost = v
      }

      continue
    }

    d.parseValue()
  }

  d.expect('rbrace')
  return {
    kind: 'budget',
    duration,
    durationSeconds,
    tokens,
    cost,
    severity: severity ?? 'soft',
    label,
    range,
  }
}

function parseExpectBlock(d: ResourceParserDelegate): ExpectDecl | null {
  const start = d.peek()

  if (!d.expect('lbrace')) {
    return null
  }

  const assertions: ExpectAssertion[] = []

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyStart = t.range
    const key = d.parsePropertyKey()

    if (!key) {
      break
    }

    // `node <name>.output:` / `node <name>.status:` — key is `node`, then name.field
    if (key === 'node') {
      const qualified = parseQualifiedNodeKey(d, 'node', keyStart)

      if (!qualified) {
        d.skipToNextBlock()
        break
      }

      if (qualified.field === 'output') {
        const block = parseJsonBlock(d)
        let literal: Record<string, unknown> | undefined

        if (!block) {
          const v = d.parseValue()

          if (v && typeof v === 'object' && !Array.isArray(v)) {
            literal = v as Record<string, unknown>
          }
        }

        assertions.push({
          kind: 'nodeOutput',
          node: qualified.node,
          value: block ?? undefined,
          literal,
          range: qualified.range,
        })
      } else {
        const v = parseIdentOrString(d)
        const status = parseStatus(v)

        if (!status) {
          d.error('node status must be completed | failed | waiting', d.peek())

          if (v == null) {
            d.parseValue()
          }
        } else {
          assertions.push({
            kind: 'nodeStatus',
            node: qualified.node,
            status,
            range: qualified.range,
          })
        }
      }

      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'status') {
      const v = parseIdentOrString(d)
      const status = parseStatus(v)

      if (!status) {
        d.error('status must be completed | failed | waiting', d.peek())

        if (v == null) {
          d.parseValue()
        }
      } else {
        assertions.push({
          kind: 'status',
          status,
          range: keyStart,
        })
      }

      continue
    }

    if (key === 'duration') {
      if (d.peek()?.kind === 'lbrace') {
        d.advance()
        let max: string | undefined
        let maxSeconds: number | undefined
        let severity: AssertionSeverity | undefined
        let label: string | undefined

        while (!d.eof()) {
          const inner = d.peek()

          if (!inner || inner.kind === 'rbrace') {
            break
          }

          const ik = d.parsePropertyKey()

          if (!ik) {
            break
          }

          if (!d.expect('colon')) {
            break
          }

          if (ik === 'max') {
            const dur = parseDurationLiteral(d)

            if (dur) {
              max = dur.literal
              maxSeconds = dur.seconds ?? undefined
            }

            continue
          }

          if (ik === 'severity') {
            severity = parseSeverity(d.parseValue())
            continue
          }

          if (ik === 'label') {
            const v = d.parseValue()

            if (typeof v === 'string') {
              label = v
            }

            continue
          }

          d.parseValue()
        }

        d.expect('rbrace')

        if (max) {
          assertions.push({
            kind: 'duration',
            max,
            maxSeconds,
            severity,
            label,
            range: keyStart,
          })
        } else {
          d.error('duration requires max: "…"', d.peek())
        }
      } else {
        d.error('duration must be { max: "…" }', d.peek())
        d.parseValue()
      }

      continue
    }

    if (key === 'output' || key === 'equals') {
      const block = parseJsonBlock(d)
      let literal: unknown

      if (!block) {
        literal = d.parseValue()
      }

      assertions.push(
        key === 'output'
          ? {
              kind: 'output',
              value: block ?? undefined,
              literal:
                literal && typeof literal === 'object' && !Array.isArray(literal)
                  ? (literal as Record<string, unknown>)
                  : undefined,
              range: keyStart,
            }
          : {
              kind: 'equals',
              value: block ?? undefined,
              literal,
              range: keyStart,
            },
      )

      continue
    }

    if (key === 'includes' || key === 'matches') {
      const v = d.parseValue()

      if (typeof v === 'string') {
        assertions.push({
          kind: key,
          value: v,
          range: keyStart,
        })
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>

        assertions.push({
          kind: key,
          value: String(obj.value ?? ''),
          on: typeof obj.on === 'string' ? obj.on : undefined,
          severity: parseSeverity(obj.severity),
          label: typeof obj.label === 'string' ? obj.label : undefined,
          range: keyStart,
        })
      } else {
        d.error(`${key} must be a string or object`, d.peek())
      }

      continue
    }

    if (key === 'similar') {
      if (!d.expect('lbrace')) {
        d.parseValue()
        continue
      }

      let to: string | undefined
      let min = 0
      let severity: AssertionSeverity | undefined
      let label: string | undefined

      while (!d.eof()) {
        const inner = d.peek()

        if (!inner || inner.kind === 'rbrace') {
          break
        }

        const ik = d.parsePropertyKey()

        if (!ik) {
          break
        }

        if (!d.expect('colon')) {
          break
        }

        if (ik === 'to') {
          const v = d.parseValue()

          if (typeof v === 'string') {
            to = v
          }

          continue
        }

        if (ik === 'min') {
          const v = d.parseValue()

          if (typeof v === 'number') {
            min = v
          }

          continue
        }

        if (ik === 'severity') {
          severity = parseSeverity(d.parseValue())
          continue
        }

        if (ik === 'label') {
          const v = d.parseValue()

          if (typeof v === 'string') {
            label = v
          }

          continue
        }

        d.parseValue()
      }

      d.expect('rbrace')

      if (to !== undefined) {
        assertions.push({
          kind: 'similar',
          to,
          min,
          severity: severity ?? 'soft',
          label,
          range: keyStart,
        })
      }

      continue
    }

    if (
      key === 'events' ||
      key === 'called' ||
      key === 'notCalled' ||
      key === 'order' ||
      key === 'path'
    ) {
      const names = parseNameList(d)

      assertions.push({
        kind: key,
        ...(key === 'events' ? { events: names } : { names }),
        range: keyStart,
      } as ExpectAssertion)

      continue
    }

    if (key === 'budget') {
      assertions.push(parseBudgetObject(d, keyStart))
      continue
    }

    if (key === 'severity' || key === 'label') {
      // Trailing meta on previous assertion — apply to last if present.
      const v = d.parseValue()
      const last = assertions[assertions.length - 1]

      if (last) {
        if (key === 'severity') {
          const s = parseSeverity(v)

          if (s) {
            last.severity = s
          }
        } else if (typeof v === 'string') {
          last.label = v
        }
      }

      continue
    }

    d.error(`Unknown expect assertion "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    assertions,
    range: rangeFromTokens(start!, end ?? start!),
  }
}

function parseJudgeBlock(d: ResourceParserDelegate): JudgeDecl | null {
  const peeked = d.peek()

  // `judge: @ts { … }`
  if (peeked?.kind === 'fenced_block' && peeked.fencedLang === 'ts') {
    const tok = d.advance()!

    const ts: ConfigValue = {
      kind: 'ts_block',
      code: tok.fencedContent ?? '',
      range: tok.range,
      innerRange: tok.fencedContentRange ?? tok.range,
    }

    return { ts, range: tok.range }
  }

  if (!d.expect('lbrace')) {
    return null
  }

  const start = peeked
  let rubric: string | undefined
  let criteria: string | undefined
  let minScore: number | undefined
  let severity: AssertionSeverity | undefined
  let label: string | undefined
  let model: string | undefined

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
      break
    }

    if (key === 'rubric') {
      const v = parseIdentOrString(d)

      if (v) {
        rubric = v
      } else {
        d.parseValue()
      }

      continue
    }

    if (key === 'criteria') {
      const v = d.parseValue()

      if (typeof v === 'string') {
        criteria = v
      }

      continue
    }

    if (key === 'minScore') {
      const v = d.parseValue()

      if (typeof v === 'number') {
        minScore = v
      }

      continue
    }

    if (key === 'severity') {
      severity = parseSeverity(parseIdentOrString(d))
      continue
    }

    if (key === 'label') {
      const v = parseIdentOrString(d)

      if (v) {
        label = v
      }

      continue
    }

    if (key === 'model') {
      const v = parseIdentOrString(d)

      if (v) {
        model = v
      }

      continue
    }

    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    rubric,
    criteria,
    minScore,
    severity: severity ?? 'soft',
    label,
    model,
    range: rangeFromTokens(start!, end ?? start!),
  }
}

function parseCaseOrEvalShared(d: ResourceParserDelegate): Omit<
  PlaybookCaseDecl,
  'name' | 'expect' | 'range'
> & {
  retries?: number
  judge?: JudgeDecl
  expect?: ExpectDecl
  rangeEnd?: Token
} {
  let workflow: string | undefined
  let workflowRange: SourceRange | undefined
  let input: JsonBlockInfo | undefined
  let inputLiteral: Record<string, unknown> | undefined
  let dataset: JsonBlockInfo | undefined
  let timeout: string | undefined
  let timeoutSeconds: number | undefined
  let tags: string[] | undefined
  let skip: string | undefined
  let retries: number | undefined
  let judge: JudgeDecl | undefined
  let expect: ExpectDecl | undefined

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    // Nested `expect` / `judge` — bare `judge { }` or property `judge: { }` / `judge: @ts`.
    if (
      (t.kind === 'identifier' || t.kind === 'keyword') &&
      (t.value === 'expect' || t.value === 'judge')
    ) {
      const kind = t.value as string
      d.advance()

      if (d.peek()?.kind === 'colon') {
        d.advance()
      }

      if (kind === 'expect') {
        expect = parseExpectBlock(d) ?? undefined
      } else {
        judge = parseJudgeBlock(d) ?? undefined
      }

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

    if (key === 'workflow') {
      const peeked = d.peek()

      if (
        peeked &&
        (peeked.kind === 'identifier' || peeked.kind === 'keyword' || peeked.kind === 'string')
      ) {
        d.advance()
        workflow = String(peeked.value)
        workflowRange = peeked.range
      } else {
        d.error('Expected workflow name', peeked)
        d.parseValue()
      }

      continue
    }

    if (key === 'input') {
      const block = parseJsonBlock(d)

      if (block) {
        input = block
      } else {
        const v = d.parseValue()

        if (v && typeof v === 'object' && !Array.isArray(v)) {
          inputLiteral = v as Record<string, unknown>
        }
      }

      continue
    }

    if (key === 'dataset') {
      const block = parseJsonBlock(d)

      if (block) {
        dataset = block
      } else {
        d.error('dataset must be @json [ … ]', d.peek())
        d.parseValue()
      }

      continue
    }

    if (key === 'timeout') {
      const dur = parseDurationLiteral(d)

      if (dur) {
        timeout = dur.literal
        timeoutSeconds = dur.seconds ?? undefined
      }

      continue
    }

    if (key === 'tags') {
      tags = parseNameList(d)
      continue
    }

    if (key === 'skip') {
      const v = d.parseValue()

      if (typeof v === 'string') {
        skip = v
      }

      continue
    }

    if (key === 'retries') {
      const v = d.parseValue()

      if (typeof v === 'number') {
        retries = v
      }

      continue
    }

    if (key === 'judge') {
      judge = parseJudgeBlock(d) ?? undefined
      continue
    }

    if (key === 'expect') {
      expect = parseExpectBlock(d) ?? undefined
      continue
    }

    d.error(`Unknown case/eval property "${key}"`, t)
    d.parseValue()
  }

  return {
    workflow: workflow ?? '',
    workflowRange,
    input,
    inputLiteral,
    dataset,
    timeout,
    timeoutSeconds,
    tags,
    skip,
    retries,
    judge,
    expect,
  }
}

function parseNamedInnerBlock(
  d: ResourceParserDelegate,
  keyword: 'case' | 'eval',
): PlaybookCaseDecl | PlaybookEvalDecl | null {
  const start = d.advance()!
  const nameTok = d.advance()

  if (!nameTok || (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')) {
    d.error(`Expected ${keyword} name`, nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  const shared = parseCaseOrEvalShared(d)
  const end = d.expect('rbrace') ?? d.peek()
  const range = rangeFromTokens(start, end ?? nameTok)

  if (!shared.workflow) {
    d.error(`${keyword} requires workflow: <name>`, end)
  }

  if (keyword === 'case') {
    return {
      name: nameTok.value as string,
      workflow: shared.workflow,
      workflowRange: shared.workflowRange,
      input: shared.input,
      inputLiteral: shared.inputLiteral,
      dataset: shared.dataset,
      timeout: shared.timeout,
      timeoutSeconds: shared.timeoutSeconds,
      tags: shared.tags,
      skip: shared.skip,
      expect: shared.expect,
      range,
    } satisfies PlaybookCaseDecl
  }

  return {
    name: nameTok.value as string,
    workflow: shared.workflow,
    workflowRange: shared.workflowRange,
    input: shared.input,
    inputLiteral: shared.inputLiteral,
    dataset: shared.dataset,
    timeout: shared.timeout,
    timeoutSeconds: shared.timeoutSeconds,
    retries: shared.retries,
    tags: shared.tags,
    skip: shared.skip,
    judge: shared.judge,
    expect: shared.expect,
    range,
  } satisfies PlaybookEvalDecl
}

export function parsePlaybookBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): PlaybookDecl | null {
  const start = d.expect('keyword')

  if (!start || (start.value as string) !== 'playbook') {
    return null
  }

  const nameTok = d.advance()

  if (!nameTok || (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword')) {
    d.error('Expected playbook name', nameTok)
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
  let mocks: string | undefined
  let mocksRange: SourceRange | undefined
  let tags: string[] | undefined
  const cases: PlaybookCaseDecl[] = []
  const evals: PlaybookEvalDecl[] = []

  while (!d.eof()) {
    const t = d.peek()

    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    if (
      (t.kind === 'identifier' || t.kind === 'keyword') &&
      (t.value === 'case' || t.value === 'eval')
    ) {
      const kind = t.value as 'case' | 'eval'
      const block = parseNamedInnerBlock(d, kind)

      if (block) {
        if (kind === 'case') {
          cases.push(block as PlaybookCaseDecl)
        } else {
          evals.push(block as PlaybookEvalDecl)
        }
      }

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

    if (key === 'label') {
      const v = d.parseValue()

      if (typeof v === 'string') {
        label = v
      }

      continue
    }

    if (key === 'description') {
      const v = d.parseValue()

      if (typeof v === 'string') {
        description = v
      }

      continue
    }

    if (key === 'mocks') {
      const peeked = d.peek()

      if (
        peeked &&
        (peeked.kind === 'identifier' || peeked.kind === 'keyword' || peeked.kind === 'string')
      ) {
        d.advance()
        mocks = String(peeked.value)
        mocksRange = peeked.range
      } else {
        d.error('Expected mock block name', peeked)
        d.parseValue()
      }

      continue
    }

    if (key === 'tags') {
      tags = parseNameList(d)
      continue
    }

    d.error(`Unknown playbook property "${key}"`, t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value as string,
    label,
    description,
    docComment,
    mocks,
    mocksRange,
    tags,
    cases,
    evals,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
