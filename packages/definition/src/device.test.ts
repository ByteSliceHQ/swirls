import { describe, expect, test } from 'bun:test'

import {
  type DeviceSelector,
  deviceInstallCommands,
  deviceMatchesSelector,
  deviceSelectorSchema,
  deviceTagSchema,
  deviceTagsSchema,
  parseDeviceTagsInput,
} from './device'

const laptop = {
  status: 'active',
  os: 'windows',
  tags: ['front-office', 'site:denver'],
}

describe('deviceTagSchema', () => {
  test.each(['front-office', 'site:denver', 'win11', 'tier_1', 'v2.0'])(
    'should accept %s',
    (tag) => {
      expect(deviceTagSchema.safeParse(tag).success).toBe(true)
    },
  )

  test.each([
    ['Front-Office', 'an uppercase letter'],
    ['front office', 'a space'],
    ['-front', 'a leading dash'],
    ['', 'nothing in it'],
    ['a'.repeat(64), 'too many characters'],
  ])('should refuse %j, which has %s', (tag) => {
    expect(deviceTagSchema.safeParse(tag).success).toBe(false)
  })
})

describe('deviceTagsSchema', () => {
  test('should drop duplicates and sort, so equal sets store the same', () => {
    expect(deviceTagsSchema.parse(['b', 'a', 'b'])).toEqual(['a', 'b'])
  })

  test('should refuse more tags than a device can carry', () => {
    const tags = Array.from({ length: 33 }, (_, index) => `tag-${index}`)
    expect(deviceTagsSchema.safeParse(tags).success).toBe(false)
  })
})

describe('deviceSelectorSchema', () => {
  test('should accept tags alone', () => {
    expect(deviceSelectorSchema.safeParse({ tags: ['kiosk'] }).success).toBe(true)
  })

  test('should accept an os alone', () => {
    expect(deviceSelectorSchema.safeParse({ os: 'windows' }).success).toBe(true)
  })

  test('should refuse a selector that would match every device', () => {
    expect(deviceSelectorSchema.safeParse({}).success).toBe(false)
  })

  test('should refuse an empty tag list with no os', () => {
    expect(deviceSelectorSchema.safeParse({ tags: [] }).success).toBe(false)
  })

  test('should refuse a field it does not know', () => {
    const parsed = deviceSelectorSchema.safeParse({ os: 'windows', all: true })
    expect(parsed.success).toBe(false)
  })
})

describe('deviceMatchesSelector', () => {
  test('should match a device that has every tag', () => {
    const selector = { tags: ['front-office', 'site:denver'] }
    expect(deviceMatchesSelector(laptop, selector)).toBe(true)
  })

  test('should not match a device missing one of the tags', () => {
    const selector = { tags: ['front-office', 'kiosk'] }
    expect(deviceMatchesSelector(laptop, selector)).toBe(false)
  })

  test('should not match a device on another operating system', () => {
    expect(deviceMatchesSelector(laptop, { os: 'macos' })).toBe(false)
  })

  test('should require the os and the tags together', () => {
    const selector: DeviceSelector = { os: 'windows', tags: ['front-office'] }
    expect(deviceMatchesSelector(laptop, selector)).toBe(true)
  })

  test('should never match a revoked device', () => {
    const revoked = { ...laptop, status: 'revoked' }
    expect(deviceMatchesSelector(revoked, { os: 'windows' })).toBe(false)
  })
})

describe('parseDeviceTagsInput', () => {
  test('should read tags separated by commas and spaces', () => {
    expect(parseDeviceTagsInput('kiosk, front-office  site:denver')).toEqual({
      ok: true,
      tags: ['front-office', 'kiosk', 'site:denver'],
    })
  })

  test('should lowercase what a person typed', () => {
    expect(parseDeviceTagsInput('Front-Office')).toEqual({
      ok: true,
      tags: ['front-office'],
    })
  })

  test('should read empty text as no tags', () => {
    expect(parseDeviceTagsInput('  ')).toEqual({ ok: true, tags: [] })
  })

  test('should name the entry that is not a valid tag', () => {
    expect(parseDeviceTagsInput('kiosk, front/office')).toEqual({
      ok: false,
      invalid: 'front/office',
    })
  })
})

describe('deviceInstallCommands', () => {
  const production = deviceInstallCommands({
    token: 'swe_abc',
    apiUrl: 'https://swirls.ai/api',
    webUrl: 'https://swirls.ai',
  })

  const staging = deviceInstallCommands({
    token: 'swe_abc',
    apiUrl: 'https://staging.example.test/api/',
    webUrl: 'https://staging.example.test/',
  })

  test('should set the token in the environment on Windows', () => {
    expect(production.windows).toEqual([
      '$env:SWIRLSOPS_ENROLLMENT_TOKEN = "swe_abc"',
      'irm https://swirls.ai/swirlsops/install.ps1 | iex',
    ])
  })

  test('should carry the token through sudo by name on Unix', () => {
    expect(production.unix).toEqual([
      'export SWIRLSOPS_ENROLLMENT_TOKEN="swe_abc"',
      'curl -fsSL https://swirls.ai/swirlsops/install | sudo --preserve-env=SWIRLSOPS_ENROLLMENT_TOKEN sh',
    ])
  })

  test('should name the API on Windows when it is not the default', () => {
    expect(staging.windows).toEqual([
      '$env:SWIRLSOPS_ENROLLMENT_TOKEN = "swe_abc"',
      '$env:SWIRLSOPS_API_URL = "https://staging.example.test/api"',
      'irm https://staging.example.test/swirlsops/install.ps1 | iex',
    ])
  })

  test('should name the API on Unix when it is not the default', () => {
    expect(staging.unix).toEqual([
      'export SWIRLSOPS_ENROLLMENT_TOKEN="swe_abc"',
      'export SWIRLSOPS_API_URL="https://staging.example.test/api"',
      'curl -fsSL https://staging.example.test/swirlsops/install | sudo --preserve-env=SWIRLSOPS_ENROLLMENT_TOKEN,SWIRLSOPS_API_URL sh',
    ])
  })
})
