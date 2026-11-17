import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { agentContextToDeploymentPayload } from './validator'

describe('agent blocks', () => {
  test('parses agent with profile and tools list', () => {
    const src = `
secret ai_creds {
  vars: [ OPENAI_API_KEY ]
}

agent my_agent {
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
  maxSteps: 5
  tools: [ tool_a, tool_b ]

  profile r1 {
    description: "Tester"
    tools: [ tool_a ]
  }
}

workflow tool_a {
  label: "TA"
  description: "Tool A"
  root {
    label: "Root"
    type: code
    inputSchema: @json {
      { "type": "object", "required": ["x"], "properties": { "x": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "required": ["y"], "properties": { "y": { "type": "number" } } }
    }
    code: @ts { return {} }
  }
}

workflow tool_b {
  label: "TB"
  description: "Tool B"
  root {
    label: "Root"
    type: code
    inputSchema: @json {
      { "type": "object", "properties": {}, "additionalProperties": false }
    }
    outputSchema: @json {
      { "type": "object", "required": ["z"], "properties": { "z": { "type": "boolean" } } }
    }
    code: @ts { return {} }
  }
}

workflow g {
  label: "G"
  root {
    label: "Start"
    type: code
    code: @ts { return {}; }
  }
  node ask {
    type: agent
    agent: my_agent
    profile: r1
    prompt: @ts { return "hi" }
  }
  flow { root -> ask }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.agent?.length).toBe(1)
    const ag = ast.agent?.[0]
    expect(ag?.name).toBe('my_agent')
    expect(ag?.profiles?.length).toBe(1)
    expect(ag?.profiles?.[0]?.name).toBe('r1')
    expect(ag?.profiles?.[0]?.tools).toEqual(['tool_a'])
    expect(ag?.tools).toEqual(['tool_a', 'tool_b'])
    const node = ast.workflows
      ?.find((g) => g.name === 'g')
      ?.nodes.find((n) => n.name === 'ask')
    expect(node?.type).toBe('agent')
    expect(configString(node?.configFields.agent)).toBe('my_agent')
  })

  test('parses agent sandbox and profile sandbox override', () => {
    const src = `
agent a {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  sandbox: {
    cpus: 2
    memoryMiB: 2048
    autoStopMinutes: 15
  }
  profile r1 {
    description: "R"
    sandbox: { autoStopMinutes: 5 }
  }
}

secret s { vars: [ OPENAI_API_KEY ] }

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const ag = ast.agent?.[0]
    expect(ag?.sandbox?.cpus).toBe(2)
    expect(ag?.sandbox?.memoryMiB).toBe(2048)
    expect(ag?.sandbox?.autoStopMinutes).toBe(15)
    expect(ag?.profiles?.[0]?.sandbox?.autoStopMinutes).toBe(5)
  })

  test('parses agent wallet block', () => {
    const src = `
secret s { vars: [ OPENAI_API_KEY ] }

agent researcher {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  wallet: {
    budget: 50
    cadence: daily
    maxPerCall: 2
  }
}

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const ag = ast.agent?.[0]
    expect(ag?.wallet?.budget).toBe(50)
    expect(ag?.wallet?.cadence).toBe('daily')
    expect(ag?.wallet?.maxPerCall).toBe(2)
  })

  test('parses negative sandbox values without dropping later blocks', () => {
    const src = `
secret c { vars: [ ANTHROPIC_API_KEY ] }

agent first {
  provider: anthropic
  model: "x"
  secrets: c
  sandbox: { cpus: 1, autoDeleteMinutes: -1 }
  system: @ts { return "first" }
}

agent second {
  provider: anthropic
  model: "x"
  secrets: c
  system: @ts { return "second" }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.agent?.[0]?.sandbox?.autoDeleteMinutes).toBe(-1)
    // Regression: a negative number literal must not desync the parser and
    // silently swallow blocks defined after it in the same file.
    expect((ast.agent ?? []).map((a) => a.name)).toEqual(['first', 'second'])
  })

  test('parses agent team list', () => {
    const src = `
secret s { vars: [ OPENAI_API_KEY ] }

agent specialist {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
}

agent lead {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  team: [ specialist ]
}

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const lead = ast.agent?.find((a) => a.name === 'lead')
    expect(lead?.team).toEqual(['specialist'])
  })

  test('wallet block serializes nested fields', async () => {
    const { serialize } = await import('../serializer')
    const src = `
secret s { vars: [ OPENAI_API_KEY ] }

agent researcher {
  provider: openai
  model: "gpt4o"
  secrets: s
  wallet: {
    budget: 50
    cadence: weekly
    maxPerCall: 2
  }
}
`
    const first = parse(src)
    expect(first.errors).toEqual([])
    const out = serialize(first.ast)
    expect(out).toContain(
      'wallet: { budget: 50, cadence: weekly, maxPerCall: 2 }',
    )
    const round = parse(out)
    expect(round.errors).toEqual([])
    const wallet = round.ast.agent?.[0]?.wallet
    expect(wallet?.budget).toBe(50)
    expect(wallet?.cadence).toBe('weekly')
    expect(wallet?.maxPerCall).toBe(2)
  })

  test('parses agent mcp list and profile mcp subset', () => {
    const src = `
mcp axiom_observability {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
}

agent sre_assistant {
  provider: openrouter
  model: "google/gemini-2.5-flash"
  secrets: s
  mcp: [axiom_observability]

  profile oncall {
    mcp: [axiom_observability]
  }
}

secret s { vars: [ OPENROUTER_API_KEY ] }
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const ag = ast.agent?.[0]
    expect(ag?.mcp).toEqual(['axiom_observability'])
    expect(ag?.profiles?.[0]?.mcp).toEqual(['axiom_observability'])
  })

  test('parses agent suggestions list', () => {
    const src = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent poem_writer {
  provider: openrouter
  model: "google/gemini-3.1-flash-lite"
  secrets: s
  suggestions: [
    { label: "Write a poem", message: "Write a beautiful yet succinct poem about" }
  ]
}

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const ag = ast.agent?.[0]
    expect(ag?.suggestions).toEqual([
      {
        label: 'Write a poem',
        message: 'Write a beautiful yet succinct poem about',
        range: expect.any(Object),
      },
    ])
  })

  test('suggestions round-trip through serializer', async () => {
    const { serialize } = await import('../serializer')
    const src = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent poem_writer {
  provider: openrouter
  model: "gpt4o"
  secrets: s
  suggestions: [
    { label: "Write a poem", message: "Write a beautiful yet succinct poem about" }
  ]
}

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const first = parse(src)
    expect(first.errors).toEqual([])
    const out = serialize(first.ast)
    expect(out).toContain(
      'suggestions: [ { label: "Write a poem", message: "Write a beautiful yet succinct poem about" } ]',
    )
    const round = parse(out)
    expect(round.errors).toEqual([])
    expect(round.ast.agent?.[0]?.suggestions?.[0]?.label).toBe('Write a poem')
    expect(round.ast.agent?.[0]?.suggestions?.[0]?.message).toBe(
      'Write a beautiful yet succinct poem about',
    )
  })

  test('errors on non-array suggestions value', () => {
    const src = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent a {
  provider: openrouter
  model: "x"
  secrets: s
  suggestions: "not an array"
}

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const { errors } = parse(src)
    expect(
      errors.some((e) => e.message.includes('suggestions: expected an array')),
    ).toBe(true)
  })

  test('preserves suggestion missing message for validator', () => {
    const src = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent a {
  provider: openrouter
  model: "x"
  secrets: s
  suggestions: [ { label: "Only label" } ]
}

workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {}; }
  }
}
`
    const { ast, errors } = parse(src)
    expect(
      errors.some((e) =>
        e.message.includes('suggestions[0]: message must be a string'),
      ),
    ).toBe(true)
    expect(ast.agent?.[0]?.suggestions).toEqual([
      {
        label: 'Only label',
        message: '',
        range: expect.any(Object),
      },
    ])
  })

  test('parses agent computer: as a bare name with a value range', () => {
    const src = `
computer pr_bot {}

agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: pr_bot
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const agent = ast.agent?.[0]
    expect(agent?.computer).toBe('pr_bot')
    expect(agent?.computerRange).toBeDefined()
    const range = agent?.computerRange
    expect(
      range ? src.slice(range.start.offset, range.end.offset) : undefined,
    ).toBe('pr_bot')
    expect(agent?.sandbox).toBeUndefined()
    expect(agent?.disks).toBeUndefined()
  })

  test('keeps empty sandbox and disks present, and absent ones absent', () => {
    const present = parse(`
agent a {
  provider: openai
  model: m
  secrets: s
  sandbox: { }
  disks: []
  profile p {
    sandbox: { }
  }
}
`)
    expect(present.errors).toEqual([])
    const agent = present.ast.agent?.[0]
    expect(agent?.sandbox).toBeDefined()
    expect(agent?.sandbox?.cpus).toBeUndefined()
    expect(agent?.disks).toEqual([])
    expect(agent?.disksRange).toBeDefined()
    expect(agent?.profiles?.[0]?.sandbox).toBeDefined()
    expect(agent?.profiles?.[0]?.sandbox?.cpus).toBeUndefined()

    const absent = parse(`
agent a {
  provider: openai
  model: m
  secrets: s
  profile p {
  }
}
`)
    expect(absent.errors).toEqual([])
    expect(absent.ast.agent?.[0]?.sandbox).toBeUndefined()
    expect(absent.ast.agent?.[0]?.disks).toBeUndefined()
    expect(absent.ast.agent?.[0]?.disksRange).toBeUndefined()
    expect(absent.ast.agent?.[0]?.computer).toBeUndefined()
    expect(absent.ast.agent?.[0]?.profiles?.[0]?.sandbox).toBeUndefined()
    expect(absent.ast.agent?.[0]?.profiles?.[0]?.computer).toBeUndefined()
  })

  test('keeps computer: on a profile instead of dropping the key', () => {
    const src = `
agent a {
  provider: openai
  model: m
  secrets: s
  profile p {
    computer: box
  }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const profile = ast.agent?.[0]?.profiles?.[0]
    expect(profile?.computer).toBe('box')
    const range = profile?.computerRange
    expect(
      range ? src.slice(range.start.offset, range.end.offset) : undefined,
    ).toBe('box')
  })
})

describe('agent context block', () => {
  // `gpt4o` rather than a realistic slash-and-dash model id: `serializeAgent`
  // emits those as barewords the lexer cannot read back, which would fail the
  // round-trip tests below for a reason that has nothing to do with `context`.
  const withAgentBody = (body: string) => `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent support {
  provider: openrouter
  model: "gpt4o"
  secrets: s
${body}
}
`

  test('parses every context knob', () => {
    const { ast, errors } = parse(
      withAgentBody(`  context: {
    budget: 120000
    compact_at: 0.8
    keep_recent_turns: 3
    prune_tool_results_after: 5
    cache_retention: long
  }`),
    )
    expect(errors).toEqual([])
    const ctx = ast.agent?.[0]?.context
    expect(ctx?.budget).toBe(120000)
    expect(ctx?.compactAt).toBe(0.8)
    expect(ctx?.keepRecentTurns).toBe(3)
    expect(ctx?.pruneToolResultsAfter).toBe(5)
    expect(ctx?.cacheRetention).toBe('long')
  })

  test('parses a partial context block, leaving the rest managed', () => {
    const { ast, errors } = parse(
      withAgentBody('  context: { cache_retention: none }'),
    )
    expect(errors).toEqual([])
    const ctx = ast.agent?.[0]?.context
    expect(ctx?.cacheRetention).toBe('none')
    expect(ctx?.budget).toBeUndefined()
    expect(ctx?.compactAt).toBeUndefined()
    expect(ctx?.keepRecentTurns).toBeUndefined()
    expect(ctx?.pruneToolResultsAfter).toBeUndefined()
  })

  test('parses an empty context block as a declaration with no overrides', () => {
    const { ast, errors } = parse(withAgentBody('  context: { }'))
    expect(errors).toEqual([])
    const ctx = ast.agent?.[0]?.context
    expect(ctx).toBeDefined()
    expect(ctx?.budget).toBeUndefined()
    expect(ctx?.cacheRetention).toBeUndefined()
  })

  test('an agent without a context block leaves it absent', () => {
    const { ast, errors } = parse(withAgentBody('  maxSteps: 5'))
    expect(errors).toEqual([])
    expect(ast.agent?.[0]?.context).toBeUndefined()
  })

  test('accepts the colon-less block spelling', () => {
    const { ast, errors } = parse(
      withAgentBody(`  context {
    budget: 64000
    keep_recent_turns: 2
  }`),
    )
    expect(errors).toEqual([])
    const ctx = ast.agent?.[0]?.context
    expect(ctx?.budget).toBe(64000)
    expect(ctx?.keepRecentTurns).toBe(2)
  })

  test('reports an unknown context key without dropping the rest of the block', () => {
    const { ast, errors } = parse(
      withAgentBody(`  context: {
    compact_after: 0.9
    budget: 8000
  }`),
    )
    expect(
      errors.some((e) =>
        e.message.includes('Unexpected key "compact_after" in context block'),
      ),
    ).toBe(true)
    expect(ast.agent?.[0]?.context?.budget).toBe(8000)
  })

  test('reports a non-numeric budget', () => {
    const { errors } = parse(withAgentBody('  context: { budget: "lots" }'))
    expect(
      errors.some((e) => e.message === 'context.budget must be a number'),
    ).toBe(true)
  })

  test('reports a cache_retention that is not a bare name', () => {
    const { errors } = parse(withAgentBody('  context: { cache_retention: 3 }'))
    expect(
      errors.some((e) =>
        e.message.includes(
          'context.cache_retention must be none, short, or long',
        ),
      ),
    ).toBe(true)
  })

  test('context block round-trips through the serializer', async () => {
    const { serialize } = await import('../serializer')
    const src = withAgentBody(`  context {
    budget: 120000
    compact_at: 0.8
    keep_recent_turns: 3
    prune_tool_results_after: 5
    cache_retention: long
  }`)

    const first = parse(src)
    expect(first.errors).toEqual([])
    const out = serialize(first.ast)
    expect(out).toContain(
      'context: { budget: 120000, compact_at: 0.8, keep_recent_turns: 3, prune_tool_results_after: 5, cache_retention: long }',
    )

    // Ranges shift with the reformatted source, so the round trip is compared
    // on the deployment payload: the values, stripped of editor-only fields.
    const round = parse(out)
    expect(round.errors).toEqual([])
    expect(
      agentContextToDeploymentPayload(round.ast.agent?.[0]?.context),
    ).toEqual(agentContextToDeploymentPayload(first.ast.agent?.[0]?.context))
    expect(serialize(round.ast)).toBe(out)
  })

  test('an empty context block survives the round trip', async () => {
    const { serialize } = await import('../serializer')
    const first = parse(withAgentBody('  context: { }'))
    expect(first.errors).toEqual([])
    const out = serialize(first.ast)
    expect(out).toContain('context: { }')

    const round = parse(out)
    expect(round.errors).toEqual([])
    expect(round.ast.agent?.[0]?.context).toBeDefined()
    expect(serialize(round.ast)).toBe(out)
  })
})

describe('agent provider default', () => {
  test('omitted provider defaults to openrouter without a source range', () => {
    const src = `
secret ai_creds {
  vars: [ OPENROUTER_API_KEY ]
}

agent operator {
  model: "anthropic/claude-sonnet-4.5"
  secrets: ai_creds
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.agent?.[0]?.provider).toBe('openrouter')
    expect(ast.agent?.[0]?.providerRange).toBeUndefined()
  })

  test('a blank provider defaults to openrouter', () => {
    const src = `
secret ai_creds {
  vars: [ OPENROUTER_API_KEY ]
}

agent operator {
  provider: ""
  model: "anthropic/claude-sonnet-4.5"
  secrets: ai_creds
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.agent?.[0]?.provider).toBe('openrouter')
    expect(ast.agent?.[0]?.providerRange).toBeUndefined()
  })

  test('an explicit provider is preserved with its source range', () => {
    const src = `
secret ai_creds {
  vars: [ OPENAI_API_KEY ]
}

agent operator {
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const agent = ast.agent?.[0]
    expect(agent?.provider).toBe('openai')
    const range = agent?.providerRange
    expect(
      range ? src.slice(range.start.offset, range.end.offset) : undefined,
    ).toBe('openai')
  })
})

function configString(cv: unknown): string | undefined {
  if (
    cv &&
    typeof cv === 'object' &&
    'kind' in cv &&
    (cv as { kind: string }).kind === 'string'
  ) {
    return (cv as { kind: string; value: string }).value
  }
  return undefined
}
