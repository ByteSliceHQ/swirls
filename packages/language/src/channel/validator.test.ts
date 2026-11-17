import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { validateChannelBlocks } from './validator'

describe('validateChannelBlocks', () => {
  test('allows multiple enabled bindings for same platform and mode with different agents', () => {
    const source = `
agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

agent researcher {
  label: "Researcher"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel support_slack {
  label: "Support"
  platform: slack
  agent: concierge
  mode: mention
}

channel research_slack {
  label: "Research"
  platform: slack
  agent: researcher
  mode: mention
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(errors).toEqual([])
  })

  test('rejects duplicate platform, mode, and agent bindings', () => {
    const source = `
agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel support_slack {
  label: "Support A"
  platform: slack
  agent: concierge
  mode: mention
}

channel support_slack_two {
  label: "Support B"
  platform: slack
  agent: concierge
  mode: mention
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.message).toContain('Duplicate channel routing')
  })

  test('allows multiple enabled web channels for the same agent', () => {
    const source = `
agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel web_support {
  label: "Support chatbox"
  platform: web
  agent: concierge
}

channel web_sales {
  label: "Sales chatbox"
  platform: web
  agent: concierge
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(errors).toEqual([])
  })

  test('rejects duplicate enabled web channel names', () => {
    const source = `
agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel web_concierge {
  label: "Web A"
  platform: web
  agent: concierge
}

channel web_concierge {
  label: "Web B"
  platform: web
  agent: concierge
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.message).toContain('Duplicate channel name')
  })

  test('does not require mode on web channels', () => {
    const source = `
agent concierge {
  label: "Concierge"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

channel web_concierge {
  label: "Web"
  platform: web
  agent: concierge
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(errors).toEqual([])
  })

  const mcpAgent = `
agent finance_guy {
  label: "Finance"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}

connector client_portal {
  label: "Client connector"
}
`

  test('accepts an mcp channel referencing a declared connector', () => {
    const source = `${mcpAgent}
channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
}
`
    const { ast } = parse(source)
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('(a) requires a connector on mcp channels', () => {
    const source = `${mcpAgent}
channel finance {
  platform: mcp
  agent: finance_guy
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) =>
        e.message.includes('with platform "mcp" must declare a connector'),
      ),
    ).toBe(true)
  })

  test('(a) forbids connection and explicit mode on mcp channels', () => {
    const source = `${mcpAgent}
connection slack_creds {
  provider: slack
}

channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
  connection: slack_creds
  mode: dm
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) => e.message.includes('must not declare a connection')),
    ).toBe(true)
    expect(
      errors.some((e) => e.message.includes('must not declare a mode')),
    ).toBe(true)
  })

  test('(b) forbids connector on non-mcp channels', () => {
    const source = `${mcpAgent}
channel finance {
  platform: slack
  agent: finance_guy
  connector: client_portal
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) =>
        e.message.includes('"connector:" is only valid for platform "mcp"'),
      ),
    ).toBe(true)
  })

  const portalAgent = `
agent triage {
  label: "Triage"
  provider: openrouter
  model: "openai/gpt-4o-mini"
}
`

  test('accepts a portal channel and defaults its mode to mention', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.channels[0]?.platform).toBe('swirls')
    expect(ast.channels[0]?.mode).toBe('mention')
    expect(ast.channels[0]?.modeRange).toBeUndefined()
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('accepts mode all on a portal channel', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
  mode: all
}
`
    const { ast } = parse(source)
    expect(ast.channels[0]?.mode).toBe('all')
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('rejects mode dm on a portal channel', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
  mode: dm
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) =>
        e.message.includes('with platform "swirls" does not support mode "dm"'),
      ),
    ).toBe(true)
  })

  test('requires an agent on a portal channel', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) =>
        e.message.includes('with platform "swirls" must declare an agent'),
      ),
    ).toBe(true)
    expect(
      errors.some((e) => e.message.includes('references unknown agent')),
    ).toBe(false)
  })

  test('allows several portal rooms fronted by the same agent', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
}

channel escalations {
  platform: swirls
  agent: triage
}
`
    const { ast } = parse(source)
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('rejects duplicate enabled portal channel names', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
}

