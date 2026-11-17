import { describe, expect, test } from 'bun:test'

import {
  APP_BRAND_TOKEN_KEYS,
  brandTokensToCssVars,
  isCssColorValue,
  isCssLengthValue,
  isValidAppBrandTokenValue,
  resolveAppBrandTokenMap,
} from './app-brand-tokens'

describe('app brand token values', () => {
  test('accepts hex, oklch, rgb, and hsl colors', () => {
    expect(isCssColorValue('#B33A2B')).toBe(true)
    expect(isCssColorValue('#fff')).toBe(true)
    expect(isCssColorValue('oklch(0.972 0 0)')).toBe(true)
    expect(isCssColorValue('rgb(158 59 59)')).toBe(true)
    expect(isCssColorValue('hsl(0 70% 40%)')).toBe(true)
    expect(isCssColorValue('transparent')).toBe(true)
  })

  test('rejects empty and non-color strings', () => {
    expect(isCssColorValue('')).toBe(false)
    expect(isCssColorValue('brick')).toBe(false)
    expect(isCssColorValue('url(https://example.com)')).toBe(false)
  })

  test('accepts CSS lengths for radius', () => {
    expect(isCssLengthValue('8px')).toBe(true)
    expect(isCssLengthValue('0.5rem')).toBe(true)
    expect(isCssLengthValue('0')).toBe(true)
    expect(isValidAppBrandTokenValue('radius', '12px')).toBe(true)
    expect(isValidAppBrandTokenValue('radius', '#fff')).toBe(false)
    expect(isValidAppBrandTokenValue('brand', '8px')).toBe(false)
  })
})

describe('resolveAppBrandTokenMap', () => {
  test('uses accent as brand when the mode omits brand', () => {
    expect(
      resolveAppBrandTokenMap({
        accent: '#B33A2B',
        tokens: { light: { canvas: '#fff' } },
        mode: 'light',
      }),
    ).toEqual({ canvas: '#fff', brand: '#B33A2B' })
  })

  test('does not override an explicit brand token with accent', () => {
    expect(
      resolveAppBrandTokenMap({
        accent: '#B33A2B',
        tokens: { dark: { brand: '#c45a4a' } },
        mode: 'dark',
      }),
    ).toEqual({ brand: '#c45a4a' })
  })

  test('returns an empty map when nothing is set', () => {
    expect(resolveAppBrandTokenMap({ mode: 'light' })).toEqual({})
  })

  test('uses accent as brand when tokens are omitted', () => {
    expect(
      resolveAppBrandTokenMap({
        accent: '#B33A2B',
        mode: 'dark',
      }),
    ).toEqual({ brand: '#B33A2B' })
  })
})

describe('brandTokensToCssVars', () => {
  test('sets only the clusters for supplied keys', () => {
    const vars = brandTokensToCssVars({
      canvas: '#f7f5f1',
      brand: '#B33A2B',
      radius: '8px',
    })

    expect(vars['--background']).toBe('#f7f5f1')
    expect(vars['--primary']).toBe('#B33A2B')
    expect(vars['--brand']).toBe('#B33A2B')
    expect(vars['--sidebar-primary']).toBe('#B33A2B')
    expect(vars['--ring']).toBe('color-mix(in srgb, #B33A2B 42%, transparent)')
    expect(vars['--sidebar-ring']).toBe('color-mix(in srgb, #B33A2B 42%, transparent)')
    expect(vars['--radius']).toBe('8px')
    expect(vars['--foreground']).toBeUndefined()
    expect(vars['--sidebar']).toBeUndefined()
  })

  test('covers sidebar states and contrasting brand text without warm leaks', () => {
    const vars = brandTokensToCssVars({
      text: '#f3f4f6',
      active: '#22272e',
      brand_foreground: '#0c0f13',
      warning: '#d6a84b',
    })

    expect(vars['--accent-foreground']).toBe('#f3f4f6')
    expect(vars['--sidebar-accent-foreground']).toBe('#f3f4f6')
    expect(vars['--sidebar-accent']).toBe('#22272e')
    expect(vars['--primary-foreground']).toBe('#0c0f13')
    expect(vars['--sidebar-primary-foreground']).toBe('#0c0f13')
    expect(vars['--selection-foreground']).toBe('#0c0f13')
    expect(vars['--clay']).toBe('#d6a84b')
  })

  test('lets viewport override the surface fallback', () => {
    expect(
      brandTokensToCssVars({
        surface: '#f3f5f8',
        viewport: '#f8fafc',
      }),
    ).toMatchObject({
      '--sidebar': '#f3f5f8',
      '--viewport': '#f8fafc',
    })
  })

  test('covers every author key', () => {
    const all = Object.fromEntries(
      APP_BRAND_TOKEN_KEYS.map((key) => [key, key === 'radius' ? '8px' : '#111111']),
    )

    const vars = brandTokensToCssVars(all)

    expect(Object.keys(vars).sort()).toEqual(
      [
        '--background',
        '--foreground',
        '--card',
        '--card-foreground',
        '--popover',
        '--popover-foreground',
        '--primary',
        '--primary-foreground',
        '--brand',
        '--secondary',
        '--secondary-foreground',
        '--muted',
        '--muted-foreground',
        '--accent',
        '--accent-foreground',
        '--faint-foreground',
        '--destructive',
        '--border',
        '--input',
        '--ring',
        '--sidebar',
        '--sidebar-foreground',
        '--sidebar-primary',
        '--sidebar-primary-foreground',
        '--sidebar-accent',
        '--sidebar-accent-foreground',
        '--sidebar-border',
        '--sidebar-ring',
        '--viewport',
        '--brand-soft',
        '--clay',
        '--success',
        '--info',
        '--danger',
        '--selection-background',
        '--selection-foreground',
        '--radius',
      ].sort(),
    )
  })
})
