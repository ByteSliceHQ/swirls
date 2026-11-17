import { describe, expect, test } from 'bun:test'
import { parse } from '../parser'
import { serialize } from '../serializer'
import { validate } from '../validator'
import type { LanguageHost, OpenUiBindings } from '../host'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'

const NO_BINDINGS: OpenUiBindings = {
  agents: [],
  channels: [],
  workflows: [],
  views: [],
  streams: [],
  datastores: [],
  queries: [],
  disks: [],
}

/**
 * Stand-in for a runtime's OpenUI support. It reads `Chat("name")` and
 * `DiskBrowser("name")` calls only, which is enough to exercise how the
 * validator uses what a host reports.
 */
const openUiHost: LanguageHost = {
  openui: {
    extractBindings(source) {
      const names = (component: string) =>
        [...source.matchAll(new RegExp(`${component}\\("([^"]+)"\\)`, 'g'))].map(
          (m) => m[1] ?? '',
        )
      return {
        ...NO_BINDINGS,
        channels: names('Chat'),
        disks: names('DiskBrowser'),
      }
    },
    validate(source, { expose }) {
      const errors = this.extractBindings(source)
        .disks.filter((name) => !expose.disks.includes(name))
        .map((name) => `DiskBrowser binds disk "${name}" which is not defined`)
      return errors.length === 0 ? { ok: true } : { ok: false, errors }
    },
  },
}

const PRELUDE = `
secret ai_creds {
  vars: [ OPENROUTER_API_KEY ]
}

agent triage {
  provider: openrouter
  model: "gpt4o"
  secrets: ai_creds
}

workflow refund_request {
  label: "Refund"
  root {
    type: code
    code: @ts {
      return { ok: true }
    }
  }
}

stream ticket_rows {
  label: "Ticket rows"
  workflow: refund_request
  version: v1
  versions: {
    v1 {
      schema: @json { { "type": "object" } }
      prepare: @ts { return context.output }
    }
  }
}

view open_tickets {
  label: "Open tickets"
  streams: [ticket_rows]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}

view ticket_metrics {
  label: "Ticket metrics"
  streams: [ticket_rows]
  schema: @json { { "type": "object" } }
  columns: @ts { return {} }
}

channel support_room {
  platform: swirls
  agent: triage
}
`

const SOURCE = `
${PRELUDE}

app support_center {
  label: "Acme Support Center"
  description: "Where Acme's team triages tickets."
  icon: "life-buoy"

  brand {
    accent: "#B33A2B"
    theme: "swirls-light"
  }

  shell {
    preset: sidebar
    topbar {
      right: [widget.user_menu]
    }
    rightbar {
      defaultState: "collapsed"
      resizable: true
    }
  }

  nav {
    section "Overview" {
      page: dashboard
      page: tickets { label: "Open tickets" }
    }
    section "Talk to us" {
      page: copilot
    }
  }

  page tickets {
    render: @openui {
      root = ViewTable("open_tickets", "Open tickets")
    }
  }

  page copilot {
    viewport: full
    render: @openui {
      root = Stack([
        AgentChat("triage", "Copilot"),
        Chat("support_room", "Support room")
      ])
    }
  }

  page dashboard {
    label: "Dashboard"
    icon: "layout-dashboard"
    render: @openui {
      root = Stack([StatCard("Open tickets", "—")])
    }
  }
}
`

