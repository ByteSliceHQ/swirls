import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'

describe('channel parsing', () => {
  test('parses channel block with all fields', () => {
    const source = `
channel support_slack {
  label: "Support bot"
  platform: slack
  agent: concierge
  enabled: true
  mode: mention
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.channels.length).toBe(1)
    const ch = ast.channels[0]!
    expect(ch.name).toBe('support_slack')
    expect(ch.label).toBe('Support bot')
    expect(ch.platform).toBe('slack')
    expect(ch.agent).toBe('concierge')
    expect(ch.enabled).toBe(true)
    expect(ch.mode).toBe('mention')
  })

  test('defaults mode to mention', () => {
    const source = `
channel linear_bot {
  label: "Linear"
  platform: linear
  agent: researcher
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.channels[0]?.mode).toBe('mention')
  })

  test('errors on unknown integration property', () => {
    const source = `
channel support_slack {
  platform: slack
  agent: concierge
  integration: slack
}
`

    const { errors } = parse(source)
    expect(errors.some((e) => /Unknown channel property "integration"/.test(e.message))).toBe(true)
  })

  test('parses platform mcp with a connector field', () => {
    const source = `
channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const ch = ast.channels[0]!
    expect(ch.platform).toBe('mcp')
    expect(ch.agent).toBe('finance_guy')
    expect(ch.connector).toBe('client_portal')
  })

  test('parses mode ambient with the full response policy', () => {
    const source = `
channel ops {
  label: "Ops room"
  platform: swirls
  agent: support
  mode: ambient
  engagement_timeout: "30m"
  cooldown: "15s"
  max_unprompted_per_hour: 6
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const ch = ast.channels[0]
    expect(ch?.mode).toBe('ambient')
    expect(ch?.engagementTimeout).toBe('30m')
    expect(ch?.cooldown).toBe('15s')
    expect(ch?.maxUnpromptedPerHour).toBe(6)
    expect(ch?.engagementTimeoutRange).toBeDefined()
    expect(ch?.cooldownRange).toBeDefined()
    expect(ch?.maxUnpromptedPerHourRange).toBeDefined()
  })

  test('parses a partial response policy and leaves the rest absent', () => {
    const source = `
channel ops {
  platform: swirls
  agent: support
  cooldown: "1h"
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const ch = ast.channels[0]
    expect(ch?.cooldown).toBe('1h')
    expect(ch?.engagementTimeout).toBeUndefined()
    expect(ch?.maxUnpromptedPerHour).toBeUndefined()
  })

  test('leaves the response policy absent when nothing is declared', () => {
    const source = `
channel ops {
  platform: swirls
  agent: support
  mode: all
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const ch = ast.channels[0]
    expect(ch?.engagementTimeout).toBeUndefined()
    expect(ch?.engagementTimeoutRange).toBeUndefined()
    expect(ch?.cooldown).toBeUndefined()
    expect(ch?.maxUnpromptedPerHour).toBeUndefined()
  })

  test('accepts max_unprompted_per_hour of zero', () => {
    const source = `
channel ops {
  platform: swirls
  agent: support
  max_unprompted_per_hour: 0
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.channels[0]?.maxUnpromptedPerHour).toBe(0)
  })

  test('points an unquoted duration at the quoting and keeps parsing the block', () => {
    const source = `
channel ops {
  platform: swirls
  agent: support
  engagement_timeout: 30m
  max_unprompted_per_hour: 6
}
`

    const { ast, errors } = parse(source)
    expect(errors.some((e) => /quote it as "30m"/.test(e.message))).toBe(true)
    // The stray unit token is consumed, so the keys after it still land.
    expect(ast.channels[0]?.maxUnpromptedPerHour).toBe(6)
    expect(ast.channels[0]?.engagementTimeout).toBeUndefined()
  })

  test('rejects a non-duration cooldown value', () => {
    const source = `
channel ops {
  platform: swirls
  agent: support
  cooldown: true
}
`

    const { ast, errors } = parse(source)

    expect(errors.some((e) => /channel cooldown must be a quoted duration/.test(e.message))).toBe(
      true,
    )

    expect(ast.channels[0]?.cooldown).toBeUndefined()
  })

  test('rejects a non-numeric max_unprompted_per_hour', () => {
    const source = `
channel ops {
  platform: swirls
  agent: support
  max_unprompted_per_hour: "six"
}
`

    const { ast, errors } = parse(source)

    expect(
      errors.some((e) => /max_unprompted_per_hour must be a whole number/.test(e.message)),
    ).toBe(true)

    expect(ast.channels[0]?.maxUnpromptedPerHour).toBeUndefined()
  })

  test('does not set connector or modeRange when absent', () => {
    const source = `
channel finance {
  platform: mcp
  agent: finance_guy
  connector: client_portal
}
`

    const { ast } = parse(source)
    const ch = ast.channels[0]!
    expect(ch.modeRange).toBeUndefined()
    expect(ch.connectorRange).toBeDefined()
  })

  test('rejects the renamed portal platform', () => {
    const source = `
channel ops {
  platform: portal
  agent: support
}
`

    const { ast, errors } = parse(source)

    expect(
      errors.some((e) => e.message.includes('channel platform "portal" was renamed to "swirls"')),
    ).toBe(true)

    expect(ast.channels[0]?.platform).not.toBe('portal')
  })
})
