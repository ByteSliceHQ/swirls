import { describe, expect, test } from 'bun:test'

import { parseDeploymentDefinition } from '@swirls/definition/deployment-definition'
import { parse } from '@swirls/language'

import { buildDeploymentDefinitionPayload } from './bundle'

describe('app deployment payload', () => {
  test('carries optional page icons into the deployment definition', () => {
    const source = parse(`
app crm_desk {
  label: "CRM Desk"

  page dashboard {
    label: "Dashboard"
    icon: "layout-dashboard"
    render: @openui {
      root = Markdown("Dashboard")
    }
  }
}
`)

    expect(source.errors).toEqual([])
    const payload = buildDeploymentDefinitionPayload(source.ast)
    expect(payload.parseError).toBeNull()

    const definition = parseDeploymentDefinition(payload.definition)
    expect(definition.success).toBe(true)

    if (!definition.success) {
      throw definition.error
    }

    expect(definition.data.apps?.[0]?.pages[0]?.icon).toBe('layout-dashboard')
  })

  test('carries channel pages with resolved agent into the deployment definition', () => {
    const source = parse(`
agent triage {
  provider: openrouter
  model: "gpt4o"
  secrets: ai_creds
}

secret ai_creds {
  vars: [ OPENROUTER_API_KEY ]
}

channel support_room {
  platform: swirls
  agent: triage
}

app support_center {
  label: "Acme Support Center"

  page room {
    icon: "hash"
    channel: support_room
  }
}
`)

    expect(source.errors).toEqual([])
    const payload = buildDeploymentDefinitionPayload(source.ast)
    expect(payload.parseError).toBeNull()

    const definition = parseDeploymentDefinition(payload.definition)
    expect(definition.success).toBe(true)

    if (!definition.success) {
      throw definition.error
    }

    expect(definition.data.apps?.[0]?.pages[0]).toEqual({
      name: 'room',
      icon: 'hash',
      channel: 'support_room',
      agent: 'triage',
    })
  })

  test('carries reviews workflows into the deployment definition', () => {
    const source = parse(`
workflow refund_request {
  label: "Refund"
  root {
    type: code
    code: @ts { return { ok: true } }
  }
}

app review_queue {
  label: "Review queue"

  page pending {
    reviews: [refund_request]
  }
}
`)

    expect(source.errors).toEqual([])
    const payload = buildDeploymentDefinitionPayload(source.ast)
    expect(payload.parseError).toBeNull()

    const definition = parseDeploymentDefinition(payload.definition)
    expect(definition.success).toBe(true)

    if (!definition.success) {
      throw definition.error
    }

    expect(definition.data.apps?.[0]?.pages[0]).toEqual({
      name: 'pending',
      reviews: ['refund_request'],
    })
  })

  test('carries sparse brand tokens into the deployment definition', () => {
    const source = parse(`
app support_center {
  label: "Support"
  brand {
    accent: "#B33A2B"
    tokens {
      light {
        canvas: "#f7f5f1"
        viewport: "#ffffff"
        brand: "#B33A2B"
        brand_foreground: "#ffffff"
        warning: "#a66a1f"
        radius: "8px"
      }
      dark {
        canvas: "#090807"
      }
    }
  }
  page dashboard {
    render: @openui {
      root = Markdown("Dashboard")
    }
  }
}
`)

    expect(source.errors).toEqual([])
    const payload = buildDeploymentDefinitionPayload(source.ast)
    expect(payload.parseError).toBeNull()

    const definition = parseDeploymentDefinition(payload.definition)
    expect(definition.success).toBe(true)

    if (!definition.success) {
      throw definition.error
    }

    expect(definition.data.apps?.[0]?.brand).toEqual({
      accent: '#B33A2B',
      tokens: {
        light: {
          canvas: '#f7f5f1',
          viewport: '#ffffff',
          brand: '#B33A2B',
          brand_foreground: '#ffffff',
          warning: '#a66a1f',
          radius: '8px',
        },
        dark: { canvas: '#090807' },
      },
    })
  })

  test('carries audience policy into the deployment definition', () => {
    const source = parse(`
app client_portal {
  label: "Client Portal"

  audience {
    admission: invite_or_domain
    auth: email_otp
    allow_domains: ["acme.com", "*.partners.acme.com"]
    deny_domains: ["contractors.acme.com"]
  }

  page home {
    render: @openui {
      root = Markdown("Welcome")
    }
  }
}
`)

    expect(source.errors).toEqual([])
    const payload = buildDeploymentDefinitionPayload(source.ast)
    expect(payload.parseError).toBeNull()

    const definition = parseDeploymentDefinition(payload.definition)
    expect(definition.success).toBe(true)

    if (!definition.success) {
      throw definition.error
    }

    expect(definition.data.apps?.[0]?.audience).toEqual({
      admission: 'invite_or_domain',
      auth: 'email_otp',
      allowDomains: ['acme.com', '*.partners.acme.com'],
      denyDomains: ['contractors.acme.com'],
    })
  })
})
