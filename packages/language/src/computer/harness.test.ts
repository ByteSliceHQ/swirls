import { describe, expect, test } from 'bun:test'
import { SWIRLS_HARNESSES, swirlsHost } from '../index'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'

function errorMessages(src: string): string[] {
  return parse(src).errors.map((error) => error.message)
}

function diagnostics(src: string) {
  const { ast, errors } = parse(src)
  expect(errors).toEqual([])
  return validate(ast, { host: swirlsHost })
}

const HARNESS_PROVIDERS = SWIRLS_HARNESSES.providers.map((entry) => entry.name)

describe('swirls harness catalog', () => {
  test('lists the coding type and four providers', () => {
    expect(SWIRLS_HARNESSES.types.map((entry) => entry.name)).toEqual([
      'coding',
    ])
    expect(HARNESS_PROVIDERS).toEqual(['claude', 'codex', 'pi', 'hermes'])
  })

  test('maps every provider to its package', () => {
    expect(
      Object.fromEntries(
        SWIRLS_HARNESSES.providers.map((entry) => [entry.name, entry.package]),
      ),
    ).toEqual({
      claude: 'claude-code',
      codex: 'codex',
      pi: 'pi-coding-agent',
      hermes: 'hermes-agent',
    })
  })
})

describe('harness parsing', () => {
  test('parses a harness block with bare names', () => {
    const { ast, errors } = parse(`computer codex_box {
  harness: {
    type: coding
    provider: codex
  }
  software: { gh: "2.63.2" }
}
`)
    expect(errors).toEqual([])
    const harness = ast.computer[0]?.harness
    expect(harness?.type).toBe('coding')
    expect(harness?.provider).toBe('codex')
    expect(harness?.typeRange.start).toMatchObject({ line: 3, column: 11 })
    expect(harness?.providerRange.start).toMatchObject({ line: 4, column: 15 })
    expect(harness?.range.start).toMatchObject({ line: 2, column: 3 })
    expect(harness?.range.end.line).toBe(5)
    expect(ast.computer[0]?.software?.[0]?.packageName).toBe('gh')
  })

  test('accepts every provider and comma separated keys', () => {
    for (const provider of HARNESS_PROVIDERS) {
      const { ast, errors } = parse(
        `computer box {\n  harness: { provider: ${provider}, type: coding }\n}\n`,
      )
      expect(errors).toEqual([])
      expect(ast.computer[0]?.harness?.provider).toBe(provider)
    }
  })

  test('a computer without a harness has none', () => {
    const { ast, errors } = parse('computer box {}\n')
    expect(errors).toEqual([])
    expect(ast.computer[0]?.harness).toBeUndefined()
  })

  test('the parser accepts any bare name: the catalog is the host\'s', () => {
    const { ast, errors } = parse(
      'computer box {\n  harness: { type: chat, provider: gemini }\n}\n',
    )
    expect(errors).toEqual([])
    expect(ast.computer[0]?.harness).toMatchObject({
      type: 'chat',
      provider: 'gemini',
    })
  })

  test('with a host, an unknown provider lists the allowed names', () => {
    const found = diagnostics(
      'computer box {\n  harness: { type: coding, provider: gemini }\n}\n',
    )
    expect(found.map((d) => d.message)).toEqual([
      'Unknown harness provider "gemini"; expected one of claude, codex, pi, hermes',
    ])
    expect(found[0]?.range.start).toMatchObject({ line: 2, column: 38 })
  })

  test('with a host, an unknown type lists the allowed names', () => {
    expect(
      diagnostics(
        'computer box {\n  harness: { type: chat, provider: codex }\n}\n',
      ).map((d) => d.message),
    ).toEqual(['Unknown harness type "chat"; expected one of coding'])
  })

  test('with no host, harness names are not checked', () => {
    const { ast } = parse(
      'computer box {\n  harness: { type: chat, provider: gemini }\n}\n',
    )
    expect(validate(ast)).toEqual([])
  })

  test('a host can bring its own catalog', () => {
    const { ast } = parse(
      'computer box {\n  harness: { type: coding, provider: gemini }\n}\n',
    )
    const host = {
      harnesses: {
        types: [{ name: 'coding' }],
        providers: [{ name: 'gemini', package: 'gemini-cli' }],
      },
    }
    expect(validate(ast, { host })).toEqual([])
  })

  test('quoted values are rejected', () => {
    expect(
      errorMessages(
        'computer box {\n  harness: { type: coding, provider: "codex" }\n}\n',
      ),
    ).toEqual(['harness.provider must be a bare name, not a quoted string'])
  })

  test('versions are not a harness property', () => {
    const { errors } = parse(
      'computer box {\n  harness: { type: coding, provider: codex, version: "1.0" }\n}\n',
    )
    expect(errors.map((error) => error.message)).toEqual([
      'Unknown harness property "version"; expected type, provider',
    ])
    expect(errors[0]?.range.start).toMatchObject({ line: 2, column: 45 })
  })

  test('missing type and provider are errors on the harness key', () => {
    const { errors } = parse('computer box {\n  harness: { }\n}\n')
    expect(errors.map((error) => error.message)).toEqual([
      'harness requires "type"',
      'harness requires "provider"',
    ])
    expect(errors[0]?.range.start).toMatchObject({ line: 2, column: 3 })
  })

  test('duplicate keys inside the block are errors', () => {
    const { errors } = parse(
      'computer box {\n  harness: { type: coding, provider: codex, provider: pi }\n}\n',
    )
    expect(errors.map((error) => error.message)).toEqual([
      'Duplicate harness property "provider"',
    ])
    expect(errors[0]?.range.start).toMatchObject({ line: 2, column: 45 })
  })

  test('a second harness block in one computer is an error', () => {
    const { ast, errors } = parse(`computer box {
  harness: { type: coding, provider: codex }
  harness: { type: coding, provider: claude }
}
`)
    expect(errors.map((error) => error.message)).toEqual([
      'Computer "box" declares more than one harness block',
    ])
    expect(errors[0]?.range.start).toMatchObject({ line: 3, column: 3 })
    expect(ast.computer[0]?.harness?.provider).toBe('codex')
  })

  test('a harness that is not a block is an error', () => {
    const { ast, errors } = parse(
      'computer box {\n  harness: codex\n  software: { gh: "2.63.2" }\n}\n',
    )
    expect(errors.map((error) => error.message)).toEqual([
      'harness: expected { type: coding, provider: <name> }',
    ])
    expect(ast.computer[0]?.software?.[0]?.packageName).toBe('gh')
  })
})

