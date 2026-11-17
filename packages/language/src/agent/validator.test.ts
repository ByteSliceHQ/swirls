import { describe, expect, test } from 'bun:test'

import { validateAgentMcpRefs } from '../mcp/validator'
import { parse } from '../parser'
import { validate } from '../validator'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { validateAgentBlocks } from './validator'

describe('validateAgentBlocks team', () => {
  test('rejects self-reference in team', () => {
    const source = `
agent lead {
  label: "Lead"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  team: [ lead ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)
    expect(errors.some((e) => e.message.includes('cannot include itself'))).toBe(true)
  })

  test('rejects team cycle', () => {
    const source = `
agent a {
  label: "A"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  team: [ b ]
}

agent b {
  label: "B"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  team: [ a ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)
    expect(errors.some((e) => e.message.includes('cycle'))).toBe(true)
  })

  test('rejects team name colliding with tools graph', () => {
    const source = `
agent worker {
  label: "Worker"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

workflow worker {
  label: "Worker tool"
  description: "Does work"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "x": { "type": "string" } } }
    }
    code: @ts { return {} }
  }
}

agent lead {
  label: "Lead"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  tools: [ worker ]
  team: [ worker ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)
    expect(errors.some((e) => e.message.includes('conflicts with a workflow tool'))).toBe(true)
  })
})

describe('validateAgentBlocks wallet', () => {
  test('rejects maxPerCall above budget', () => {
    const source = `
secret s { vars: [ OPENAI_API_KEY ] }

agent a {
  label: "A"
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  wallet: {
    budget: 10
    cadence: daily
    maxPerCall: 20
  }
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)

    expect(
      errors.some((e) =>
        e.message.includes('maxPerCall must be less than or equal to wallet.budget'),
      ),
    ).toBe(true)
  })
})

describe('validateAgentBlocks tool inputSchema properties', () => {
  test('rejects inline inputSchema with no properties', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object" }
    }
    code: @ts { return {} }
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)

    expect(
      errors.some((e) => e.message.includes('must declare a non-empty properties object')),
    ).toBe(true)
  })

  test('rejects inline inputSchema with empty properties object', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": {} }
    }
    code: @ts { return {} }
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)

    expect(
      errors.some((e) => e.message.includes('must declare a non-empty properties object')),
    ).toBe(true)
  })

  test('accepts inline inputSchema with at least one property', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "company_name": { "type": "string" } } }
    }
    outputSchema: @json {
      { "type": "object", "properties": { "result": { "type": "string" } } }
    }
    code: @ts { return { result: "" } }
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)

    expect(
      errors.some((e) => e.message.includes('must declare a non-empty properties object')),
    ).toBe(false)
  })

  test('rejects inputSchemaRef to a schema with no properties', () => {
    const source = `
schema empty_input {
  label: "Empty input"
  schema: @json {
    { "type": "object" }
  }
}

workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: empty_input
    code: @ts { return {} }
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)

    expect(
      errors.some((e) => e.message.includes('must declare a non-empty properties object')),
    ).toBe(true)
  })
})

describe('validateAgentBlocks tool leaf output schema', () => {
  const leafSchemaError = (errors: { message: string }[]) =>
    errors.some((e) => e.message.includes('requires output schema on leaf node'))

  test('accepts an AI kind:text leaf with no output schema', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "company_name": { "type": "string" } } }
    }
    code: @ts { return {} }
  }
  node answer {
    type: ai
    label: "Answer"
    kind: text
    model: "google/gemini-2.5-flash"
    prompt: @ts { return "" }
  }
  flow {
    root -> answer
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    expect(leafSchemaError(validateAgentBlocks(ast))).toBe(false)
  })

  test('accepts an AI kind:embed leaf with no output schema', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "company_name": { "type": "string" } } }
    }
    code: @ts { return {} }
  }
  node vec {
    type: ai
    label: "Embed"
    kind: embed
    model: "openai/text-embedding-3-small"
    prompt: @ts { return [""] }
  }
  flow {
    root -> vec
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    expect(leafSchemaError(validateAgentBlocks(ast))).toBe(false)
  })

  test('still requires output schema on an AI kind:object leaf', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "company_name": { "type": "string" } } }
    }
    code: @ts { return {} }
  }
  node classify {
    type: ai
    label: "Classify"
    kind: object
    model: "google/gemini-2.5-flash"
    prompt: @ts { return "" }
  }
  flow {
    root -> classify
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    expect(leafSchemaError(validateAgentBlocks(ast))).toBe(true)
  })

  test('still requires output schema on a non-AI code leaf', () => {
    const source = `
workflow company_info {
  label: "Company info"
  description: "Look up company info"
  root {
    type: code
    label: "Entry"
    inputSchema: @json {
      { "type": "object", "properties": { "company_name": { "type": "string" } } }
    }
    code: @ts { return {} }
  }
  node finalize {
    type: code
    label: "Finalize"
    code: @ts { return {} }
  }
  flow {
    root -> finalize
  }
}

agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  secrets: creds
  tools: [ company_info ]
}

secrets creds {
  vars: [ OPENROUTER_API_KEY ]
}
`

    const { ast } = parse(source)
    expect(leafSchemaError(validateAgentBlocks(ast))).toBe(true)
  })
})

describe('agent mcp refs', () => {
  test('flags agent referencing an undefined mcp block', () => {
    const source = `
agent sre {
  label: "SRE"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  mcp: [ missing_slot ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentMcpRefs(ast)
    expect(errors.some((e) => e.message.includes('undefined mcp block'))).toBe(true)
  })

  test('flags profile mcp that is not a subset of the agent mcp list', () => {
    const source = `
mcp axiom {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
}
mcp extra {
  label: "Extra"
  url: "https://mcp.example.com/extra"
}
agent sre {
  label: "SRE"
  provider: openrouter
  model: "openai/gpt-4o-mini"
  mcp: [ axiom ]

  profile oncall {
    mcp: [ extra ]
  }
}
`

    const { ast } = parse(source)
    const errors = validateAgentMcpRefs(ast)
    expect(errors.some((e) => e.message.includes('is not listed on agent'))).toBe(true)
  })
})