channel support {
  platform: swirls
  agent: triage
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.message).toContain('Duplicate channel name')
  })

  test('accepts mode ambient on a portal channel', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
  mode: ambient
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.channels[0]?.mode).toBe('ambient')
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('rejects mode ambient on every platform that is not portal yet', () => {
    for (const platform of ['slack', 'linear', 'discord', 'web']) {
      const source = `${portalAgent}
channel support {
  platform: ${platform}
  agent: triage
  mode: ambient
}
`
      const { ast } = parse(source)
      const errors = validateChannelBlocks(ast)
      expect(
        errors.some((e) =>
          e.message.includes(
            `with platform "${platform}" does not support mode "ambient" yet`,
          ),
        ),
      ).toBe(true)
    }
  })

  test('leaves an mcp channel with its own mode diagnostic rather than the ambient one', () => {
    const source = `${mcpAgent}
channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
  mode: ambient
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) =>
        e.message.includes('with platform "mcp" must not declare a mode'),
      ),
    ).toBe(true)
    expect(errors.some((e) => e.message.includes('mode "ambient"'))).toBe(false)
  })

  test('accepts a full response policy on a portal channel', () => {
    const source = `${portalAgent}
channel support {
  platform: swirls
  agent: triage
  mode: ambient
  engagement_timeout: "30m"
  cooldown: "15s"
  max_unprompted_per_hour: 6
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('accepts a response policy on a third-party platform', () => {
    const source = `${portalAgent}
channel support {
  platform: slack
  agent: triage
  mode: mention
  engagement_timeout: "30m"
  cooldown: "15s"
  max_unprompted_per_hour: 6
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(validateChannelBlocks(ast)).toEqual([])
  })

  test('rejects every response-policy knob on an mcp channel', () => {
    const source = `${mcpAgent}
channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
  engagement_timeout: "30m"
  cooldown: "15s"
  max_unprompted_per_hour: 6
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const messages = validateChannelBlocks(ast).map((e) => e.message)
    for (const key of [
      'engagement_timeout',
      'cooldown',
      'max_unprompted_per_hour',
    ]) {
      expect(
        messages.some(
          (m) =>
            m.includes(`with platform "mcp" must not declare "${key}"`) &&
            m.includes('shares a room with people'),
        ),
      ).toBe(true)
    }
  })

  const portalChannelWith = (body: string) => {
    const { ast, errors } = parse(`${portalAgent}
channel support {
  platform: swirls
  agent: triage
${body}
}
`)
    expect(errors).toEqual([])
    return ast
  }

  test('accepts engagement_timeout at the one-day ceiling and rejects a step past it', () => {
    expect(
      validateChannelBlocks(portalChannelWith('  engagement_timeout: "24h"')),
    ).toEqual([])
    expect(
      validateChannelBlocks(
        portalChannelWith('  engagement_timeout: "1441m"'),
      ).some((e) => e.message.includes('engagement_timeout must be at most')),
    ).toBe(true)
  })

  test('rejects a zero engagement_timeout', () => {
    expect(
      validateChannelBlocks(
        portalChannelWith('  engagement_timeout: "0s"'),
      ).some((e) =>
        e.message.includes('engagement_timeout must be longer than zero'),
      ),
    ).toBe(true)
  })

  test('accepts a zero cooldown and rejects one past the ceiling', () => {
    expect(
      validateChannelBlocks(portalChannelWith('  cooldown: "0s"')),
    ).toEqual([])
    expect(
      validateChannelBlocks(portalChannelWith('  cooldown: "24h"')),
    ).toEqual([])
    expect(
      validateChannelBlocks(portalChannelWith('  cooldown: "25h"')).some((e) =>
        e.message.includes('cooldown must be at most'),
      ),
    ).toBe(true)
  })

  test('rejects a duration literal that does not match the grammar', () => {
    // The parser already refuses unquoted and non-string values, so the
    // remaining path into this check is a quoted literal with a bad unit.
    for (const literal of [
      '30 minutes',
      '30',
      'thirty',
      '30d',
      '1.5h',
      '-5m',
    ]) {
      const ast = portalChannelWith(`  cooldown: "${literal}"`)
      expect(
        validateChannelBlocks(ast).some((e) =>
          e.message.includes('cooldown must be a quoted duration'),
        ),
      ).toBe(true)
    }
  })

  test('accepts max_unprompted_per_hour of zero and rejects negatives or fractions', () => {
    expect(
      validateChannelBlocks(portalChannelWith('  max_unprompted_per_hour: 0')),
    ).toEqual([])
    for (const value of ['-1', '2.5']) {
      expect(
        validateChannelBlocks(
          portalChannelWith(`  max_unprompted_per_hour: ${value}`),
        ).some((e) =>
          e.message.includes(
            'max_unprompted_per_hour must be a whole number of 0 or more',
          ),
        ),
      ).toBe(true)
    }
  })

  test('(c) flags an unknown connector reference', () => {
    const source = `${mcpAgent}
channel finance {
  platform: mcp
  agent: finance_guy
  connector: missing_connector
}
`
    const { ast } = parse(source)
    const errors = validateChannelBlocks(ast)
    expect(
      errors.some((e) =>
        e.message.includes('references unknown connector "missing_connector"'),
      ),
    ).toBe(true)
  })
})
