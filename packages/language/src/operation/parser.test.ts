import { describe, expect, test } from 'bun:test'

import { inlineTsFileRefs } from '../inline-ts-file-refs'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'
import { emptyWorkspaceResourceIndex } from '../workspace/workspace-resources'
import { normalizeInlineScript } from './parser'

const OPERATION = `
operation collect_outlook_diagnostics {
  label: "Collect Outlook diagnostics"
  description: "Summarize recent Outlook errors."
  platform: windows
  timeout: 120
  inputSchema: @json {
    { "type": "object", "properties": { "lookbackHours": { "type": "integer" } } }
  }
  command: @ps {
    $since = (Get-Date).AddHours(-4)
    Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $since } |
      ConvertTo-Json
  }
}
`

const workflow = (node: string) => `
workflow triage {
  label: "Triage"
  root {
    label: "Start"
    type: code
    code: @ts { return {} }
  }
  ${node}
  flow { root -> run }
}
`

function messages(source: string): string[] {
  const { ast, errors } = parse(source)
  expect(errors).toEqual([])
  return validate(ast).map((diagnostic) => diagnostic.message)
}

function onlyOperation(source: string) {
  const { ast, errors } = parse(source)
  expect(errors).toEqual([])
  const [operation] = ast.operations

  if (!operation) {
    throw new Error('expected one operation')
  }

  return operation
}

describe('operation blocks', () => {
  test('should parse the fields of an operation', () => {
    const operation = onlyOperation(OPERATION)

    expect({
      name: operation.name,
      label: operation.label,
      platform: operation.platform,
      timeout: operation.timeout,
      lang: operation.command?.lang,
      inputType: operation.inputSchema?.type,
    }).toEqual({
      name: 'collect_outlook_diagnostics',
      label: 'Collect Outlook diagnostics',
      platform: 'windows',
      timeout: 120,
      lang: 'ps',
      inputType: 'object',
    })
  })

  test('should read a script whose braces are structure', () => {
    const operation = onlyOperation(OPERATION)

    expect(operation.command?.script).toBe(
      [
        '$since = (Get-Date).AddHours(-4)',
        "Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $since } |",
        '  ConvertTo-Json',
        '',
      ].join('\n'),
    )
  })

  test('should not end a script at a brace inside a string', () => {
    const operation = onlyOperation(`
operation braces {
  command: @sh {
    echo "}" '}'
    echo done
  }
}
`)

    expect(operation.command?.script).toBe('echo "}" \'}\'\necho done\n')
  })

  test('should not end a script at a brace inside a comment', () => {
    const operation = onlyOperation(`
operation commented {
  command: @sh {
    # closes nothing: }
    echo done
  }
}
`)

    expect(operation.command?.script).toBe('# closes nothing: }\necho done\n')
  })

  test('should not treat a hash inside a word as a comment', () => {
    const operation = onlyOperation(`
operation count_args {
  command: @sh {
    if [ $# -gt 0 ]; then echo "{"; fi
  }
}
`)

    expect(operation.command?.script).toBe('if [ $# -gt 0 ]; then echo "{"; fi\n')
  })

  test('should not end a PowerShell script inside a block comment', () => {
    const operation = onlyOperation(`
operation documented {
  command: @ps {
    <# } not the end #>
    Write-Output "ok"
  }
}
`)

    expect(operation.command?.script).toBe('<# } not the end #>\nWrite-Output "ok"\n')
  })

  test('should not end a PowerShell script inside a here-string', () => {
    const source = [
      'operation heredoc {',
      '  command: @ps {',
      '    $text = @"',
      '}',
      '"@',
      '    Write-Output $text',
      '  }',
      '}',
      '',
    ].join('\n')

    expect(onlyOperation(source).command?.script).toContain('Write-Output $text')
  })

  test('should read a script file reference', () => {
    const operation = onlyOperation(`
operation from_file {
  command: @ps "scripts/collect.ps1"
}
`)

    expect(operation.command).toMatchObject({
      lang: 'ps',
      path: 'scripts/collect.ps1',
    })
  })

  test('should load a referenced script file at deploy, byte for byte', () => {
    const { ast } = parse(`
operation from_file {
  command: @sh "scripts/collect.sh"
}
`)

    inlineTsFileRefs(ast, {
      swirlsFilePath: '/project/ops.swirls',
      readFileSync: (path) => (path === '/project/scripts/collect.sh' ? 'uptime\r\n' : ''),
    })

    expect(ast.operations[0]?.command?.script).toBe('uptime\r\n')
  })

  test('should refuse a command that is not a script', () => {
    const { errors } = parse(`
operation wrong {
  command: "Get-Process"
}
`)

    expect(errors[0]?.message).toContain('must be an @ps { } or @sh { } block')
  })

  test('should refuse a property it does not know', () => {
    const { errors } = parse(`
operation wrong {
  elevate: true
  command: @sh { uptime }
}
`)

    expect(errors[0]?.message).toBe('Unknown operation property "elevate"')
  })

  test('should round-trip through the serializer', () => {
    const first = parse(OPERATION).ast.operations[0]
    const second = parse(serialize(parse(OPERATION).ast)).ast.operations[0]

    expect({
      script: second?.command?.script,
      platform: second?.platform,
      timeout: second?.timeout,
      inputSchema: second?.inputSchema,
    }).toEqual({
      script: first?.command?.script,
      platform: first?.platform,
      timeout: first?.timeout,
      inputSchema: first?.inputSchema,
    })
  })

  test('should not let a node use a script block as a config value', () => {
    const { ast } = parse(
      workflow(`
  node run {
    type: code
    code: @sh { uptime }
  }
`),
    )

    const node = ast.workflows[0]?.nodes.find((n) => n.name === 'run')
    expect(node?.configFields.code).toBeUndefined()
  })
})