describe('validateAgentBlocks suggestions', () => {
  test('rejects more than six suggestions', () => {
    const source = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent a {
  provider: openrouter
  model: "x"
  secrets: s
  suggestions: [
    { label: "1", message: "one" },
    { label: "2", message: "two" },
    { label: "3", message: "three" },
    { label: "4", message: "four" },
    { label: "5", message: "five" },
    { label: "6", message: "six" },
    { label: "7", message: "seven" }
  ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)
    expect(errors.some((e) => e.message.includes('at most 6'))).toBe(true)
  })

  test('rejects empty suggestion label or message', () => {
    const source = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent a {
  provider: openrouter
  model: "x"
  secrets: s
  suggestions: [
    { label: "", message: "hello" },
    { label: "Hi", message: "   " }
  ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)
    expect(errors.some((e) => e.message.includes('suggestions[0].label'))).toBe(true)
    expect(errors.some((e) => e.message.includes('suggestions[1].message'))).toBe(true)
  })

  test('rejects duplicate suggestion labels', () => {
    const source = `
secret s { vars: [ OPENROUTER_API_KEY ] }

agent a {
  provider: openrouter
  model: "x"
  secrets: s
  suggestions: [
    { label: "Write", message: "Write about poetry" },
    { label: "Write", message: "Write about nature" }
  ]
}
`

    const { ast } = parse(source)
    const errors = validateAgentBlocks(ast)
    expect(errors.some((e) => e.message.includes('label must be unique'))).toBe(true)
  })
})

describe('validateAgentBlocks context', () => {
  const agentWith = (body: string, provider = 'openrouter') => `
secret s { vars: [ OPENROUTER_API_KEY, ANTHROPIC_API_KEY ] }

agent support {
  provider: ${provider}
  model: "anthropic/claude-sonnet-5"
  secrets: s
${body}
}
`

  const contextErrors = (body: string) => {
    const { ast } = parse(agentWith(body))
    return validateAgentBlocks(ast).filter((e) => e.message.includes('context.'))
  }

  test('accepts a fully declared context block', () => {
    expect(
      contextErrors(`  context {
    budget: 120000
    compact_at: 0.8
    keep_recent_turns: 3
    prune_tool_results_after: 5
    cache_retention: long
  }`),
    ).toEqual([])
  })

  test('accepts an empty context block', () => {
    expect(contextErrors('  context { }')).toEqual([])
  })

  test('rejects a non-positive budget', () => {
    expect(
      contextErrors('  context { budget: 0 }').some((e) =>
        e.message.includes('context.budget must be a positive whole number of tokens'),
      ),
    ).toBe(true)
  })

  test('rejects a fractional budget', () => {
    expect(
      contextErrors('  context { budget: 1000.5 }').some((e) =>
        e.message.includes('context.budget must be a positive whole number'),
      ),
    ).toBe(true)
  })

  test('rejects compact_at outside (0, 1]', () => {
    for (const value of ['0', '1.5', '-0.2']) {
      expect(
        contextErrors(`  context { compact_at: ${value} }`).some((e) =>
          e.message.includes('context.compact_at must be a fraction greater than 0 and at most 1'),
        ),
      ).toBe(true)
    }
  })

  test('accepts compact_at at the upper bound', () => {
    expect(contextErrors('  context { compact_at: 1 }')).toEqual([])
  })

  test('rejects a negative or fractional keep_recent_turns', () => {
    for (const value of ['-1', '2.5']) {
      expect(
        contextErrors(`  context { keep_recent_turns: ${value} }`).some((e) =>
          e.message.includes('context.keep_recent_turns must be a whole number of 0 or more'),
        ),
      ).toBe(true)
    }
  })

  test('accepts keep_recent_turns of zero', () => {
    expect(contextErrors('  context { keep_recent_turns: 0 }')).toEqual([])
  })

  test('rejects prune_tool_results_after below one', () => {
    expect(
      contextErrors('  context { prune_tool_results_after: 0 }').some((e) =>
        e.message.includes('context.prune_tool_results_after must be a whole number of 1 or more'),
      ),
    ).toBe(true)
  })

  test('rejects a cache_retention outside the tier list', () => {
    expect(
      contextErrors('  context { cache_retention: forever }').some((e) =>
        e.message.includes('context.cache_retention must be none, short, or long'),
      ),
    ).toBe(true)
  })

  test('accepts every cache_retention tier', () => {
    for (const tier of ['none', 'short', 'long']) {
      expect(contextErrors(`  context { cache_retention: ${tier} }`)).toEqual([])
    }
  })
})

describe('validateAgentBlocks maxTokens and temperature', () => {
  const samplingErrors = (body: string, provider = 'openrouter') => {
    const { ast } = parse(`
secret s { vars: [ OPENROUTER_API_KEY, ANTHROPIC_API_KEY ] }

agent support {
  provider: ${provider}
  model: "anthropic/claude-sonnet-5"
  secrets: s
${body}
}
`)

    return validateAgentBlocks(ast).filter(
      (e) => e.message.includes('maxTokens') || e.message.includes('temperature'),
    )
  }

  test('accepts a maxTokens of one and above', () => {
    expect(samplingErrors('  maxTokens: 1')).toEqual([])
    expect(samplingErrors('  maxTokens: 4096')).toEqual([])
  })

  test('rejects a maxTokens below one', () => {
    for (const value of ['0', '-1']) {
      expect(
        samplingErrors(`  maxTokens: ${value}`).some((e) =>
          e.message.includes('maxTokens must be a whole number of 1 or more'),
        ),
      ).toBe(true)
    }
  })

  test('rejects a fractional maxTokens', () => {
    expect(
      samplingErrors('  maxTokens: 100.5').some((e) =>
        e.message.includes('maxTokens must be a whole number of 1 or more'),
      ),
    ).toBe(true)
  })

  test('points the maxTokens diagnostic at the declared value', () => {
    const { ast } = parse(`
secret s { vars: [ OPENROUTER_API_KEY ] }

agent support {
  provider: openrouter
  model: "anthropic/claude-sonnet-5"
  secrets: s
  maxTokens: 0
}
`)

    const error = validateAgentBlocks(ast).find((e) => e.message.includes('maxTokens'))
    expect(error?.range.start.line).toBe(8)
  })

  test('accepts temperature across the full range for non-Anthropic providers', () => {
    for (const value of ['0', '1', '2']) {
      expect(samplingErrors(`  temperature: ${value}`)).toEqual([])
    }
  })

  test('rejects temperature outside 0 to 2', () => {
    for (const value of ['-0.1', '2.5']) {
      expect(
        samplingErrors(`  temperature: ${value}`).some((e) =>
          e.message.includes('temperature must be between 0 and 2'),
        ),
      ).toBe(true)
    }
  })

  test('caps temperature at 1 for the anthropic provider', () => {
    expect(samplingErrors('  temperature: 1', 'anthropic')).toEqual([])

    expect(
      samplingErrors('  temperature: 1.5', 'anthropic').some((e) =>
        e.message.includes('temperature must be between 0 and 1 for provider "anthropic"'),
      ),
    ).toBe(true)

    expect(
      samplingErrors('  temperature: 2', 'anthropic').some((e) =>
        e.message.includes('temperature must be between 0 and 1 for provider "anthropic"'),
      ),
    ).toBe(true)
  })
})

describe('agent computer', () => {
  const secret = 'secret s { vars: [ OPENAI_API_KEY ] }\n'

  function diagnostics(source: string) {
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    return validate(ast)
  }

  test('errors when computer names an undefined block, ranged on the value', () => {
    const source = `
${secret}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: missing
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])

    const found = validate(ast).find((diagnostic) =>
      diagnostic.message.includes('undefined computer'),
    )

    expect(found?.message).toBe('Agent "worker" references undefined computer block "missing"')
    expect(found?.severity ?? 'error').toBe('error')
    expect(found?.range).toEqual(ast.agent?.[0]?.computerRange)
  })

  test('errors when computer: names a harness computer, ranged on the value', () => {
    const source = `
${secret}
computer codex_box {
  harness: {
    type: coding
    provider: codex
  }
}

agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: codex_box
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])

    const found = validate(ast).find((diagnostic) =>
      diagnostic.message.includes('declares a harness'),
    )

    expect(found?.message).toBe(
      'Agent "worker" cannot bind computer "codex_box" because it declares a harness. Only shell nodes can bind a harness computer for now; bind a computer without a harness block',
    )

    expect(found?.severity ?? 'error').toBe('error')
    expect(found?.range).toEqual(ast.agent?.[0]?.computerRange)
  })

  test('accepts an agent and a shell node sharing a computer without a harness', () => {
    const messages = diagnostics(`
${secret}
computer box {}

agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: box
}
`).map((diagnostic) => diagnostic.message)

    expect(messages.some((message) => message.includes('declares a harness'))).toBe(false)
  })

  test('errors when computer: has no usable name', () => {
    for (const value of ['""', '[demo]']) {
      const source = `
${secret}
computer demo {}

agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: ${value}
}
`

      const { ast } = parse(source)
      expect(ast.agent?.[0]?.computer).toBe('')
      const messages = validate(ast).map((diagnostic) => diagnostic.message)
      expect(messages).toContain('Agent "worker" computer: must name a top-level computer block')
    }
  })

  test('resolves computer: from the workspace the same way shell does', () => {
    const source = `
${secret}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: remote_box
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const local = validateAgentBlocks(ast).map((diagnostic) => diagnostic.message)
    expect(local).toContain('Agent "worker" references undefined computer block "remote_box"')

    const workspace = {
      computerBlocks: new Map([['remote_box', { name: 'remote_box' }]]),
    } as unknown as WorkspaceResourceIndex

    const resolved = validateAgentBlocks(ast, { workspace }).map((diagnostic) => diagnostic.message)
    expect(resolved.some((message) => message.includes('undefined computer'))).toBe(false)
  })

  test('rejects sandbox and disks, including empty, when computer: is set', () => {
    const source = `
${secret}
computer pr_bot {}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: pr_bot
  sandbox: { }
  disks: []
  profile oncall {
    sandbox: { }
  }
  profile other {
    sandbox: { memoryMiB: 256 }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const agent = ast.agent?.[0]
    const found = validate(ast)

    const sandbox = found.find((diagnostic) =>
      diagnostic.message.includes('cannot set sandbox together'),
    )

    const disks = found.find((diagnostic) =>
      diagnostic.message.includes('cannot set disks together'),
    )

    const profiles = found.filter((diagnostic) =>
      diagnostic.message.includes('cannot set sandbox: when the agent'),
    )

    expect(sandbox?.message).toBe('Agent "worker" cannot set sandbox together with computer:')
    expect(sandbox?.range).toEqual(agent?.sandbox?.range)
    expect(disks?.message).toBe('Agent "worker" cannot set disks together with computer:')
    expect(disks?.range).toEqual(agent?.disksRange)

    expect(profiles.map((diagnostic) => diagnostic.message).sort()).toEqual([
      'Profile "oncall" of agent "worker" cannot set sandbox: when the agent sets computer:',
      'Profile "other" of agent "worker" cannot set sandbox: when the agent sets computer:',
    ])

    const oncallSandbox = agent?.profiles?.[0]?.sandbox?.range
    const otherSandbox = agent?.profiles?.[1]?.sandbox?.range
    expect(oncallSandbox).toBeDefined()
    expect(otherSandbox).toBeDefined()
    expect(profiles[0]?.range).toEqual(oncallSandbox)
    expect(profiles[1]?.range).toEqual(otherSandbox)

    expect(found.some((diagnostic) => diagnostic.message.includes('undefined computer'))).toBe(
      false,
    )
  })

  test('a computer: with no sandbox or disks is otherwise clean', () => {
    const found = diagnostics(`
${secret}
computer pr_bot {}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: pr_bot
  profile oncall {
    description: "On call"
  }
}
workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {} }
  }
}
`)

    expect(found).toEqual([])
  })

  test('rejects computer: on a profile', () => {
    const source = `
${secret}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  profile oncall {
    computer: pr_bot
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const found = validate(ast).filter((diagnostic) => diagnostic.message.includes('computer'))

    expect(found.map((diagnostic) => diagnostic.message)).toEqual([
      'Profile "oncall" cannot set computer:',
    ])

    expect(found[0]?.range).toEqual(ast.agent?.[0]?.profiles?.[0]?.computerRange)
  })

  test('a legacy agent with sandbox, disks, and a profile sandbox stays clean', () => {
    const found = diagnostics(`
${secret}
disk kb {}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  disks: [ kb ]
  sandbox: { cpus: 1, memoryMiB: 512 }
  profile oncall {
    description: "On call"
    sandbox: { autoStopMinutes: 5 }
  }
}
workflow g {
  label: "G"
  root {
    label: "R"
    type: code
    code: @ts { return {} }
  }
}
`)

    expect(found).toEqual([])
  })

  test('computer: on a type: agent node is stored and not diagnosed', () => {
    const body = (extra: string) => `
${secret}
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
}
workflow g {
  label: "G"
  root {
    label: "R"
    type: agent
    agent: worker
    prompt: @ts { return "hi" }
    ${extra}
  }
}
`

    const withComputer = parse(body('computer: pr_bot'))
    const withoutComputer = parse(body(''))
    expect(withComputer.errors).toEqual([])
    expect(withoutComputer.errors).toEqual([])

    expect(withComputer.ast.workflows[0]?.nodes[0]?.configFields.computer).toMatchObject({
      kind: 'string',
      value: 'pr_bot',
    })

    expect(validate(withComputer.ast).map((diagnostic) => diagnostic.message)).toEqual(
      validate(withoutComputer.ast).map((diagnostic) => diagnostic.message),
    )
  })
})

describe('agent provider default', () => {
  test('omitted provider is openrouter and requires its secret var', () => {
    const source = `
secret ai_creds {
  vars: [ OPENROUTER_API_KEY ]
}

agent operator {
  model: "anthropic/claude-sonnet-4.5"
  secrets: ai_creds
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.agent?.[0]?.provider).toBe('openrouter')
    expect(validate(ast)).toEqual([])
  })

  test('omitted provider rejects a secret that lacks the OpenRouter key', () => {
    const source = `
secret ai_creds {
  vars: [ OPENAI_API_KEY ]
}

agent operator {
  model: "gpt-4o"
  secrets: ai_creds
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const messages = validate(ast).map((diagnostic) => diagnostic.message)

    expect(messages).toContain(
      'Agent "operator" secret block must declare "OPENROUTER_API_KEY" for provider "openrouter"',
    )

    expect(messages.some((message) => message.includes('Invalid agent provider'))).toBe(false)
  })

  test('an explicit provider still selects that vendor key', () => {
    const source = `
secret ai_creds {
  vars: [ OPENAI_API_KEY ]
}

agent operator {
  provider: openai
  model: "gpt-4o"
  secrets: ai_creds
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(validate(ast)).toEqual([])
    expect(ast.agent?.[0]?.provider).toBe('openai')
  })
})
