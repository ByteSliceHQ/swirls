import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { validateComputerBlocks } from './validator'

const workflow = (body: string) => `
workflow g {
  label: "G"
  root {
    label: "Start"
    type: code
    code: @ts { return {} }
  }
  ${body}
  flow { root -> run }
}
`

describe('computer blocks', () => {
  test('parses an empty baseline computer', () => {
    const { ast, errors } = parse('computer pr_bot {\n}\n')
    expect(errors).toEqual([])
    expect(ast.computer).toHaveLength(1)
    expect(ast.computer[0]?.name).toBe('pr_bot')
    expect(ast.computer[0]?.software).toBeUndefined()
    expect(ast.computer[0]?.resources).toBeUndefined()
  })

  test('parses software pins, disks, and resources', () => {
    const { ast, errors } = parse(`
disk kb {}

computer pr_bot {
  label: "PR bot"
  description: "Reviews pull requests"
  software: { gh: "2.63.2", git: "2.47.0" }
  disks: [kb]
  resources: { cpus: 2, memoryMiB: 1024 }
}
`)
    expect(errors).toEqual([])
    const computer = ast.computer[0]
    expect(computer?.label).toBe('PR bot')
    expect(computer?.description).toBe('Reviews pull requests')
    expect(
      computer?.software?.map((pin) => [pin.packageName, pin.pin]),
    ).toEqual([
      ['gh', '2.63.2'],
      ['git', '2.47.0'],
    ])
    expect(computer?.disks).toEqual(['kb'])
    expect(computer?.resources?.cpus).toBe(2)
    expect(computer?.resources?.memoryMiB).toBe(1024)
    expect(computer?.resources?.diskGiB).toBeUndefined()
  })

  test('round-trips a computer block', () => {
    const src = `computer pr_bot {
  label: "PR bot"
  software: { gh: "2.63.2" }
  resources: { cpus: 2, memoryMiB: 1024 }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const again = parse(serialize(ast))
    expect(again.errors).toEqual([])
    expect(again.ast.computer[0]?.software?.[0]?.pin).toBe('2.63.2')
    expect(again.ast.computer[0]?.resources?.cpus).toBe(2)
  })

  test('rejects unknown fields and unquoted pins', () => {
    const { errors } = parse(`
computer pr_bot {
  dockerfile: "FROM scratch"
  ephemeral: true
  software: { gh: 2.63.2, ls: latest }
}
`)
    const messages = errors.map((error) => error.message)
    expect(
      messages.some((message) =>
        message.includes('Unknown computer property "dockerfile"'),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes('Unknown computer property "ephemeral"'),
      ),
    ).toBe(true)
    expect(
      messages.some((message) => message.includes('software pin for "gh"')),
    ).toBe(true)
    expect(
      messages.some((message) => message.includes('software pin for "ls"')),
    ).toBe(true)
  })
})

describe('shell nodes', () => {
  test('parses a shell node bound to a computer', () => {
    const { ast, errors } = parse(`
computer pr_bot {}

${workflow(`
  node run {
    type: shell
    computer: pr_bot
    command: "ls /srv/workspace"
  }
`)}
`)
    expect(errors).toEqual([])
    const node = ast.workflows[0]?.nodes.find((n) => n.name === 'run')
    expect(node?.type).toBe('shell')
    expect(node?.configFields.computer).toMatchObject({
      kind: 'string',
      value: 'pr_bot',
    })
    expect(node?.configFields.command).toMatchObject({ kind: 'string' })
  })

  test('accepts command @ts and secrets', () => {
    const { ast, errors } = parse(`
secret github { vars: [GH_TOKEN] }
computer pr_bot {}

${workflow(`
  node run {
    type: shell
    computer: pr_bot
    secrets: { github: [GH_TOKEN] }
    command: @ts {
      return "gh repo clone " + context.nodes.root.output.repo
    }
  }
`)}
`)
    expect(errors).toEqual([])
    const node = ast.workflows[0]?.nodes.find((n) => n.name === 'run')
    expect(node?.configFields.command?.kind).toBe('ts_block')
    expect(node?.secretsMap).toEqual({ github: ['GH_TOKEN'] })
  })
})

describe('computer and shell validation', () => {
  function messages(src: string, warnings = false) {
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    return validate(ast, {
      includeUnboundComputerWarnings: warnings,
    })
      .filter((diagnostic) =>
        warnings ? true : diagnostic.severity !== 'warning',
      )
      .map((diagnostic) => diagnostic.message)
  }

  test('requires computer and command on shell', () => {
    const found = messages(`
computer pr_bot {}
${workflow(`
  node run {
    type: shell
  }
`)}
`)
    expect(
      found.some((message) => message.includes('requires "computer"')),
    ).toBe(true)
    expect(
      found.some((message) => message.includes('requires "command"')),
    ).toBe(true)
  })

  test('errors when two secrets blocks on one shell node list the same var', () => {
    const found = messages(`
secret github { vars: [GH_TOKEN, GH_HOST] }
secret gh_alt { vars: [GH_TOKEN] }
computer pr_bot {}
${workflow(`
  node run {
    type: shell
    computer: pr_bot
    secrets: { github: [GH_TOKEN, GH_HOST], gh_alt: [GH_TOKEN] }
    command: "gh auth status"
  }
`)}
`)
    expect(found).toContain(
      'secret var "GH_TOKEN" is listed by both "github" and "gh_alt"; a shell guest gets one value per name',
    )
  })

  test('allows distinct vars across secrets blocks on one shell node', () => {
    const found = messages(`
secret github { vars: [GH_TOKEN] }
secret npm { vars: [NPM_TOKEN] }
computer pr_bot {}
${workflow(`
  node run {
    type: shell
    computer: pr_bot
    secrets: { github: [GH_TOKEN], npm: [NPM_TOKEN] }
    command: "true"
  }
`)}
`)
    expect(
      found.filter((message) => message.includes('listed by both')),
    ).toEqual([])
  })

  test('errors when shell names an unknown computer', () => {
    const found = messages(`
${workflow(`
  node run {
    type: shell
    computer: missing
    command: "true"
  }
`)}
`)
    expect(
      found.some((message) =>
        message.includes('undefined computer block "missing"'),
      ),
    ).toBe(true)
  })

  test('errors on unknown disks, duplicates, empty pins, and resource bounds', () => {
    const found = messages(`
disk kb {}
computer pr_bot {
  software: { gh: "" }
  disks: [kb, kb, missing]
  resources: { cpus: 0, memoryMiB: 64, diskGiB: 0 }
}
${workflow(`
  node run {
    type: shell
    computer: pr_bot
    command: "true"
  }
`)}
`)
    expect(
      found.some((message) => message.includes('non-empty quoted string')),
    ).toBe(true)
    expect(
      found.some((message) => message.includes('duplicate disk "kb"')),
    ).toBe(true)
    expect(
      found.some((message) =>
        message.includes('undefined disk block "missing"'),
      ),
    ).toBe(true)
    expect(
      found.some((message) =>
        message.includes('resources.cpus must be at least 1'),
      ),
    ).toBe(true)
    expect(
      found.some((message) =>
        message.includes('resources.memoryMiB must be at least 128'),
      ),
    ).toBe(true)
    expect(
      found.some((message) =>
        message.includes('resources.diskGiB must be at least 1'),
      ),
    ).toBe(true)
  })

  test('rejects software names and pins the catalog cannot accept', () => {
    const found = messages(`
computer pr_bot {
  software: { gh: "x\\"\\n[hook]", git: "#1", jq: "=1.7", _bad: "1.0" }
}
`)
    expect(
      found.filter((message) =>
        message.includes('must be a version or semver range'),
      ),
    ).toHaveLength(3)
    expect(
      found.some((message) =>
        message.includes('software package name "_bad" may only contain'),
      ),
    ).toBe(true)
  })

  test('accepts exact versions and semver ranges as pins', () => {
    const found = messages(`
computer pr_bot {
  software: { gh: "2.63.2", git: "^1.2", jq: ">=2,<3", ripgrep: "1.2.*", nodejs: "~20 || 22.x", python3: ">=3.8 <4" }
}
`)
    expect(found).toEqual([])
  })

  test('rejects schema and format on shell', () => {
    const found = messages(`
computer pr_bot {}
${workflow(`
  node run {
    type: shell
    computer: pr_bot
    command: "true"
    format: text
    schema: @json { { "type": "object" } }
  }
`)}
`)
    expect(
      found.some((message) => message.includes('does not accept "format"')),
    ).toBe(true)
    expect(found.some((message) => message.includes('remove "schema"'))).toBe(
      true,
    )
  })

  test('unbound computer warns only when the LSP asks', () => {
    const src = 'computer pr_bot {}\n'
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    const doctor = validate(ast)
    expect(
      doctor.some((diagnostic) => diagnostic.message.includes('not bound')),
    ).toBe(false)
    const lsp = validate(ast, { includeUnboundComputerWarnings: true })
    expect(
      lsp.some(
        (diagnostic) =>
          diagnostic.severity === 'warning' &&
          diagnostic.message ===
            'Computer "pr_bot" is not bound by any shell node or agent',
      ),
    ).toBe(true)
  })

  test('a bound computer is silent', () => {
    const { ast, errors } = parse(`
computer pr_bot {}
${workflow(`
  node run {
    type: shell
    computer: pr_bot
    command: "true"
  }
`)}
`)
    expect(errors).toEqual([])
    const diags = validate(ast, { includeUnboundComputerWarnings: true })
    expect(
      diags.filter((diagnostic) => diagnostic.severity !== 'warning'),
    ).toEqual([])
    expect(
      diags.some((diagnostic) => diagnostic.message.includes('not bound')),
    ).toBe(false)
  })

  test('a computer bound by an agent is silent', () => {
    const { ast, errors } = parse(`
computer pr_bot {}
secret s { vars: [ OPENAI_API_KEY ] }
agent worker {
  provider: openai
  model: "gpt-4o-mini"
  secrets: s
  computer: pr_bot
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast, { includeUnboundComputerWarnings: true })
    expect(
      diags.some((diagnostic) => diagnostic.message.includes('not bound')),
    ).toBe(false)
  })

  test('a computer bound by an agent in another file is silent', () => {
    const { ast, errors } = parse('computer pr_bot {}\n')
    expect(errors).toEqual([])
    const diags = validateComputerBlocks(ast, {
      includeUnboundComputerWarnings: true,
      workspace: {
        agentBlocks: new Map([
          [
            'worker',
            {
              name: 'worker',
              provider: 'openai',
              model: 'gpt-4o-mini',
              modelRange: ast.computer[0]?.range,
              computer: 'pr_bot',
              profiles: [],
              range: ast.computer[0]?.range,
            },
          ],
        ]),
      } as unknown as WorkspaceResourceIndex,
    })
    expect(
      diags.some((diagnostic) => diagnostic.message.includes('not bound')),
    ).toBe(false)
  })
})
