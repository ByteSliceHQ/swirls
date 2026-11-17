import { describe, expect, test } from 'bun:test'

import { appAvatarSchema, isAppAvatarShape, isAppAvatarVariant } from './app-avatar'

describe('app-avatar', () => {
  test('isAppAvatarVariant accepts boring-avatars styles', () => {
    expect(isAppAvatarVariant('marble')).toBe(true)
    expect(isAppAvatarVariant('beam')).toBe(true)
    expect(isAppAvatarVariant('unknown')).toBe(false)
  })

  test('isAppAvatarShape accepts square and circle', () => {
    expect(isAppAvatarShape('square')).toBe(true)
    expect(isAppAvatarShape('circle')).toBe(true)
    expect(isAppAvatarShape('rounded')).toBe(false)
  })

  test('appAvatarSchema accepts sparse avatar config', () => {
    expect(appAvatarSchema.safeParse({ variant: 'marble' }).success).toBe(true)
    expect(appAvatarSchema.safeParse({ colors: ['#9e3b3b', '#8b7355'] }).success).toBe(true)
    expect(appAvatarSchema.safeParse({ shape: 'circle' }).success).toBe(true)

    expect(
      appAvatarSchema.safeParse({
        variant: 'ring',
        colors: ['#9e3b3b'],
        shape: 'square',
      }).success,
    ).toBe(true)
  })

  test('appAvatarSchema rejects unknown variant and empty colors', () => {
    expect(appAvatarSchema.safeParse({ variant: 'neon' }).success).toBe(false)
    expect(appAvatarSchema.safeParse({ colors: [] }).success).toBe(false)
    expect(appAvatarSchema.safeParse({ shape: 'pill' }).success).toBe(false)
  })
})
