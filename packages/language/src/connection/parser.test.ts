import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'
import { buildWorkspaceResourceIndex } from '../workspace/workspace-resources'

describe('connection parsing', () => {
  test('parses a connection block', () => {
    const source = `
connection slack_sales {
  label: "Sales Slack"
  provider: slack
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.connections.length).toBe(1)
    const c = ast.connections[0]!
    expect(c.name).toBe('slack_sales')
    expect(c.label).toBe('Sales Slack')
    expect(c.provider).toBe('slack')
  })

  test('errors when provider is missing (validator, single source of truth)', () => {
    const source = `
connection broken {
  label: "x"
}
`
    const { ast, errors } = parse(source)
    expect(ast.connections.length).toBe(1)
    // The parser no longer double-reports the missing provider; the validator
    // is the single source of truth.
    expect(errors.some((e) => /provider/i.test(e.message))).toBe(false)
    const diags = validate(ast)
    expect(diags.some((d) => /requires a provider/.test(d.message))).toBe(true)
  })

  test('allows multiple connections of the same provider', () => {
    const { ast, errors } = parse(`
connection slack_sales { provider: slack }
connection slack_support { provider: slack }
`)
    expect(errors).toEqual([])
    expect(ast.connections.map((c) => c.name)).toEqual([
      'slack_sales',
      'slack_support',
    ])
  })
})

describe('connection validation', () => {
  test('accepts a supported provider', () => {
    const { ast } = parse(`connection c { provider: linear }`)
    const diags = validate(ast)
    expect(diags).toEqual([])
  })

  test('parses and validates a self-managed connection', () => {
    const source = `
secret petstore_secrets {
  vars: [PETSTORE_TOKEN]
}
auth petstore_bearer {
  type: bearer
  secrets: petstore_secrets
  token: PETSTORE_TOKEN
}
connection petstore {
  provider: petstore
  base_url: "https://petstore.example.com/v2"
  auth: petstore_bearer
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const c = ast.connections[0]!
    expect(c.provider).toBe('petstore')
    expect(c.baseUrl).toBe('https://petstore.example.com/v2')
    expect(c.authRef).toBe('petstore_bearer')
    const diags = validate(ast, {
      host: { providers: new Set(['slack']) },
    })
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    expect(
      diags.filter((d) => /not in the integration catalog/.test(d.message)),
    ).toEqual([])
  })

  test('a provider outside the host catalog warns; with no host it is accepted', () => {
    const { ast, errors } = parse(`
connection crm {
  provider: acme_crm
}
`)
    expect(errors).toEqual([])
    const isCatalogWarning = (d: { message: string; severity?: string }) =>
      d.severity === 'warning' &&
      /not in the integration catalog/.test(d.message)

    expect(validate(ast).filter(isCatalogWarning)).toEqual([])
    expect(
      validate(ast, { host: { providers: new Set(['slack']) } }).filter(
        isCatalogWarning,
      ),
    ).toHaveLength(1)
    expect(
      validate(ast, { host: { providers: new Set(['acme_crm']) } }).filter(
        isCatalogWarning,
      ),
    ).toEqual([])
  })

  test('self-managed connection requires both base_url and auth', () => {
    const { ast } = parse(`
connection petstore {
  provider: petstore
  base_url: "https://petstore.example.com/v2"
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => /requires both base_url and auth/.test(d.message)),
    ).toBe(true)
  })

  test('self-managed connection must resolve auth block', () => {
    const { ast } = parse(`
connection petstore {
  provider: petstore
  base_url: "https://petstore.example.com/v2"
  auth: missing_auth
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) =>
        /references undefined auth block "missing_auth"/.test(d.message),
      ),
    ).toBe(true)
  })

  test('rejects an unsupported provider', () => {
    const { ast } = parse(`connection c { provider: "!!!" }`)
    const diags = validate(ast)
    expect(diags.some((d) => /provider "!!!"/.test(d.message))).toBe(true)
  })

  test('flags duplicate connection names', () => {
    const { ast } = parse(`
connection dup { provider: slack }
connection dup { provider: linear }
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => /Duplicate connection block name/.test(d.message)),
    ).toBe(true)
  })

  test('http node may reference a connection by name', () => {
    const { ast } = parse(`
connection slack_sales { provider: slack }
workflow w {
  label: "w"
  root {
    type: http
    label: "post"
    url: "https://slack.com/api/chat.postMessage"
    connection: slack_sales
  }
}
`)
    const diags = validate(ast)
    expect(diags).toEqual([])
  })

  test('http node referencing an unknown connection errors', () => {
    const { ast } = parse(`
workflow w {
  label: "w"
  root {
    type: http
    label: "post"
    url: "https://example.com"
    connection: missing
  }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => /undefined connection "missing"/.test(d.message)),
    ).toBe(true)
  })

  test('auth and connection on the same node are mutually exclusive', () => {
    const { ast } = parse(`
connection slack_sales { provider: slack }
auth my_key { label: "k" type: bearer token: TOKEN }
workflow w {
  label: "w"
  root {
    type: http
    label: "post"
    url: "https://example.com"
    auth: my_key
    connection: slack_sales
  }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => /set "auth" or "connection", not both/.test(d.message)),
    ).toBe(true)
  })

  test('connection is only valid on http nodes', () => {
    const { ast } = parse(`
connection slack_sales { provider: slack }
workflow w {
  label: "w"
  root {
    type: code
    label: "step"
    code: @ts { return {} }
    connection: slack_sales
  }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) =>
        /"connection" is only valid on http and integration nodes/.test(
          d.message,
        ),
      ),
    ).toBe(true)
  })

  test('channel may reference a connection whose provider matches platform', () => {
    const { ast } = parse(`
connection slack_sales { provider: slack }
agent triage { provider: anthropic model: "claude" }
channel sales {
  label: "Sales"
  platform: slack
  agent: triage
  connection: slack_sales
}
`)
    const diags = validate(ast)
    expect(diags.filter((d) => /connection/i.test(d.message))).toEqual([])
  })

  test('channel connection provider must match platform', () => {
    const { ast } = parse(`
connection slack_sales { provider: slack }
agent triage { provider: anthropic model: "claude" }
channel sales {
  label: "Sales"
  platform: linear
  agent: triage
  connection: slack_sales
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) => /must match platform "linear"/.test(d.message)),
    ).toBe(true)
  })
})

describe('connection serialization', () => {
  test('round-trips a connection block', () => {
    const source = `connection slack_sales {
  label: "Sales Slack"
  provider: slack
}
`
    const { ast } = parse(source)
    const out = serialize(ast)
    const reparsed = parse(out)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.ast.connections[0]?.name).toBe('slack_sales')
    expect(reparsed.ast.connections[0]?.provider).toBe('slack')
    expect(reparsed.ast.connections[0]?.label).toBe('Sales Slack')
  })

  test('round-trips a self-managed connection block', () => {
    const source = `secret petstore_secrets {
  vars: [PETSTORE_TOKEN]
}
auth petstore_bearer {
  type: bearer
  secrets: petstore_secrets
  token: PETSTORE_TOKEN
}
connection petstore {
  label: "Petstore"
  provider: petstore
  base_url: "https://petstore.example.com/v2"
  auth: petstore_bearer
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const out = serialize(ast)
    expect(out).toContain('base_url: "https://petstore.example.com/v2"')
    expect(out).toContain('auth: petstore_bearer')
    const reparsed = parse(out)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.ast.connections[0]?.baseUrl).toBe(
      'https://petstore.example.com/v2',
    )
    expect(reparsed.ast.connections[0]?.authRef).toBe('petstore_bearer')
    expect(
      validate(reparsed.ast).filter((d) => d.severity === 'error'),
    ).toEqual([])
  })

  test('serialize emits channel blocks and round-trips connection bindings', () => {
    const source = `connection slack_sales {
  label: "Sales Slack"
  provider: slack
}
agent triage {
  provider: anthropic
  model: "claude"
}
channel sales {
  label: "Sales"
  platform: slack
  agent: triage
  connection: slack_sales
  mode: dm
}
`
    const { ast, errors } = parse(source)
    expect(errors).toEqual([])

    const out = serialize(ast)
    expect(out).toContain('channel sales {')

    const reparsed = parse(out)
    expect(reparsed.errors).toEqual([])
    const ch = reparsed.ast.channels[0]
    expect(ch?.name).toBe('sales')
    expect(ch?.platform).toBe('slack')
    expect(ch?.agent).toBe('triage')
    expect(ch?.connection).toBe('slack_sales')
    expect(ch?.mode).toBe('dm')
    // The channel→connection binding survives validation after the round-trip.
    expect(
      validate(reparsed.ast).filter((d) => /connection/i.test(d.message)),
    ).toEqual([])
  })
})

