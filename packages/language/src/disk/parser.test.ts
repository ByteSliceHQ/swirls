import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'

describe('disk blocks', () => {
  test('parses minimal empty disk block', () => {
    const src = `
disk proj {
}

workflow g {
  label: "G"

  root {
    label: "Start"
    type: code
    code: @ts {
      return {};
    }
  }

  node x {
    type: disk
    disk: proj
    command: "ls -la"
  }

  flow { root -> x }
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.disk?.length).toBe(1)
    const a = ast.disk?.[0]
    expect(a?.name).toBe('proj')
    expect(a?.region).toBeUndefined()
    const node = ast.workflows?.[0]?.nodes.find((n) => n.name === 'x')
    expect(node?.type).toBe('disk')
  })

  test('parses disk block with label and region', () => {
    const src = `
disk proj {
  label: "Proj disk"
  region: "aws-us-east-1"
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.disk?.[0]?.label).toBe('Proj disk')
    expect(ast.disk?.[0]?.region).toBe('aws-us-east-1')
  })

  test('errors on removed id and secrets fields', () => {
    const src = `
disk proj {
  id: "dsk-0123456789abcdef"
  secrets: disk_creds
}
`
    const { errors } = parse(src)
    expect(
      errors.some((e) => e.message.includes('no longer accepts "id:"')),
    ).toBe(true)
    expect(
      errors.some((e) => e.message.includes('no longer accepts "secrets:"')),
    ).toBe(true)
  })
})

describe('agent disks field', () => {
  test('parses agent disks references', () => {
    const src = `
disk shared_a {}

agent helper {
  secrets: creds
  model: "gpt-4o"
  disks: [ shared_a ]
}
`
    const { ast, errors } = parse(src)
    expect(errors).toEqual([])
    expect(ast.agent?.[0]?.disks).toEqual(['shared_a'])
  })
})
