import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { validateMockBlocks } from '../mock/validator'
import { parse } from '../parser'
import { validate } from '../validator'
import {
  buildWorkspaceResourceIndex,
  emptyWorkspaceResourceIndex,
} from '../workspace/workspace-resources'
import { validateIntegrationNodes } from './validator'

const ACTION_BLOCK = `
action slack_post_message {
  provider: slack
  method: POST
  path: "/chat.postMessage"
  encoding: form
  input: @json {
    {
      "type": "object",
      "required": ["channel", "text"],
      "properties": {
        "channel": { "type": "string" },
        "text": { "type": "string" }
      }
    }
  }
  output: @json {
    {
      "type": "object",
      "required": ["ok"],
      "properties": { "ok": { "type": "boolean" } }
    }
  }
}
`

describe('validateIntegrationNodes', () => {
  test('accepts typed slack action block reference', () => {
    const source = `
${ACTION_BLOCK}
connection team_slack {
  provider: slack
}

workflow notify {
  label: "Notify"
  root {
    type: code
    code: @ts { return {} }
  }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    params: @ts { return { channel: "C1", text: "hi" } }
  }
  flow { root -> post_slack }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
  })

  test('errors when params is not a @ts block', () => {
    const source = `
${ACTION_BLOCK}
connection team_slack { provider: slack }
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    params: "return { channel: 'C1', text: 'hi' }"
  }
  flow { root -> post_slack }
}
`

    const { ast } = parse(source)
    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('"params" must be a @ts block'))).toBe(true)
  })

  test('errors when action and path are both set', () => {
    const source = `
${ACTION_BLOCK}
connection team_slack { provider: slack }
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    path: /chat.postMessage
  }
  flow { root -> post_slack }
}
`

    const { ast } = parse(source)
    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('either "action" or "path", not both'))).toBe(true)
  })

  test('errors for unknown action block', () => {
    const source = `
connection team_slack { provider: slack }
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: unknown_action
  }
  flow { root -> post_slack }
}
`

    const { ast } = parse(source)
    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('references undefined action block'))).toBe(true)
  })

  test('warns on raw path without action', () => {
    const source = `
connection team_slack { provider: slack }
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    path: /chat.postMessage
  }
  flow { root -> post_slack }
}
`

    const { ast } = parse(source)
    const diags = validate(ast)

    expect(
      diags.some(
        (d) => d.severity === 'warning' && d.message.includes('raw "path" without "action"'),
      ),
    ).toBe(true)
  })

  test('errors when action sets method', () => {
    const source = `
${ACTION_BLOCK}
connection team_slack { provider: slack }
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    method: POST
    params: @ts { return { channel: "C1", text: "hi" } }
  }
  flow { root -> post_slack }
}
`

    const { ast } = parse(source)
    const diags = validate(ast)
    expect(diags.some((d) => d.message.includes('must not set "method"'))).toBe(true)
  })
})

describe('validateIntegrationNodes cross-file', () => {
  test('resolves connection and action from workspace index', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swirls-int-'))

    try {
      fs.writeFileSync(
        path.join(dir, 'connections.swirls'),
        `connection team_slack {
  provider: slack
}
`,
        'utf-8',
      )

      fs.writeFileSync(path.join(dir, 'actions.swirls'), ACTION_BLOCK, 'utf-8')

      fs.writeFileSync(
        path.join(dir, 'notify.swirls'),
        `workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: slack_post_message
    params: @ts { return { channel: "C1", text: "hi" } }
  }
  flow { root -> post_slack }
}
`,
        'utf-8',
      )

      const workspace = buildWorkspaceResourceIndex({ cwd: dir })
      const notifySource = fs.readFileSync(path.join(dir, 'notify.swirls'), 'utf-8')
      const { ast, errors } = parse(notifySource)
      expect(errors).toEqual([])

      const diagsLocal = validate(ast)

      expect(
        diagsLocal.some((d) => d.message.includes('requires a valid "connection" block')),
      ).toBe(true)

      const diagsWs = validate(ast, { workspace })
      expect(diagsWs.filter((d) => d.severity === 'error')).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('still reports an undefined action when the workspace has other actions', () => {
    const source = `
connection team_slack { provider: slack }
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
  node post_slack {
    type: integration
    connection: team_slack
    action: unknown_action
  }
  flow { root -> post_slack }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])

    const known = parse(ACTION_BLOCK).ast.actions[0]
    expect(known).toBeDefined()
    const workspace = emptyWorkspaceResourceIndex()

    if (known) {
      workspace.actions.set(known.name, [{ relativePath: 'actions.swirls', line: 1 }])
      workspace.actionBlocks.set(known.name, known)
    }

    const diags = validateIntegrationNodes(ast, { workspace })

    expect(
      diags.some((d) => d.message.includes('references undefined action block "unknown_action"')),
    ).toBe(true)

    expect(
      validate(ast, { workspace }).some((d) =>
        d.message.includes('references undefined action block "unknown_action"'),
      ),
    ).toBe(true)
  })
})

describe('validate with a large workspace action map', () => {
  test('a file with no integration nodes and no mocks produces no diagnostics', () => {
    const source = `
workflow hello {
  label: "Hello"
  root { type: code code: @ts { return {} } }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.mocks).toEqual([])

    expect(
      ast.workflows.some((workflow) => workflow.nodes.some((node) => node.type === 'integration')),
    ).toBe(false)

    const known = parse(ACTION_BLOCK).ast.actions[0]
    expect(known).toBeDefined()
    const workspace = emptyWorkspaceResourceIndex()

    if (known) {
      for (let i = 0; i < 5_000; i++) {
        const name = `generated_action_${i}`
        workspace.actions.set(name, [{ relativePath: 'actions.swirls', line: 1 }])
        workspace.actionBlocks.set(name, { ...known, name })
      }
    }

    expect(validateIntegrationNodes(ast, { workspace })).toEqual([])
    expect(validateMockBlocks(ast, { workspace })).toEqual([])
    expect(validate(ast, { workspace })).toEqual([])
  })
})
