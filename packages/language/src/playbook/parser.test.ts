import { describe, expect, test } from 'bun:test'

import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'

describe('mock + playbook DSL', () => {
  test('parses mock with workflow and node pins', () => {
    const source = `
workflow demo {
  label: "Demo"
  root { type: code code: @ts { return {} } }
}

mock review_gate {
  workflow: demo
  node: review_draft
  review: {
    auto: approve
    formData: @json { { "approved": true } }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.mocks[0]?.workflow).toBe('demo')
    expect(ast.mocks[0]?.node).toBe('review_draft')
  })

  test('parses mock defaults and named action mock', () => {
    const source = `
mock defaults {
  mode: all
  except: [linkedin_get_me]
}

mock linkedin_create_post {
  action: linkedin_create_post
  output: @json {
    { "id": "urn:li:share:mock-001" }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.mocks).toHaveLength(2)
    expect(ast.mocks[0]?.name).toBe('defaults')
    expect(ast.mocks[0]?.mode).toBe('all')
    expect(ast.mocks[0]?.except).toEqual(['linkedin_get_me'])
    expect(ast.mocks[1]?.action).toBe('linkedin_create_post')
    expect(ast.mocks[1]?.output?.code).toContain('urn:li:share:mock-001')
  })

  test('parses playbook case with expect assertions', () => {
    const source = `
workflow process_contact {
  label: "Process"
  root {
    type: code
    code: @ts { return { status: "processed" } }
  }
}

mock defaults {
  mode: all
}

playbook smoke {
  label: "Smoke tests"
  mocks: defaults
  tags: [ci]

  case happy_path {
    workflow: process_contact
    input: @json { { "email": "test@example.com" } }
    timeout: "2m"
    tags: [smoke]

    expect {
      status: completed
      duration: { max: "2m" }
      called: [root]
      notCalled: [linkedin_create_post]
      order: [root]
    }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    expect(ast.playbooks).toHaveLength(1)
    const pb = ast.playbooks[0]!
    expect(pb.name).toBe('smoke')
    expect(pb.mocks).toBe('defaults')
    expect(pb.cases).toHaveLength(1)
    expect(pb.cases[0]?.workflow).toBe('process_contact')
    expect(pb.cases[0]?.timeout).toBe('2m')
    expect(pb.cases[0]?.timeoutSeconds).toBe(120)

    expect(pb.cases[0]?.expect?.assertions.map((a) => a.kind)).toEqual([
      'status',
      'duration',
      'called',
      'notCalled',
      'order',
    ])

    const diags = validate(ast)
    expect(diags.filter((d) => d.severity !== 'warning')).toEqual([])
  })

  test('parses playbook eval with judge: criteria and judge: @ts', () => {
    const source = `
workflow generate_draft {
  label: "Draft"
  root {
    type: code
    code: @ts { return { body: "hello world from swirls" } }
  }
}

mock defaults {
  mode: all
}

playbook quality {
  mocks: defaults
  tags: [quality]

  eval draft_quality {
    workflow: generate_draft
    input: @json { { "topic": "MSP ops" } }
    retries: 1

    judge: {
      rubric: criteria
      criteria: "Draft is coherent and on-topic. Score 0-1."
      minScore: 0.7
      severity: soft
      label: draft_voice
      model: "google/gemini-2.5-flash"
    }

    expect {
      status: completed
    }
  }

  eval draft_structure {
    workflow: generate_draft

    judge: @ts {
      const body = String(context.output?.body ?? '')
      return { score: body.length > 5 ? 1 : 0.1 }
    }

    expect {
      status: completed
    }
  }
}
`

    const { ast, errors } = parse(source)
    expect(errors).toEqual([])
    const pb = ast.playbooks[0]!
    expect(pb.evals).toHaveLength(2)
    expect(pb.evals[0]?.judge?.rubric).toBe('criteria')
    expect(pb.evals[0]?.judge?.minScore).toBe(0.7)
    expect(pb.evals[0]?.judge?.label).toBe('draft_voice')
    expect(pb.evals[0]?.judge?.model).toBe('google/gemini-2.5-flash')
    expect(pb.evals[0]?.retries).toBe(1)
    expect(pb.evals[1]?.judge?.ts?.kind).toBe('ts_block')
  })

  test('round-trips playbook serialize', () => {
    const source = `
workflow process_contact {
  label: "Process"
  root {
    type: code
    code: @ts { return {} }
  }
}

mock defaults { mode: all }

playbook smoke {
  mocks: defaults
  case happy_path {
    workflow: process_contact
    expect {
      status: completed
    }
  }
}
`

    const first = parse(source)
    expect(first.errors).toEqual([])
    const second = parse(serialize(first.ast))
    expect(second.errors).toEqual([])
    expect(second.ast.playbooks[0]?.cases[0]?.name).toBe('happy_path')
  })
})