describe('app block parsing', () => {
  test('RFC-shaped app parses with shell, nav, and pages', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors).toEqual([])
    expect(ast.apps.length).toBe(1)

    const app = ast.apps[0]!
    expect(app.name).toBe('support_center')
    expect(app.label).toBe('Acme Support Center')
    expect(app.description).toContain('triages')
    expect(app.icon).toBe('life-buoy')
    expect(app.brand?.accent).toBe('#B33A2B')
    expect(app.brand?.theme).toBe('swirls-light')
    expect(app.shell?.preset).toBe('sidebar')
    expect(app.shell?.regions.length).toBe(2)
    expect(app.nav?.sections.length).toBe(2)
    expect(app.pages.length).toBe(3)

    const tickets = app.pages.find((p) => p.name === 'tickets')
    expect(tickets?.render?.content).toContain('ViewTable')

    const copilot = app.pages.find((p) => p.name === 'copilot')
    expect(copilot?.viewport).toBe('full')
    expect(copilot?.render?.content).toContain('Chat("support_room"')

    const dashboard = app.pages.find((p) => p.name === 'dashboard')
    expect(dashboard?.icon).toBe('layout-dashboard')
    expect(dashboard?.render?.content).toContain('Stack')
  })

  test('valid app passes validation', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(diags.filter((d) => d.severity !== 'warning')).toEqual([])
  })

  test('round-trips through serialize', () => {
    const { ast, errors } = parse(SOURCE)
    expect(errors).toEqual([])
    const text = serialize(ast)
    const second = parse(text)
    expect(second.errors).toEqual([])
    expect(second.ast.apps[0]?.name).toBe('support_center')
    expect(second.ast.apps[0]?.pages.length).toBe(3)
    expect(
      second.ast.apps[0]?.pages.find((page) => page.name === 'dashboard')?.icon,
    ).toBe('layout-dashboard')
  })

  test('parses and validates audience block', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app client_portal {
  label: "Client Portal"
  audience {
    admission: invite_or_domain
    auth: email_otp
    allow_domains: ["acme.com"]
  }
  page only {
    render: @openui {
      root = ViewTable("open_tickets")
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    expect(ast.apps[0]?.audience?.admission).toBe('invite_or_domain')
  })

  test('rejects audience string form (use audience block)', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app broken {
  label: "Broken"
  audience: "customers"
  page only {
    render: @openui {
      root = ViewTable("open_tickets")
    }
  }
}
`)
    expect(errors.length).toBeGreaterThan(0)
    expect(ast.apps[0]?.audience).toBeUndefined()
  })

  test('OpenUI Chat binding requires platform swirls channel', () => {
    const { ast, errors } = parse(`
${PRELUDE}
channel slack_room {
  platform: slack
  agent: triage
}
app broken {
  label: "Broken"
  page room {
    render: @openui {
      root = Chat("slack_room")
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast, { host: openUiHost })
    expect(diags.some((d) => d.message.includes('platform: swirls'))).toBe(true)
  })

  test('rejects legacy page presets with a pointed error', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app legacy {
  label: "Legacy"
  page tickets {
    view: open_tickets
  }
}
`)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.message.includes('no longer supported'))).toBe(
      true,
    )
    expect(ast.apps[0]?.pages[0]?.render).toBeUndefined()
  })

  test('names an unknown page field and keeps the rest of the page', () => {
    const source = `
app demo {
  label: "Demo"
  page dashboard {
    label: "Dashboard"
    data runs = view.ticket_metrics
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`
    const { ast, errors } = parse(source)
    const unknown = errors.find((e) =>
      e.message.startsWith('Unknown page field'),
    )
    expect(unknown?.message).toBe(
      'Unknown page field "data". Expected one of: label, icon, viewport, render, channel, reviews, threads',
    )
    const dataLine =
      source.split('\n').findIndex((line) => line.includes('data runs')) + 1
    expect(unknown?.range.start.line).toBe(dataLine)
    expect(ast.apps[0]?.pages[0]?.label).toBe('Dashboard')
    expect(ast.apps[0]?.pages[0]?.render).toBeDefined()
  })

  test('a known page field missing its colon still expects a colon', () => {
    const { errors } = parse(`
app demo {
  label: "Demo"
  page dashboard {
    label "Dashboard"
  }
}
`)
    expect(errors.some((error) => error.message === 'Expected :')).toBe(true)
    expect(
      errors.some((error) => error.message.includes('Unknown page field')),
    ).toBe(false)
  })

  test('accepts TableEditor on a full-viewport page', () => {
    const { ast, errors } = parse(`
${PRELUDE}
database tickets {
  schema: @prisma {
    model Ticket {
      id Int @id @default(autoincrement())
      title String
    }
  }
}
app support_center {
  label: "Acme Support Center"
  page accounts {
    viewport: full
    render: @openui {
      root = TableEditor("tickets", "Ticket", {
        title: "Pipeline",
        sort: { column: "title", direction: "desc" },
        filters: [{ column: "title", op: "ne", value: "spam" }]
      })
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast).filter((d) => d.severity !== 'warning')
    expect(diags).toEqual([])
    expect(ast.apps[0]?.pages[0]?.viewport).toBe('full')
  })

  test('accepts a WorkflowLauncher field with nested Select', () => {
    const { ast, errors } = parse(`
${PRELUDE}
database tickets {
  schema: @prisma {
    model Ticket {
      id Int @id @default(autoincrement())
      title String
    }
  }
}
app support_center {
  label: "Acme Support Center"
  page launch {
    render: @openui {
      root = WorkflowLauncher("refund_request", [
        { name: "ticketId", label: "Ticket", required: true, input: Select({ database: "tickets", table: "Ticket" }) }
      ], "Launch", "Refund")
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast).filter((d) => d.severity !== 'warning')
    expect(diags).toEqual([])
  })

  test('accepts Gutter around a ViewBrowser on a full-viewport page', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Acme Support Center"
  page feed {
    viewport: full
    render: @openui {
      root = Gutter([
        ViewBrowser("open_tickets", { title: "Activity feed" })
      ], "lg")
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast).filter((d) => d.severity !== 'warning')
    expect(diags).toEqual([])
  })

  test('accepts fill on a ViewBrowser without Gutter', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Acme Support Center"
  page feed {
    viewport: full
    render: @openui {
      root = ViewBrowser("open_tickets", {
        title: "Activity feed",
        fill: true
      })
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast).filter((d) => d.severity !== 'warning')
    expect(diags).toEqual([])
  })

  test('accepts DiskBrowser on a full-viewport page', () => {
    const { ast, errors } = parse(`
${PRELUDE}
disk project_files {
  label: "Project files"
}

app support_center {
  label: "Acme Support Center"
  page assets {
    viewport: full
    render: @openui {
      root = Gutter([
        DiskBrowser("project_files", {
          title: "Company files",
          fill: true,
          initialPath: "/companies"
        })
      ], "lg")
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast).filter((d) => d.severity !== 'warning')
    expect(diags).toEqual([])
    expect(ast.apps[0]?.pages[0]?.viewport).toBe('full')
  })

  test('rejects DiskBrowser bound to an undefined disk', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Acme Support Center"
  page assets {
    render: @openui {
      root = DiskBrowser("missing_disk")
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast, { host: openUiHost }).filter((d) => d.severity !== 'warning')
    expect(
      diags.some(
        (d) =>
          d.message.includes('DiskBrowser') &&
          d.message.includes('missing_disk'),
      ),
    ).toBe(true)
  })

  test('accepts ViewBrowser and StreamBrowser on a full-viewport page', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Acme Support Center"
  page feed {
    viewport: full
    render: @openui {
      root = Stack([
        ViewBrowser("open_tickets", {
          title: "Activity feed",
          sort: { column: "type", direction: "asc" },
          filters: [{ column: "type", op: "eq", value: "CALL" }]
        }),
        StreamBrowser("ticket_rows", {
          title: "Activity log",
          version: "v1",
          sort: { column: "created_at", direction: "desc" }
        })
      ])
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast).filter((d) => d.severity !== 'warning')
    expect(diags).toEqual([])
    expect(ast.apps[0]?.pages[0]?.viewport).toBe('full')
  })

  test('parses channel page and rejects render + channel together', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Acme Support Center"
  page room {
    icon: "hash"
    channel: support_room
  }
}
`)
    expect(errors).toEqual([])
    const room = ast.apps[0]?.pages[0]
    expect(room?.channel).toBe('support_room')
    expect(room?.render).toBeUndefined()

    const diags = validate(ast)
    expect(diags.filter((d) => d.severity !== 'warning')).toEqual([])

    const both = parse(`
${PRELUDE}
app broken {
  label: "Broken"
  page room {
    channel: support_room
    render: @openui {
      root = Chat("support_room")
    }
  }
}
`)
    expect(
      both.errors.some((e) => e.message.includes('both render: and channel:')),
    ).toBe(true)
  })

  test('channel page requires swirls platform channel', () => {
    const { ast, errors } = parse(`
${PRELUDE}
channel slack_room {
  platform: slack
  agent: triage
}
app broken {
  label: "Broken"
  page room {
    channel: slack_room
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast, { host: openUiHost })
    expect(diags.some((d) => d.message.includes('platform: swirls'))).toBe(true)
  })

  test('parses and round-trips a threads page body with channel ranges', () => {
    const { ast, errors } = parse(`
${PRELUDE}
channel ops_room {
  platform: swirls
  agent: triage
}
app inbox {
  label: "Inbox"
  page threads {
    threads: [support_room, ops_room]
  }
}
`)

    expect(errors).toEqual([])
    const page = ast.apps[0]?.pages[0]
    expect(page?.threads).toEqual(['support_room', 'ops_room'])
    expect(page?.threadsRanges).toHaveLength(2)
    expect(validate(ast).filter((d) => d.severity !== 'warning')).toEqual([])

    const second = parse(serialize(ast))
    expect(second.errors).toEqual([])
    expect(second.ast.apps[0]?.pages[0]?.threads).toEqual([
      'support_room',
      'ops_room',
    ])
  })

  test('parses and round-trips a non-empty reviews workflow list with ranges', () => {
    const { ast, errors } = parse(`
${PRELUDE}
workflow escalate_request {
  label: "Escalate"
  root {
    type: code
    code: @ts { return { ok: true } }
  }
}
app review_queue {
  label: "Review queue"
  page pending {
    reviews: [refund_request, escalate_request]
  }
}
`)

    expect(errors).toEqual([])
    const page = ast.apps[0]?.pages[0]
    expect(page?.reviews).toEqual(['refund_request', 'escalate_request'])
    expect(page?.reviewsRanges).toHaveLength(2)
    expect(page?.reviewsRanges?.[0]?.start.line).toBeGreaterThan(0)
    expect(validate(ast).filter((d) => d.severity !== 'warning')).toEqual([])

    const second = parse(serialize(ast))
    expect(second.errors).toEqual([])
    expect(second.ast.apps[0]?.pages[0]?.reviews).toEqual([
      'refund_request',
      'escalate_request',
    ])
  })

  test('rejects empty, quoted, and mutually exclusive reviews page bodies', () => {
    const empty = parse(`
${PRELUDE}
app broken {
  label: "Broken"
  page pending {
    reviews: []
  }
}
`)
    expect(
      empty.errors.some((error) => error.message.includes('at least one')),
    ).toBe(true)

    const quoted = parse(`
${PRELUDE}
app broken {
  label: "Broken"
  page pending {
    reviews: ["refund_request"]
  }
}
`)
    expect(
      quoted.errors.some((error) =>
        error.message.includes('bare workflow identifiers'),
      ),
    ).toBe(true)

    const combined = parse(`
${PRELUDE}
app broken {
  label: "Broken"
  page pending {
    channel: support_room
    reviews: [refund_request]
  }
}
`)
    expect(
      combined.errors.some((error) =>
        error.message.includes('channel: and reviews:'),
      ),
    ).toBe(true)
  })

  test('validates every reviews workflow reference', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app broken {
  label: "Broken"
  page pending {
    reviews: [refund_request, missing_workflow]
  }
}
`)
    expect(errors).toEqual([])

    const diags = validate(ast)
    expect(
      diags.some((diagnostic) =>
        diagnostic.message.includes(
          'reviews workflow "missing_workflow" is not defined',
        ),
      ),
    ).toBe(true)
    expect(
      diags.some((diagnostic) =>
        diagnostic.message.includes(
          'reviews workflow "refund_request" is not defined',
        ),
      ),
    ).toBe(false)
  })

  test('resolves reviews workflows from the merged workspace index', () => {
    const { ast, errors } = parse(`
app review_queue {
  label: "Review queue"
  page pending {
    reviews: [remote_review]
  }
}
`)
    expect(errors).toEqual([])

    const emptyMap = () => new Map()
    const workspace = {
      forms: emptyMap(),
      webhooks: emptyMap(),
      schedules: emptyMap(),
      workflows: new Map([
        ['remote_review', [{ relativePath: 'remote.swirls', line: 1 }]],
      ]),
      streams: emptyMap(),
      views: emptyMap(),
      auths: emptyMap(),
      connections: emptyMap(),
      actions: emptyMap(),
      postgres: emptyMap(),
      databases: emptyMap(),
      migrations: emptyMap(),
      disk: emptyMap(),
      computer: emptyMap(),
      operation: emptyMap(),
      skill: emptyMap(),
      agent: emptyMap(),
      mcp: emptyMap(),
      channels: emptyMap(),
      queries: emptyMap(),
      connector: emptyMap(),
      apps: emptyMap(),
      mocks: emptyMap(),
      playbooks: emptyMap(),
      schemas: emptyMap(),
      secrets: emptyMap(),
      schemaLiterals: emptyMap(),
      workflowBlocks: emptyMap(),
      postgresBlocks: emptyMap(),
      databaseBlocks: emptyMap(),
      diskBlocks: emptyMap(),
      computerBlocks: emptyMap(),
      operationBlocks: emptyMap(),
      skillBlocks: emptyMap(),
      agentBlocks: emptyMap(),
      mcpBlocks: emptyMap(),
      channelBlocks: emptyMap(),
      queryBlocks: emptyMap(),
      connectionBlocks: emptyMap(),
      connectorBlocks: emptyMap(),
      actionBlocks: emptyMap(),
    } satisfies WorkspaceResourceIndex
    const diags = validate(ast, { workspace })
    expect(
      diags.some((diagnostic) =>
        diagnostic.message.includes(
          'reviews workflow "remote_review" is not defined',
        ),
      ),
    ).toBe(false)
  })

  test('parses sparse brand tokens and round-trips', () => {
    const { ast, errors } = parse(`
${PRELUDE}
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
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(errors).toEqual([])
    expect(ast.apps[0]?.brand?.tokens?.light?.canvas?.value).toBe('#f7f5f1')
    expect(ast.apps[0]?.brand?.tokens?.dark?.canvas?.value).toBe('#090807')
    expect(validate(ast).filter((d) => d.severity !== 'warning')).toEqual([])

    const second = parse(serialize(ast))
    expect(second.errors).toEqual([])
    expect(
      second.ast.apps[0]?.brand?.tokens?.light?.brand_foreground?.value,
    ).toBe('#ffffff')
    expect(second.ast.apps[0]?.brand?.tokens?.light?.viewport?.value).toBe(
      '#ffffff',
    )
    expect(second.ast.apps[0]?.brand?.tokens?.light?.warning?.value).toBe(
      '#a66a1f',
    )
    expect(second.ast.apps[0]?.brand?.tokens?.light?.radius?.value).toBe('8px')
  })

  test('rejects unknown brand token keys at parse time', () => {
    const { errors } = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    tokens {
      light {
        neon: "#ff00ff"
      }
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(errors.some((e) => e.message.includes('Unknown brand token'))).toBe(
      true,
    )
  })

  test('rejects invalid brand token colors at validate time', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    tokens {
      light {
        brand: "brick"
      }
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(errors).toEqual([])
    const diags = validate(ast)
    expect(
      diags.some((d) => d.message.includes('tokens.light.brand must be')),
    ).toBe(true)
  })

  test('parses brand avatar block and round-trips', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    accent: "#B33A2B"
    avatar {
      variant: "marble"
      colors: ["#9e3b3b", "#8b7355", "#f7eeee"]
      shape: "circle"
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(errors).toEqual([])
    expect(ast.apps[0]?.brand?.avatar?.variant).toBe('marble')
    expect(ast.apps[0]?.brand?.avatar?.colors).toEqual([
      '#9e3b3b',
      '#8b7355',
      '#f7eeee',
    ])
    expect(ast.apps[0]?.brand?.avatar?.shape).toBe('circle')
    expect(validate(ast).filter((d) => d.severity !== 'warning')).toEqual([])

    const second = parse(serialize(ast))
    expect(second.errors).toEqual([])
    expect(second.ast.apps[0]?.brand?.avatar?.variant).toBe('marble')
    expect(second.ast.apps[0]?.brand?.avatar?.colors).toEqual([
      '#9e3b3b',
      '#8b7355',
      '#f7eeee',
    ])
    expect(second.ast.apps[0]?.brand?.avatar?.shape).toBe('circle')
  })

  test('rejects unknown brand avatar properties at parse time', () => {
    const { errors } = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    avatar {
      seed: "oops"
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(
      errors.some((e) => e.message.includes('Unknown avatar property')),
    ).toBe(true)
  })

  test('rejects invalid brand avatar variant and colors at validate time', () => {
    const invalidVariant = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    avatar {
      variant: "neon"
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(invalidVariant.errors).toEqual([])
    expect(
      validate(invalidVariant.ast).some((d) =>
        d.message.includes('avatar variant "neon"'),
      ),
    ).toBe(true)

    const invalidColors = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    avatar {
      colors: ["brick"]
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(invalidColors.errors).toEqual([])
    expect(
      validate(invalidColors.ast).some((d) =>
        d.message.includes('avatar colors must be CSS colors'),
      ),
    ).toBe(true)

    const invalidShape = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  brand {
    avatar {
      shape: "rounded"
    }
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(invalidShape.errors).toEqual([])
    expect(
      validate(invalidShape.ast).some((d) =>
        d.message.includes('avatar shape "rounded"'),
      ),
    ).toBe(true)
  })

  test('parses landing block and round-trips', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  description: "Triage tickets."
  icon: "life-buoy"
  brand {
    accent: "#B33A2B"
    logo: "https://cdn.example.com/logo.svg"
  }
  landing {
    layout: split
    image: "https://cdn.example.com/hero.jpg"
    title: "Welcome to Support"
    subtitle: "Sign in to manage tickets."
    sign_in_title: "Sign in to your account"
    sign_in_hint: "Use your company email."
    footer: "Need access? Contact your admin."
  }
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
}
`)
    expect(errors).toEqual([])
    const landing = ast.apps[0]?.landing
    expect(landing?.layout).toBe('split')
    expect(landing?.image).toBe('https://cdn.example.com/hero.jpg')
    expect(landing?.signInTitle).toBe('Sign in to your account')
    expect(validate(ast).filter((d) => d.severity !== 'warning')).toEqual([])

    const second = parse(serialize(ast))
    expect(second.errors).toEqual([])
    expect(second.ast.apps[0]?.landing?.layout).toBe('split')
    expect(second.ast.apps[0]?.landing?.footer).toBe(
      'Need access? Contact your admin.',
    )
  })

  test('parses landing discover block and round-trips', () => {
    const { ast, errors } = parse(`
${PRELUDE}
app support_center {
  label: "Support"
  page dashboard {
    render: @openui {
      root = Stack([StatCard("Open", "42")])
    }
  }
  landing {
    title: "Support Desk"
    discover {
      index: true
      meta_title: "Support Desk — Sign in"
      meta_description: "Sign in to triage tickets."
      keywords: ["support", "tickets"]
      capabilities: ["Ticket triage"]
      faq {
        item {
          question: "Who can sign in?"
          answer: "Invited team members."
        }
      }
      organization: "Acme Support"
      application_category: "BusinessApplication"
    }
  }
}
`)
    expect(errors).toEqual([])
    const discover = ast.apps[0]?.landing?.discover
    expect(discover?.index).toBe(true)
    expect(discover?.metaTitle).toBe('Support Desk — Sign in')
    expect(discover?.keywords).toEqual(['support', 'tickets'])
    expect(discover?.faq?.items[0]?.question).toBe('Who can sign in?')
    expect(validate(ast).filter((d) => d.severity !== 'warning')).toEqual([])

    const second = parse(serialize(ast))
    expect(second.errors).toEqual([])
    expect(second.ast.apps[0]?.landing?.discover?.organization).toBe(
      'Acme Support',
    )
  })
})
