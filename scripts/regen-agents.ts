#!/usr/bin/env bun
// Regenerate skills/swirls-lang/AGENTS.md from rules/.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const SKILL_DIR = join(REPO_ROOT, 'skills', 'swirls-lang')
const RULES_DIR = join(SKILL_DIR, 'rules')
const OUT = join(SKILL_DIR, 'AGENTS.md')

type Section = { title: string; ordered: string[] }

// Files listed in `ordered[]` keep that order; any other rule file matching the section's prefix is appended alphabetically.
const sections: Record<string, Section> = {
  spec: {
    title: '1. Language Specification (READ FIRST)',
    ordered: ['spec-strict-syntax', 'spec-common-mistakes'],
  },
  structure: {
    title: '2. File Structure',
    ordered: ['structure-top-level-declarations', 'structure-file-discovery', 'structure-comments'],
  },
  workflow: {
    title: '3. Workflow & Node Basics',
    ordered: [
      'workflow-anatomy',
      'workflow-root-node',
      'workflow-flow-block',
      'workflow-dag-rules',
      'workflow-subgraph',
    ],
  },
  node: {
    title: '4. Node Types',
    ordered: [
      'node-code',
      'node-ai',
      'node-agent',
      'node-switch',
      'node-http',
      'node-email',
      'node-scrape',
      'node-parallel',
      'node-stream',
      'node-workflow',
      'node-map',
      'node-while',
      'node-wait',
      'node-bucket',
      'node-disk',
      'node-postgres',
      'node-secrets-map',
      'node-failure-policy',
    ],
  },
  ts: {
    title: '5. TypeScript Blocks',
    ordered: [
      'ts-block-syntax',
      'ts-sandbox-limits',
      'ts-safe-patterns',
      'ts-regex-literals',
      'ts-no-nested-code-blocks',
    ],
  },
  schema: {
    title: '6. Schema & Typing',
    ordered: ['schema-json-schema', 'schema-input-output', 'schema-inline-syntax'],
  },
  context: {
    title: '7. Context Object',
    ordered: ['context-nodes', 'context-iteration', 'context-secrets', 'context-reviews', 'context-meta'],
  },
  resource: {
    title: '8. Resources & Triggers',
    ordered: [
      'resource-form',
      'resource-webhook',
      'resource-schedule',
      'resource-stream',
      'resource-schema',
      'resource-trigger-binding',
      'resource-secrets',
      'resource-auth',
      'resource-postgres',
      'resource-disk',
      'resource-agent',
      'resource-channel',
      'resource-access-control',
    ],
  },
  stream: {
    title: '9. Streams',
    ordered: ['stream-persistence-block', 'stream-query-sql', 'stream-column-naming'],
  },
  review: {
    title: '10. Reviews',
    ordered: ['review-config', 'review-access-downstream'],
  },
  parser: {
    title: '11. Parser Pitfalls & Validator Diagnostics',
    ordered: [
      'parser-illegal-characters',
      'parser-hyphenated-headers',
      'parser-silent-drops',
      'parser-cascade-errors',
      'parser-validation-checklist',
      'parser-validation-rules',
    ],
  },
}

const allRules = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => f.replace(/\.md$/, ''))

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return raw
  return raw.slice(end + 5).replace(/^\n+/, '')
}

function demoteHeadings(md: string): string {
  return md.replace(/^(#{1,5}) /gm, (_, hashes: string) => `${'#'.repeat(hashes.length + 1)} `)
}

function compileRule(name: string): string {
  const raw = readFileSync(join(RULES_DIR, `${name}.md`), 'utf8')
  return `${demoteHeadings(stripFrontmatter(raw)).trim()}\n`
}

function rulesForSection(prefix: string, ordered: string[]): { used: string[]; missingFromOrder: string[] } {
  const matching = allRules.filter((n) => n.startsWith(`${prefix}-`))
  const ordSet = new Set(ordered)
  const inOrder = ordered.filter((n) => matching.includes(n))
  const leftovers = matching.filter((n) => !ordSet.has(n)).sort()
  return {
    used: [...inOrder, ...leftovers],
    missingFromOrder: ordered.filter((n) => !matching.includes(n)),
  }
}

const header =
  `# Swirls Language - Complete Reference\n\n` +
  `> Comprehensive guide for authoring \`.swirls\` workflow files. Compiled from the individual rule files under \`rules/\`.\n>\n` +
  `> **Source of truth lives in \`rules/\`.** This file is regenerated from those rules by \`scripts/regen-agents.ts\`. When in doubt, defer to \`rules/spec-strict-syntax.md\` and \`rules/spec-common-mistakes.md\`.\n>\n` +
  `> Current scope: **16 node types** (\`agent, ai, bucket, code, disk, email, http, map, parallel, postgres, scrape, stream, switch, wait, while, workflow\`; \`graph\` is a legacy alias for \`workflow\`), **16 top-level declarations** (\`schema, form, webhook, schedule, workflow, stream, trigger, secret, auth, postgres, disk, agent, channel, access, role, policy\`), inline \`subgraph { }\` for map/while, form \`visibility: public | internal\` and HTTP Basic \`auth:\`, webhook shared-secret \`secret:\` + \`header:\`, top-level \`schema <name> { }\` blocks referenced by bare identifier, \`context.iteration.*\` (item/index/input/previous) for map/while subgraphs, agent subagent \`team\`, \`channel\` blocks binding an agent to Slack / Linear / Discord / web, and access-control \`access\` / \`role\` / \`policy\` blocks.\n\n`

const warnings: string[] = []
const sectionBlocks: string[] = [header]
let totalRules = 0

for (const [prefix, section] of Object.entries(sections)) {
  const { used, missingFromOrder } = rulesForSection(prefix, section.ordered)
  for (const name of missingFromOrder) {
    warnings.push(`Section "${section.title}": rule "${name}" listed in ordered[] but missing on disk`)
  }
  totalRules += used.length
  const body = used.map(compileRule).join('\n---\n\n')
  sectionBlocks.push(`\n# ${section.title}\n\n${body}\n`)
}

const out = sectionBlocks.join('')
writeFileSync(OUT, out)
console.log(`Wrote ${out.length} chars to ${OUT}`)
console.log(`Sections: ${Object.keys(sections).length} | Rules compiled: ${totalRules}`)
if (warnings.length > 0) {
  console.warn('\nWarnings:')
  for (const w of warnings) console.warn(`  - ${w}`)
}
