import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { validate } from '../validator'
import { emptyWorkspaceResourceIndex } from '../workspace/workspace-resources'

function diagsFor(source: string) {
  const { ast, errors } = parse(source)
  expect(errors).toEqual([])
  return validate(ast)
}

describe('mock schema compatibility', () => {
  test('errors when action: references unknown action', () => {
    const diags = diagsFor(`
mock stub {
  action: missing_action
  output: @json { { "ok": true } }
}
`)

    expect(diags.some((d) => d.message.includes('unknown action "missing_action"'))).toBe(true)
  })

  test('requires workflow when node is set', () => {
    const diags = diagsFor(`
mock gate {
  node: review_draft
  review: {
    auto: approve
  }
}
`)

    expect(diags.some((d) => d.message.includes('requires workflow: <name>'))).toBe(true)
  })

  test('errors when node is missing from pinned workflow', () => {
    const diags = diagsFor(`
workflow demo {
  label: "Demo"
  root { type: code code: @ts { return {} } }
}

mock gate {
  workflow: demo
  node: missing_node
  review: {
    auto: approve
  }
}
`)

    expect(diags.some((d) => d.message.includes('not found in workflow "demo"'))).toBe(true)
  })

  test('errors when review formData fails node review schema', () => {
    const diags = diagsFor(`
workflow demo {
  label: "Demo"
  root { type: code code: @ts { return {} } }
  node review_draft {
    type: code
    label: "Review"
    review: {
      enabled: true
      schema: @json {
        {
          "type": "object",
          "required": ["approved", "notes"],
          "additionalProperties": false,
          "properties": {
            "approved": { "type": "boolean" },
            "notes": { "type": "string" }
          }
        }
      }
    }
    code: @ts { return {} }
  }
}

mock review_ok {
  workflow: demo
  node: review_draft
  review: {
    auto: approve
    formData: @json {
      { "approved": true }
    }
  }
}
`)

    expect(
      diags.some((d) => d.message.includes('review formData') && d.message.includes('notes')),
    ).toBe(true)
  })

  test('passes when review formData matches node review schema', () => {
    const diags = diagsFor(`
workflow demo {
  label: "Demo"
  root { type: code code: @ts { return {} } }
  node review_draft {
    type: code
    label: "Review"
    review: {
      enabled: true
      schema: @json {
        {
          "type": "object",
          "required": ["approved"],
          "additionalProperties": false,
          "properties": {
            "approved": { "type": "boolean" },
            "notes": { "type": "string" }
          }
        }
      }
    }
    code: @ts { return {} }
  }
}

mock review_ok {
  workflow: demo
  node: review_draft
  review: {
    auto: approve
    formData: @json {
      { "approved": true, "notes": "LGTM" }
    }
  }
}
`)

    expect(
      diags.filter((d) => d.severity === 'error' && d.message.includes('mock "review_ok"')),
    ).toEqual([])
  })

  test('allows duplicate node names across workflows with workflow pin', () => {
    const diags = diagsFor(`
workflow alpha {
  label: "Alpha"
  root { type: code code: @ts { return {} } }
  node review_draft {
    type: code
    review: {
      enabled: true
      schema: @json {
        {
          "type": "object",
          "required": ["approved"],
          "properties": { "approved": { "type": "boolean" } }
        }
      }
    }
    code: @ts { return {} }
  }
}

workflow beta {
  label: "Beta"
  root { type: code code: @ts { return {} } }
  node review_draft {
    type: code
    review: {
      enabled: true
      schema: @json {
        {
          "type": "object",
          "required": ["approved", "score"],
          "properties": {
            "approved": { "type": "boolean" },
            "score": { "type": "number" }
          }
        }
      }
    }
    code: @ts { return {} }
  }
}

mock alpha_review {
  workflow: alpha
  node: review_draft
  review: {
    auto: approve
    formData: @json { { "approved": true } }
  }
}

mock beta_review {
  workflow: beta
  node: review_draft
  review: {
    auto: approve
    formData: @json { { "approved": true, "score": 1 } }
  }
}
`)

    expect(diags.filter((d) => d.severity === 'error' && d.message.includes('mock "'))).toEqual([])
  })

  test('errors when action output fails output schema', () => {
    const diags = diagsFor(`
action create_thing {
  label: "Create"
  provider: slack
  method: POST
  path: "/things"
  output: @json {
    {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string" }
      }
    }
  }
}

mock create_thing {
  action: create_thing
  output: @json {
    { "id": 123 }
  }
}
`)

    expect(
      diags.some(
        (d) => d.message.includes('mock "create_thing" output') && d.message.includes('schema'),
      ),
    ).toBe(true)
  })

  test('warns when review mock has no node binding', () => {
    const diags = diagsFor(`
mock review_approve {
  review: {
    auto: approve
    formData: @json { { "approved": true } }
  }
}
`)

    expect(
      diags.some(
        (d) => d.severity === 'warning' && d.message.includes('not bound to a workflow/node'),
      ),
    ).toBe(true)
  })

  test('resolves node across workspace workflowBlocks', () => {
    const local = `
mock gate {
  workflow: other
  node: review_draft
  review: {
    auto: approve
    formData: @json {
      { "approved": true }
    }
  }
}
`

    const other = `
workflow other {
  label: "Other"
  root { type: code code: @ts { return {} } }
  node review_draft {
    type: code
    label: "Review"
    review: {
      enabled: true
      schema: @json {
        {
          "type": "object",
          "required": ["approved", "score"],
          "properties": {
            "approved": { "type": "boolean" },
            "score": { "type": "number" }
          }
        }
      }
    }
    code: @ts { return {} }
  }
}
`

    const localParsed = parse(local)
    const otherParsed = parse(other)
    expect(localParsed.errors).toEqual([])
    expect(otherParsed.errors).toEqual([])

    const workspace = emptyWorkspaceResourceIndex()
    const wf = otherParsed.ast.workflows[0]!
    workspace.workflows.set('other', [{ relativePath: 'other.swirls', line: 1 }])
    workspace.workflowBlocks.set('other', wf)

    const diags = validate(localParsed.ast, { workspace })

    expect(
      diags.some((d) => d.message.includes('review formData') && d.message.includes('score')),
    ).toBe(true)
  })
})