describe('connection parser hardening', () => {
  test('emits an error for an unclosed connection block at EOF', () => {
    const { errors } = parse(`connection broken {
  provider: slack`)
    expect(
      errors.some((e) => /Expected } to close connection/.test(e.message)),
    ).toBe(true)
  })

  test('flags a duplicate provider field', () => {
    const { errors } = parse(`connection dup {
  provider: slack
  provider: linear
}
`)
    expect(
      errors.some((e) =>
        /Duplicate connection property "provider"/.test(e.message),
      ),
    ).toBe(true)
  })

  test('errors on a non-string connection value on an http node', () => {
    const { ast } = parse(`
connection slack_sales { provider: slack }
workflow w {
  label: "w"
  root {
    type: http
    label: "post"
    url: "https://example.com"
    connection: 123
  }
}
`)
    const diags = validate(ast)
    expect(
      diags.some((d) =>
        /"connection" must be a connection block name/.test(d.message),
      ),
    ).toBe(true)
  })

  test('errors on a missing channel connection value', () => {
    const { errors } = parse(`
agent triage { provider: anthropic model: "claude" }
channel sales {
  platform: slack
  agent: triage
  connection:
}
`)
    expect(
      errors.some((e) =>
        /channel connection must be a connection block name/.test(e.message),
      ),
    ).toBe(true)
  })
})

