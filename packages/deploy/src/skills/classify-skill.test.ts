import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { join } from 'pathe'

import { utf8Bytes } from '../bytes'
import { computeSkillChecksum } from './checksum'
import { classifySkillBundle } from './classify-skill'
import type { SkillFileEntry } from './types'

const FIXTURE_ROOT = join(import.meta.dir, '__fixtures__')

function loadFixture(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_ROOT, relativePath)))
}

describe('classifySkillBundle', () => {
  test('classifies knowledge-only trees', () => {
    const files: SkillFileEntry[] = [
      {
        path: 'SKILL.md',
        bytes: loadFixture('hello-knowledge/SKILL.md'),
      },
    ]

    expect(classifySkillBundle(files)).toEqual({ kind: 'knowledge' })
  })

  test('rejects script extensions under scripts/', () => {
    const files: SkillFileEntry[] = [
      {
        path: 'SKILL.md',
        bytes: loadFixture('hello-exec/SKILL.md'),
      },
      {
        path: 'scripts/hello.sh',
        bytes: loadFixture('hello-exec/scripts/hello.sh'),
      },
    ]

    expect(classifySkillBundle(files)).toEqual({
      kind: 'executable',
      triggerFile: 'scripts/hello.sh',
    })
  })

  test('rejects shebang files', () => {
    const files: SkillFileEntry[] = [
      {
        path: 'run.sh',
        bytes: utf8Bytes('#!/bin/sh\necho hi\n'),
      },
    ]

    expect(classifySkillBundle(files)).toEqual({
      kind: 'executable',
      triggerFile: 'run.sh',
    })
  })
})

describe('computeSkillChecksum', () => {
  test('is stable regardless of input order', () => {
    const a: SkillFileEntry[] = [
      { path: 'a.txt', bytes: utf8Bytes('a') },
      { path: 'b.txt', bytes: utf8Bytes('b') },
    ]

    // oxlint-disable-next-line unicorn/no-array-reverse -- reverses a copy; toReversed is not in the ES2022 lib
    const b: SkillFileEntry[] = [...a].reverse()

    expect(computeSkillChecksum(a)).toBe(computeSkillChecksum(b))
  })

  test('ignores file mode in checksum input (path + bytes only)', () => {
    const base: SkillFileEntry[] = [{ path: 'SKILL.md', bytes: utf8Bytes('---\nname: x\n---\n') }]

    const duplicate: SkillFileEntry[] = [
      { path: 'SKILL.md', bytes: utf8Bytes('---\nname: x\n---\n') },
    ]

    expect(computeSkillChecksum(base)).toBe(computeSkillChecksum(duplicate))
  })

  test('classifies identically regardless of hypothetical file mode', () => {
    const files: SkillFileEntry[] = [
      {
        path: 'SKILL.md',
        bytes: loadFixture('hello-knowledge/SKILL.md'),
      },
    ]

    expect(classifySkillBundle(files)).toEqual({ kind: 'knowledge' })
    expect(classifySkillBundle([...files])).toEqual({ kind: 'knowledge' })
  })
})
