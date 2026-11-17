/**
 * Single source for LSP navigation manifest tests: allowlist, AST scan pattern,
 * and behavioral definition / reference cases.
 */

/** AST fields that are not cross-reference navigation targets. */
export const NAV_REF_ALLOWLIST = new Set([
  'visibilityRange',
  'flowRange',
  'skillNameRange',
  'versionRange',
  'providerRange',
  'platformRange',
  'modeRange',
  'regionRange',
  'claimRange',
  'valueRange',
  'effectRange',
  'descriptionRange',
  'systemCodeRange',
  'modelRange',
  'temperatureRange',
  'maxTokensRange',
  'maxStepsRange',
  'cpusRange',
  'memoryMiBRange',
  'diskGiBRange',
  'autoStopMinutesRange',
  'autoArchiveMinutesRange',
  'autoDeleteMinutesRange',
  'ephemeralRange',
  'budgetRange',
  'cadenceRange',
  'maxPerCallRange',
  'methodRange',
  'pathRange',
  'encodingRange',
  'scopesRange',
  'inputRefRange',
  'outputRefRange',
  'graphqlDocumentRange',
  'sourcePathRange',
  'innerRange',
  'networkRefRange',
  'range',
])

export const AST_NAV_REF_FIELD_PATTERN =
  /^\s+(?:\w+RefRange|\w+Ranges|agentRange|connectionRange|connectorRange|workflowNameRange|workflowRange|actionRange|nodeRange|mocksRange|roleRange|secretsRefRange|skillNameRange|claimRange|valueRange|effectRange|platformRange|modeRange|providerRange|regionRange|visibilityRange|versionRange)\??:/

export type NavRefsConfig = {
  refSubstring?: string
  includeDeclaration?: boolean
  minLocations: number
  mustIncludeLines?: number[]
  resolveMustIncludeFromContent?: boolean
}

export type NavDefinitionCase = {
  name: string
  /**
   * The case documents a navigation gap: the test is expected to fail and
   * starts erroring the day the gap is closed, so the flag gets removed.
   */
  knownGap?: true
  /** Structural accounting: maps a behavioral case to an AST ref-range field. */
  astField?: string
  fixture?: string
  uri?: string
  /** When set, expected definition URI for cross-file cases (defaults to case uri). */
  expectedDefUri?: string
  inline?: string
  line?: number
  /** When set, runs getDefinition at this reference site. */
  refSubstring?: string
  expectedDefLine?: number
  expectedDefSubstring?: string
  refs?: NavRefsConfig
}

const INLINE_DISK_AGENT = `secret s { vars: [K] }
disk shared_d { }
agent a {
  secrets: s
  model: "gpt-4o"
  disks: [shared_d]
}
workflow w {
  label: "W"
  root { type: code code: @ts { return {} } }
  node d {
    type: disk
    disk: shared_d
    command: "ls"
  }
}
`

const INLINE_PLAYBOOK_MOCK = `workflow wf {
  label: "W"
  root { type: code code: @ts { return {} } }
  node review_n {
    type: code
    code: @ts { return {} }
    review: true
  }
}

mock review_stub {
  workflow: wf
  node: review_n
  review: { auto: approve }
}

playbook suite {
  mocks: review_stub
  case happy {
    workflow: wf
    input: {}
    expect {
      node review_n.output: {}
    }
  }
}
`

const INLINE_MCP_AGENT = `mcp axiom_observability {
  label: "Axiom"
  url: "https://mcp.example.com/mcp"
}
agent a {
  secrets: s
  model: "gpt-4o"
  mcp: [axiom_observability]
  profile oncall {
    description: "on call"
    mcp: [axiom_observability]
  }
}
secret s { vars: [K] }
`

const INLINE_APP_PAGE_REFERENCES = `secret s { vars: [K] }
agent a {
  secrets: s
  model: "gpt-4o"
}
channel support {
  platform: portal
  agent: a
}
workflow review_flow {
  label: "Review flow"
  root { type: code code: @ts { return {} } }
}
app console {
  label: "Console"
  page inbox {
    threads: [support]
  }
  page approvals {
    reviews: [review_flow]
  }
}
`