describe('normalizeInlineScript', () => {
  test('should remove the indentation every line shares', () => {
    expect(normalizeInlineScript('\n    if ($x) {\n      $y\n    }\n  ')).toBe(
      'if ($x) {\n  $y\n}\n',
    )
  })

  test('should keep blank lines inside the script', () => {
    expect(normalizeInlineScript('\n  a\n\n  b\n')).toBe('a\n\nb\n')
  })

  test('should read an empty block as an empty script', () => {
    expect(normalizeInlineScript('\n   \n')).toBe('')
  })

  test('should use line feeds whatever the source file uses', () => {
    expect(normalizeInlineScript('\r\n  a\r\n  b\r\n')).toBe('a\nb\n')
  })
})

describe('operation validation', () => {
  test('should accept a complete operation', () => {
    expect(messages(OPERATION)).toEqual([])
  })

  test('should require a command', () => {
    expect(messages('operation empty {\n  label: "Empty"\n}\n')).toEqual([
      'Operation "empty" requires a "command": the script it runs',
    ])
  })

  test('should refuse an empty script', () => {
    expect(messages('operation blank {\n  command: @sh {\n  }\n}\n')).toEqual([
      'Operation "blank" has an empty command',
    ])
  })

  test('should refuse a platform it does not know', () => {
    const source = 'operation o {\n  platform: beos\n  command: @sh { uptime }\n}\n'
    expect(messages(source)).toEqual(['Operation "platform" must be windows, linux or macos'])
  })

  test('should refuse an sh script on windows', () => {
    const source = 'operation o {\n  platform: windows\n  command: @sh { uptime }\n}\n'

    expect(messages(source)).toEqual([
      'An @sh command cannot run on windows. Use @ps, or another platform.',
    ])
  })

  test('should refuse a timeout longer than the daemon allows', () => {
    const source = 'operation o {\n  timeout: 7200\n  command: @sh { uptime }\n}\n'

    expect(messages(source)).toEqual([
      'Operation "timeout" must be a whole number of seconds from 1 to 3600',
    ])
  })

  test('should refuse a runAs it does not know', () => {
    const source = 'operation o {\n  runAs: root\n  command: @sh { uptime }\n}\n'
    expect(messages(source)).toEqual(['Operation "runAs" must be system or signed_in_user'])
  })

  test('should warn that devices refuse signed_in_user for now', () => {
    const { ast } = parse('operation o {\n  runAs: signed_in_user\n  command: @sh { uptime }\n}\n')
    expect(validate(ast).map((diagnostic) => diagnostic.severity)).toEqual(['warning'])
  })

  test('should refuse a script file with the wrong extension', () => {
    expect(messages('operation o {\n  command: @ps "scripts/collect.sh"\n}\n')).toEqual([
      '@ps must reference a .ps1 file',
    ])
  })

  test('should refuse two operations with one name', () => {
    const source = `
operation twice { command: @sh { uptime } }
operation twice { command: @sh { uptime } }
`

    expect(messages(source)).toContain('Duplicate operation "twice"')
  })
})

