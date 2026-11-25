import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { join } from 'pathe'

import { utf8Bytes, utf8Text } from '../bytes'
import { AGENTS_SKILLS_DIR, MAX_SKILL_FILE_BYTES, MAX_SKILL_FILES } from './constants'
import { resolveSkillTree } from './resolve-skill'
import { createMemorySkillDeployFs, memorySkillProjectRoot } from './test-memory-fs'

const FIXTURE_ROOT = join(import.meta.dir, '__fixtures__')
const PROJECT_ROOT = memorySkillProjectRoot('/project')

function fixtureFs(skillName: 'hello-knowledge' | 'hello-exec') {
  const prefix = `${AGENTS_SKILLS_DIR}/${skillName}/`
  const files: Record<string, Uint8Array> = {}

  function add(relative: string) {
    files[`${prefix}${relative}`] = new Uint8Array(
      readFileSync(join(FIXTURE_ROOT, skillName, relative)),
    )
  }

  if (skillName === 'hello-knowledge') {
    add('SKILL.md')
  } else {
    add('SKILL.md')
    add('scripts/hello.sh')
  }

  return createMemorySkillDeployFs(files, PROJECT_ROOT)
}

describe('resolveSkillTree', () => {
  test('resolves a knowledge skill tree with SKILL.md', () => {
    const fs = fixtureFs('hello-knowledge')
    const files = resolveSkillTree(fs, PROJECT_ROOT, 'hello-knowledge')

    expect(files.map((f) => f.path)).toEqual(['SKILL.md'])
    expect(utf8Text(files[0]?.bytes ?? new Uint8Array())).toContain('hello-knowledge')
  })

  test('includes nested files for executable fixture', () => {
    const fs = fixtureFs('hello-exec')
    const files = resolveSkillTree(fs, PROJECT_ROOT, 'hello-exec')

    expect(files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'scripts/hello.sh'])
  })

  test('errors when skill directory is missing', () => {
    const fs = createMemorySkillDeployFs({}, PROJECT_ROOT)

    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'missing')).toThrow(
      /not found under \.agents\/skills\/missing/,
    )
  })

  test('rejects path-traversal slugs at resolution time', () => {
    const fs = fixtureFs('hello-knowledge')
    expect(() => resolveSkillTree(fs, PROJECT_ROOT, '../x')).toThrow(/single path segment/)
    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'a/b')).toThrow(/single path segment/)
  })

  test('errors when SKILL.md is missing', () => {
    const fs = createMemorySkillDeployFs(
      {
        [`${AGENTS_SKILLS_DIR}/no-md/readme.md`]: '# readme',
      },
      PROJECT_ROOT,
    )

    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'no-md')).toThrow(/missing required SKILL\.md/)
  })

  test('rejects symlinks', () => {
    const baseFiles = {
      [`${AGENTS_SKILLS_DIR}/linked/SKILL.md`]: '---\nname: x\n---\n',
    }

    const fs = createMemorySkillDeployFs(baseFiles, PROJECT_ROOT)
    const skillRoot = memorySkillProjectRoot(PROJECT_ROOT)
    const linkedDir = `${skillRoot}/${AGENTS_SKILLS_DIR}/linked`
    const originalReaddir = fs.readdirSync.bind(fs)

    fs.readdirSync = (dir, options) => {
      if (dir === linkedDir) {
        return [
          { name: 'SKILL.md', isFile: () => true, isDirectory: () => false },
          { name: 'link', isFile: () => true, isDirectory: () => false },
        ]
      }

      return originalReaddir(dir, options)
    }

    const originalLstat = fs.lstatSync.bind(fs)

    fs.lstatSync = (path) => {
      if (path.endsWith('/link')) {
        return {
          isSymbolicLink: true,
          isFile: false,
          isDirectory: false,
        }
      }

      return originalLstat(path)
    }

    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'linked')).toThrow(/symlink/)
  })

  test('enforces per-file byte cap', () => {
    const fs = createMemorySkillDeployFs(
      {
        [`${AGENTS_SKILLS_DIR}/big/SKILL.md`]: new Uint8Array(MAX_SKILL_FILE_BYTES + 1),
      },
      PROJECT_ROOT,
    )

    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'big')).toThrow(/exceeds.*byte/)
  })

  test('enforces file-count cap', () => {
    const files: Record<string, Uint8Array> = {
      [`${AGENTS_SKILLS_DIR}/many/SKILL.md`]: utf8Bytes('x'),
    }

    for (let i = 0; i < MAX_SKILL_FILES; i++) {
      files[`${AGENTS_SKILLS_DIR}/many/file-${i}.txt`] = utf8Bytes('x')
    }

    const fs = createMemorySkillDeployFs(files, PROJECT_ROOT)

    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'many')).toThrow(/exceeds.*files/)
  })

  test('enforces tree byte cap', () => {
    const chunk = new Uint8Array(900 * 1024).fill(97)

    const fs = createMemorySkillDeployFs(
      {
        [`${AGENTS_SKILLS_DIR}/heavy/SKILL.md`]: chunk,
        [`${AGENTS_SKILLS_DIR}/heavy/a.txt`]: chunk,
        [`${AGENTS_SKILLS_DIR}/heavy/b.txt`]: chunk,
        [`${AGENTS_SKILLS_DIR}/heavy/c.txt`]: chunk,
        [`${AGENTS_SKILLS_DIR}/heavy/d.txt`]: chunk,
        [`${AGENTS_SKILLS_DIR}/heavy/e.txt`]: chunk,
      },
      PROJECT_ROOT,
    )

    expect(() => resolveSkillTree(fs, PROJECT_ROOT, 'heavy')).toThrow(/tree exceeds/)
  })
})