const INLINE_POLICY = `secret s { vars: [K] }
role admins { match { org: admin } }
agent concierge {
  secrets: s
  model: "gpt-4o"
}
workflow notify {
  label: "Notify"
  root { type: code code: @ts { return {} } }
}
policy {
  allow admins -> agent concierge {
    workflows: [notify]
  }
}
`

const INLINE_CHANNEL_CONNECTION = `secret s { vars: [K] }
connection slack_ws { provider: slack }
agent concierge {
  secrets: s
  model: "gpt-4o"
}
channel web_bot {
  platform: slack
  connection: slack_ws
  agent: concierge
}
`

const INLINE_CHANNEL_CONNECTOR = `secret s { vars: [K] }
connector client_portal { label: "Client connector" }
agent concierge {
  secrets: s
  model: "gpt-4o"
}
channel finance {
  platform: mcp
  connector: client_portal
  agent: concierge
}
`

/** Behavioral and structural navigation cases. */
export const NAV_DEFINITION_CASES: NavDefinitionCase[] = [
  // Declaration smoke (header → same block)
  {
    name: 'decl-workflow',
    fixture: 'packages/language/examples/switch-routing.swirls',
    line: 17,
    refSubstring: 'triage_ticket',
    expectedDefSubstring: 'workflow triage_ticket',
  },
  {
    name: 'decl-form',
    fixture: 'packages/language/examples/switch-routing.swirls',
    line: 0,
    refSubstring: 'support_ticket',
    expectedDefSubstring: 'form support_ticket',
  },
  {
    name: 'decl-agent',
    fixture: 'packages/language/examples/slack-team-orchestrator.swirls',
    line: 16,
    refSubstring: 'slack_orchestrator',
    expectedDefSubstring: 'agent slack_orchestrator',
  },
  {
    name: 'node-in-flow',
    fixture: 'packages/language/examples/switch-routing.swirls',
    line: 107,
    refSubstring: 'root',
    expectedDefLine: 20,
  },
  {
    name: 'trigger-workflow',
    astField: 'workflowNameRange',
    fixture: 'packages/language/examples/switch-routing.swirls',
    line: 115,
    refSubstring: 'triage_ticket',
    expectedDefLine: 17,
    refs: {
      includeDeclaration: true,
      minLocations: 2,
      mustIncludeLines: [17, 114],
    },
  },
  {
    name: 'trigger-form',
    fixture: 'packages/language/examples/switch-routing.swirls',
    line: 115,
    refSubstring: 'support_ticket',
    expectedDefLine: 0,
  },
  {
    name: 'auth-secrets',
    astField: 'secretsRefRange',
    fixture: 'packages/language/src/__fixtures__/valid-auth.swirls',
    line: 23,
    refSubstring: 'gh',
    expectedDefLine: 2,
  },
  {
    name: 'node-auth',
    astField: 'configFields.auth',
    fixture: 'packages/language/src/__fixtures__/valid-auth.swirls',
    line: 60,
    refSubstring: 'oauth_ex',
    expectedDefLine: 20,
  },
  {
    name: 'secrets-map',
    astField: 'secretsMapBlockRanges',
    fixture: 'packages/language/examples/secrets-declaration.swirls',
    line: 20,
    refSubstring: 'my_svc',
    expectedDefLine: 4,
  },
  {
    name: 'stream-workflow',
    astField: 'workflowNameRange',
    fixture: 'packages/language/src/__fixtures__/valid-stream.swirls',
    line: 41,
    refSubstring: 'process_leads',
    expectedDefLine: 0,
  },
  {
    name: 'named-schema',
    astField: 'schemaRefRange',
    fixture: 'packages/language/examples/named-schema.swirls',
    line: 24,
    refSubstring: 'contact_payload',
    expectedDefLine: 5,
  },
  {
    name: 'root-input-schema',
    astField: 'inputSchemaRefRange',
    fixture: 'packages/language/src/__fixtures__/valid-full.swirls',
    line: 39,
    refSubstring: 'full_form_payload',
    expectedDefSubstring: 'schema full_form_payload',
  },
  {
    name: 'root-output-schema',
    astField: 'outputSchemaRefRange',
    fixture: 'packages/language/src/__fixtures__/valid-full.swirls',
    line: 40,
    refSubstring: 'full_form_payload',
    expectedDefSubstring: 'schema full_form_payload',
  },
  {
    name: 'graph-node',
    astField: 'configFields.workflow',
    fixture: 'packages/language/examples/subgraph-workflow.swirls',
    line: 61,
    refSubstring: 'helper_graph',
    expectedDefLine: 27,
  },
  {
    name: 'agent-secrets',
    astField: 'secretsRefRange',
    fixture: 'packages/language/examples/chat-delegating.swirls',
    line: 16,
    refSubstring: 'research_svc',
    expectedDefLine: 8,
  },
  {
    name: 'agent-tools',
    astField: 'toolsRanges',
    fixture: 'packages/language/examples/chat-delegating.swirls',
    line: 37,
    refSubstring: 'fake_search',
    expectedDefLine: 48,
  },
  {
    name: 'agent-team',
    astField: 'teamRanges',
    fixture: 'packages/language/examples/chat-delegating.swirls',
    line: 20,
    refSubstring: 'research_specialist',
    expectedDefLine: 31,
  },
  {
    name: 'integration-connection',
    astField: 'configFields.connection',
    fixture: 'packages/language/src/__fixtures__/valid-integration.swirls',
    line: 73,
    refSubstring: 'team_slack',
    expectedDefLine: 35,
  },
  {
    name: 'integration-action',
    astField: 'configFields.action',
    fixture: 'packages/language/src/__fixtures__/valid-integration.swirls',
    line: 74,
    refSubstring: 'slack_post_message',
    expectedDefLine: 2,
  },
  {
    name: 'channel-agent',
    astField: 'agentRange',
    fixture: 'packages/language/examples/slack-team-orchestrator.swirls',
    line: 36,
    refSubstring: 'slack_orchestrator',
    expectedDefLine: 16,
    refs: {
      includeDeclaration: true,
      minLocations: 3,
      mustIncludeLines: [16, 36, 44],
    },
  },
  {
    name: 'channel-connection',
    astField: 'connectionRange',
    inline: INLINE_CHANNEL_CONNECTION,
    line: 8,
    refSubstring: 'slack_ws',
    expectedDefSubstring: 'connection slack_ws',
  },
  {
    name: 'channel-connector',
    astField: 'connectorRange',
    inline: INLINE_CHANNEL_CONNECTOR,
    line: 8,
    refSubstring: 'client_portal',
    expectedDefSubstring: 'connector client_portal',
    refs: {
      refSubstring: 'connector client_portal',
      includeDeclaration: true,
      minLocations: 2,
      mustIncludeLines: [1, 8],
    },
  },
  {
    name: 'agent-skills',
    astField: 'skillsRanges',
    fixture: 'packages/lsp/src/__fixtures__/agent-skills.swirls',
    line: 18,
    refSubstring: 'swirls_lang',
    expectedDefLine: 7,
    refs: {
      refSubstring: 'skill swirls_lang',
      includeDeclaration: true,
      minLocations: 2,
      mustIncludeLines: [7, 18],
    },
  },
  {
    name: 'connection-auth',
    astField: 'authRefRange',
    inline: `secret s { vars: [K] }
auth my_auth { type: api_key secrets: s key: K header: "X-Key" }
connection c {
  label: "C"
  provider: http
  base_url: "https://example.com"
  auth: my_auth
}
`,
    line: 6,
    refSubstring: 'my_auth',
    expectedDefLine: 1,
  },
  {
    name: 'agent-mcp',
    astField: 'mcpRanges',
    inline: INLINE_MCP_AGENT,
    line: 7,
    refSubstring: 'axiom_observability',
    expectedDefLine: 0,
    refs: {
      refSubstring: 'mcp axiom_observability',
      includeDeclaration: true,
      minLocations: 3,
      mustIncludeLines: [0, 7, 10],
    },
  },
  {
    name: 'app-threads-channel',
    knownGap: true,
    astField: 'threadsRanges',
    inline: INLINE_APP_PAGE_REFERENCES,
    line: 16,
    refSubstring: 'support',
    expectedDefLine: 5,
    refs: {
      includeDeclaration: true,
      minLocations: 2,
      mustIncludeLines: [5, 16],
    },
  },
  {
    name: 'app-reviews-workflow',
    knownGap: true,
    astField: 'reviewsRanges',
    inline: INLINE_APP_PAGE_REFERENCES,
    line: 19,
    refSubstring: 'review_flow',
    expectedDefLine: 9,
    refs: {
      includeDeclaration: true,
      minLocations: 2,
      mustIncludeLines: [9, 19],
    },
  },
  {
    name: 'disk-node',
    astField: 'configFields.disk',
    fixture: 'packages/language/examples/disk.swirls',
    line: 19,
    refSubstring: 'project_disk',
    expectedDefLine: 0,
  },
  {
    name: 'agent-disks',
    astField: 'disksRanges',
    inline: INLINE_DISK_AGENT,
    line: 5,
    refSubstring: 'shared_d',
    expectedDefLine: 1,
    refs: {
      refSubstring: 'disk shared_d',
      includeDeclaration: true,
      minLocations: 3,
      resolveMustIncludeFromContent: true,
    },
  },
  {
    name: 'policy-grant-role',
    astField: 'roleRange',
    inline: INLINE_POLICY,
    line: 11,
    refSubstring: 'admins',
    expectedDefSubstring: 'role admins',
  },
  {
    name: 'policy-grant-agent',
    astField: 'agentRange',
    inline: INLINE_POLICY,
    line: 11,
    refSubstring: 'concierge',
    expectedDefSubstring: 'agent concierge',
  },
  {
    name: 'policy-grant-workflows',
    astField: 'workflowsRanges',
    inline: INLINE_POLICY,
    line: 12,
    refSubstring: 'notify',
    expectedDefSubstring: 'workflow notify',
  },
  {
    name: 'playbook-mocks',
    astField: 'mocksRange',
    inline: INLINE_PLAYBOOK_MOCK,
    line: 17,
    refSubstring: 'review_stub',
    expectedDefSubstring: 'mock review_stub',
    refs: {
      refSubstring: 'mock review_stub',
      includeDeclaration: true,
      minLocations: 2,
      mustIncludeLines: [10, 17],
    },
  },
  {
    name: 'playbook-case-workflow',
    astField: 'workflowRange',
    inline: INLINE_PLAYBOOK_MOCK,
    line: 19,
    refSubstring: 'wf',
    expectedDefSubstring: 'workflow wf',
    refs: {
      refSubstring: 'workflow wf',
      includeDeclaration: true,
      minLocations: 3,
      mustIncludeLines: [0, 11, 19],
    },
  },
  {
    name: 'mock-workflow',
    astField: 'workflowRange',
    inline: INLINE_PLAYBOOK_MOCK,
    line: 11,
    refSubstring: 'wf',
    expectedDefSubstring: 'workflow wf',
  },
  {
    name: 'mock-node',
    astField: 'nodeRange',
    inline: INLINE_PLAYBOOK_MOCK,
    line: 12,
    refSubstring: 'review_n',
    expectedDefSubstring: 'node review_n',
  },
  {
    name: 'playbook-expect-node',
    astField: 'range',
    inline: INLINE_PLAYBOOK_MOCK,
    line: 22,
    refSubstring: 'review_n',
    expectedDefSubstring: 'node review_n',
  },
  // Structural-only: composite config keys not discovered by AST scan
  { name: 'struct-config-profile', astField: 'configFields.profile' },
  { name: 'struct-config-stream', astField: 'configFields.stream' },
  { name: 'struct-config-postgres', astField: 'configFields.postgres' },
  { name: 'struct-view-stream-ref', astField: 'view.streams[].range' },
  { name: 'struct-form-auth-ref', astField: 'authRef.range' },
  { name: 'struct-webhook-secret-ref', astField: 'secretRef.range' },
  { name: 'struct-review-schema-ref', astField: 'reviewSchemaRefRange' },
  { name: 'struct-mock-action', astField: 'actionRange' },
]