describe('device nodes', () => {
  const uptime = 'operation uptime {\n  command: @sh { uptime }\n}\n'

  test('should accept a node that names one device', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    device: @ts { return context.nodes.root.output.deviceId }
    input: @ts { return { verbose: true } }
  }
`)}`

    expect(messages(source)).toEqual([])
  })

  test('should accept a node that selects a group', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    devices: { tags: ["kiosk", "site:denver"], os: linux }
    waitSeconds: 600
  }
`)}`

    expect(messages(source)).toEqual([])
  })

  test('should refuse an operation that is not declared', () => {
    const source = workflow(`
  node run {
    type: device
    operation: missing
    device: "0199f6a0-0000-7000-8000-000000000001"
  }
`)

    expect(messages(source)).toEqual(['Device node references undefined operation "missing"'])
  })

  test('should find an operation declared in another file', () => {
    const node = workflow(`
  node run {
    type: device
    operation: uptime
    device: "0199f6a0-0000-7000-8000-000000000001"
  }
`)

    const workspace = emptyWorkspaceResourceIndex()

    for (const operation of parse(uptime).ast.operations) {
      workspace.operationBlocks.set(operation.name, operation)
    }

    const { ast } = parse(node)
    expect(validate(ast, { workspace })).toEqual([])
  })

  test('should require a device or a selector', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
  }
`)}`

    expect(messages(source)).toEqual([
      'Device node requires "device" (one device id) or "devices" (a selector)',
    ])
  })

  test('should refuse a device and a selector together', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    device: "0199f6a0-0000-7000-8000-000000000001"
    devices: { os: linux }
  }
`)}`

    expect(messages(source)).toEqual([
      'Device node takes "device" (one device id) or "devices" (a selector), not both',
    ])
  })

  test('should refuse a selector that would match every device', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    devices: { tags: [] }
  }
`)}`

    expect(messages(source)).toEqual([
      'A selector needs at least one tag or an os. There is no selector for every device.',
    ])
  })

  test('should refuse a tag that is not valid', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    devices: { tags: ["Front Office"] }
  }
`)}`

    expect(messages(source)).toEqual([
      'A tag is lowercase and uses letters, numbers, dots, dashes, underscores and colons',
    ])
  })

  test('should refuse a selector for a system the operation cannot run on', () => {
    const source = `operation spooler {
  platform: windows
  command: @ps { Restart-Service Spooler }
}
${workflow(`
  node run {
    type: device
    operation: spooler
    devices: { os: macos }
  }
`)}`

    expect(messages(source)).toEqual([
      'Operation "spooler" runs on windows, so this selector matches no device it can run on',
    ])
  })

  test('should refuse a review on the node itself', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    devices: { os: linux }
    review: { enabled: true }
  }
`)}`

    expect(messages(source)).toContain(
      'A device node cannot carry a review. Put the review on a separate node upstream of it.',
    )
  })

  test('should refuse a wait longer than a node may hold', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    devices: { os: linux }
    waitSeconds: 86400
  }
`)}`

    expect(messages(source)).toEqual([
      'Device node "waitSeconds" must be a whole number from 30 to 3600',
    ])
  })

  test('should refuse an output schema, since the result shape is fixed', () => {
    const source = `${uptime}${workflow(`
  node run {
    type: device
    operation: uptime
    devices: { os: linux }
    schema: @json { { "type": "object" } }
  }
`)}`

    expect(messages(source).length).toBeGreaterThan(0)
  })

  test('should let an agent use a workflow that ends in a device node', () => {
    const source = `${uptime}
secret llm { vars: [OPENROUTER_API_KEY] }

workflow check_device {
  label: "Check a device"
  description: "Reports how long a device has been running."
  root {
    label: "Start"
    type: code
    inputSchema: @json {
      {
        "type": "object",
        "properties": { "deviceId": { "type": "string" } },
        "required": ["deviceId"]
      }
    }
    code: @ts { return context.nodes.root.input }
  }
  node run {
    type: device
    operation: uptime
    device: @ts { return context.nodes.root.output.deviceId }
  }
  flow { root -> run }
}

agent helpdesk {
  secrets: llm
  model: "anthropic/claude-sonnet-4"
  tools: [check_device]
}
`

    expect(messages(source)).toEqual([])
  })
})