describe('harness serialization', () => {
  test('round-trips the harness block', () => {
    const src = `computer codex_box {
  harness: {
    type: coding
    provider: codex
  }
  software: { gh: "2.63.2" }
  resources: { cpus: 2, memoryMiB: 4096 }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const text = serialize(ast)
    expect(text).toContain('  harness: { type: coding, provider: codex }')
    const again = parse(text)
    expect(again.errors).toEqual([])
    expect(again.ast.computer[0]?.harness).toMatchObject({
      type: 'coding',
      provider: 'codex',
    })
    expect(again.ast.computer[0]?.software?.[0]?.pin).toBe('2.63.2')
  })

  test('quotes software names that are not bare identifiers', () => {
    const { ast, errors } = parse(
      'computer box {\n  software: { "pi-coding-agent": "0.5.0", gh: "2.63.2" }\n}\n',
    )
    expect(errors).toEqual([])
    const text = serialize(ast)
    expect(text).toContain(
      'software: { "pi-coding-agent": "0.5.0", gh: "2.63.2" }',
    )
    expect(
      parse(text).ast.computer[0]?.software?.map((pin) => pin.packageName),
    ).toEqual(['pi-coding-agent', 'gh'])
  })

  test('omits the harness line for computers without one', () => {
    const { ast } = parse('computer box {\n  software: { gh: "2.63.2" }\n}\n')
    expect(serialize(ast)).not.toContain('harness')
  })
})

describe('harness validation', () => {
  test('a well sized harness computer is clean', () => {
    expect(
      diagnostics(`computer box {
  harness: { type: coding, provider: claude }
  software: { gh: "2.63.2" }
  resources: { cpus: 2, memoryMiB: 4096 }
}
`),
    ).toEqual([])
  })

  test('the provider package in software: is an error', () => {
    for (const { name: provider, package: pkg } of SWIRLS_HARNESSES.providers) {
      const found = diagnostics(`computer box {
  harness: { type: coding, provider: ${provider} }
  software: { "${pkg}": "1.0.0" }
}
`)
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({
        severity: 'error',
        message: `Computer "box" declares harness provider "${provider}", which ships "${pkg}"; remove "${pkg}" from software: because Swirls owns the harness version`,
      })
      expect(found[0]?.range.start.line).toBe(3)
    }
  })

  test('another provider package in software: is allowed', () => {
    const found = diagnostics(`computer box {
  harness: { type: coding, provider: pi }
  software: { codex: "0.50.0" }
}
`)
    expect(found).toEqual([])
  })

  test('explicit resources below the harness minimum warn', () => {
    const found = diagnostics(`computer box {
  harness: { type: coding, provider: codex }
  resources: { cpus: 1, memoryMiB: 2048 }
}
`)
    expect(
      found.map((diagnostic) => [diagnostic.severity, diagnostic.message]),
    ).toEqual([
      [
        'warning',
        'Computer "box" runs the codex harness with resources.cpus: 1; coding harnesses need at least 2 CPUs',
      ],
      [
        'warning',
        'Computer "box" runs the codex harness with resources.memoryMiB: 2048; coding harnesses need at least 4096 MiB',
      ],
    ])
    expect(found[0]?.range.start).toMatchObject({ line: 3, column: 22 })
  })

  test('unset resources on a harness computer do not warn', () => {
    expect(
      diagnostics(`computer box {
  harness: { type: coding, provider: codex }
  resources: { diskGiB: 20 }
}
`),
    ).toEqual([])
  })

  test('small resources without a harness do not warn', () => {
    expect(
      diagnostics(
        'computer box {\n  resources: { cpus: 1, memoryMiB: 512 }\n}\n',
      ),
    ).toEqual([])
  })

  test('a claude-code pin warns and points at the claude harness', () => {
    const found = diagnostics(
      'computer box {\n  software: { "claude-code": "2.0.0", gh: "2.63.2" }\n}\n',
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.severity).toBe('warning')
    expect(found[0]?.message).toContain('nixpkgs rewrites that binary')
    expect(found[0]?.message).toContain(
      'use harness: { type: coding, provider: claude } instead',
    )
  })

  test('a claude-code pin next to another harness still warns', () => {
    const found = diagnostics(`computer box {
  harness: { type: coding, provider: codex }
  software: { "claude-code": "2.0.0" }
}
`)
    expect(found.map((diagnostic) => diagnostic.severity)).toEqual(['warning'])
  })
})
