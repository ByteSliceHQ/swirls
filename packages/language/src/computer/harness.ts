/**
 * The coding harnesses the hosted Swirls runtime can deliver into a `computer`
 * guest. This is runtime policy, not language: the parser accepts any bare
 * name in `harness: { type, provider }`, and the validator checks it against
 * whatever `HarnessCatalog` the host supplies. This one is exposed through
 * `swirlsHost`.
 */

import type { HarnessCatalog } from '../host'

export const SWIRLS_HARNESSES: HarnessCatalog = {
  types: [
    {
      name: 'coding',
      description: 'A coding agent CLI on the guest PATH, driven by a shell node',
    },
  ],
  providers: [
    {
      name: 'claude',
      description: 'Claude Code, run as `claude -p` with permissions skipped',
      package: 'claude-code',
    },
    {
      name: 'codex',
      description: 'OpenAI Codex CLI, run as `codex exec` with its inner sandbox off',
      package: 'codex',
    },
    {
      name: 'pi',
      description: 'Pi coding agent, run as `pi --print`',
      package: 'pi-coding-agent',
    },
    {
      name: 'hermes',
      description: 'Hermes agent, run as `hermes -z` in YOLO mode',
      package: 'hermes-agent',
    },
  ],
}