describe('connection references inside subgraph nodes', () => {
  test('http node in a map subgraph validates its connection ref', () => {
    const { ast, errors } = parse(`
schema item_shape { label: "i" schema: @json { { "type": "object" } } }
workflow w {
  label: "w"
  root {
    type: code
    label: "seed"
    code: @ts { return {} }
  }
  node map_each {
    type: map
    label: "fan"
    items: @ts { return [] }
    maxItems: 10
    subgraph {
      root {
        type: http
        label: "post"
        inputSchema: item_shape
        url: "https://example.com"
        connection: missing_conn
      }
    }
  }
  flow {
    root -> map_each
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(
      diags.some((d) => /undefined connection "missing_conn"/.test(d.message)),
    ).toBe(true)
  })

  test('http node in a map subgraph resolves a defined connection', () => {
    const { ast, errors } = parse(`
connection slack_sales { provider: slack }
schema item_shape { label: "i" schema: @json { { "type": "object" } } }
workflow w {
  label: "w"
  root {
    type: code
    label: "seed"
    code: @ts { return {} }
  }
  node map_each {
    type: map
    label: "fan"
    items: @ts { return [] }
    maxItems: 10
    subgraph {
      root {
        type: http
        label: "post"
        inputSchema: item_shape
        url: "https://example.com"
        connection: slack_sales
      }
    }
  }
  flow {
    root -> map_each
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(diags.filter((d) => /undefined connection/.test(d.message))).toEqual(
      [],
    )
  })
})

describe('connection cross-file resolution', () => {
  test('node and channel connection refs resolve across files via workspace', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-conn-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'connections.swirls'),
        `connection slack_sales {
  label: "Sales Slack"
  provider: slack
}
`,
        'utf-8',
      )
      fs.writeFileSync(
        path.join(dir, 'consumer.swirls'),
        `agent triage {
  provider: anthropic
  model: "claude"
}
channel sales {
  platform: slack
  agent: triage
  connection: slack_sales
}
workflow w {
  label: "w"
  root {
    type: http
    label: "post"
    url: "https://slack.com/api/chat.postMessage"
    connection: slack_sales
  }
}
`,
        'utf-8',
      )

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const consumer = fs.readFileSync(
        path.join(dir, 'consumer.swirls'),
        'utf-8',
      )
      const { ast, errors } = parse(consumer)
      expect(errors).toEqual([])

      // Without the workspace, the connection lives in another file and fails.
      const diagsLocal = validate(ast)
      expect(
        diagsLocal.some((d) =>
          /undefined connection "slack_sales"/.test(d.message),
        ),
      ).toBe(true)

      // With the workspace index, both the node and channel refs resolve, and
      // the provider-match check (slack == slack) passes.
      const diagsWs = validate(ast, { workspace })
      expect(diagsWs.filter((d) => /connection/i.test(d.message))).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('cross-file channel connection provider mismatch is reported', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-conn-mm-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'connections.swirls'),
        `connection slack_sales { provider: slack }
`,
        'utf-8',
      )
      fs.writeFileSync(
        path.join(dir, 'consumer.swirls'),
        `agent triage { provider: anthropic model: "claude" }
channel sales {
  platform: linear
  agent: triage
  connection: slack_sales
}
`,
        'utf-8',
      )

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const { ast } = parse(
        fs.readFileSync(path.join(dir, 'consumer.swirls'), 'utf-8'),
      )
      const diagsWs = validate(ast, { workspace })
      expect(
        diagsWs.some((d) => /must match platform "linear"/.test(d.message)),
      ).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
