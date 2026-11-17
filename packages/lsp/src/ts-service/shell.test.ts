import { expect, test } from 'bun:test'
import { parse } from '@swirls/language'
import { createLanguageServiceFromMap, virtualUriForBlock } from './host'
import { buildVirtualTsContent, collectTsBlocks } from './virtual-docs'

function diagnostics(command: string): string[] {
  const parsed = parse(`
secret github { vars: [GH_TOKEN] }
computer pr_bot {}

workflow g {
  label: "G"
  root {
    label: "Start"
    type: code
    code: @ts { return { repo: "acme/app" } }
  }
  node run {
    type: shell
    computer: pr_bot
    secrets: { github: [GH_TOKEN] }
    command: @ts { ${command} }
  }
  flow { root -> run }
}
`)
  expect(parsed.errors).toEqual([])
  const blocks = collectTsBlocks(parsed.ast).filter(
    (block) => block.nodeName === 'run',
  )
  expect(blocks).toHaveLength(1)
  const content = new Map(
    blocks.map((block, i) => [
      virtualUriForBlock(String(i)),
      buildVirtualTsContent(block),
    ]),
  )
  const service = createLanguageServiceFromMap(content)
  return blocks.flatMap((_block, i) =>
    service
      .getSemanticDiagnostics(virtualUriForBlock(String(i)))
      .map((d) =>
        typeof d.messageText === 'string'
          ? d.messageText
          : d.messageText.messageText,
      ),
  )
}

test('shell command @ts reads upstream outputs', () => {
  expect(
    diagnostics(
      'return "gh repo clone " + String(context.nodes.root.output) + context.meta.triggerType',
    ),
  ).toEqual([])
})

test('shell command @ts has no context.secrets', () => {
  expect(
    diagnostics('return "echo " + context.secrets.github.GH_TOKEN'),
  ).toEqual([expect.stringContaining("Property 'secrets' does not exist")])
})
