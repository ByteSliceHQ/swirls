/**
 * Sparse `app … { brand { tokens { light { } dark { } } } }` overlay keys.
 *
 * Authors name Swirls roles (canvas, brand, …), not raw shadcn variables. The
 * mapper expands each key into the CSS custom properties `@swirls/ui` reads.
 * Lives in `@swirls/definition` so the DSL validator, deployment definition, and
 * Surface runtime share one list — `@swirls/language` already depends here.
 */

import { z } from 'zod'

export const APP_BRAND_TOKEN_KEYS = [
  'canvas',
  'text',
  'text_muted',
  'text_dim',
  'surface',
  'viewport',
  'raised',
  'active',
  'field',
  'border',
  'brand',
  'brand_foreground',
  'brand_soft',
  'warning',
  'success',
  'info',
  'danger',
  'radius',
] as const

export type AppBrandTokenKey = (typeof APP_BRAND_TOKEN_KEYS)[number]

export type AppBrandTokenMap = Partial<Record<AppBrandTokenKey, string>>

export type AppBrandTokens = {
  light?: AppBrandTokenMap
  dark?: AppBrandTokenMap
}

export function isAppBrandTokenKey(value: string): value is AppBrandTokenKey {
  return (APP_BRAND_TOKEN_KEYS as readonly string[]).includes(value)
}

/** Quoted CSS color: hex, rgb/a, hsl/a, oklch/oklab, or transparent. */
export function isCssColorValue(value: string): boolean {
  const trimmed = value.trim()

  if (trimmed === 'transparent') {
    return true
  }

  if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return true
  }

  return /^(?:oklch|oklab|rgb|rgba|hsl|hsla|hwb)\([^)]*\)$/i.test(trimmed)
}

/** CSS length used for `radius` (`8px`, `0.5rem`, `0`). */
export function isCssLengthValue(value: string): boolean {
  const trimmed = value.trim()

  if (trimmed === '0') {
    return true
  }

  return /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%)$/.test(trimmed)
}

export function isValidAppBrandTokenValue(key: AppBrandTokenKey, value: string): boolean {
  if (key === 'radius') {
    return isCssLengthValue(value)
  }

  return isCssColorValue(value)
}

/**
 * `accent` fills `brand` in any mode that did not set it. Empty maps stay empty
 * aside from that shorthand so unspecified keys inherit Swirls CSS defaults.
 */
export function resolveAppBrandTokenMap(input: {
  accent?: string
  tokens?: AppBrandTokens
  mode: 'light' | 'dark'
}): AppBrandTokenMap {
  const fromMode = input.tokens?.[input.mode] ?? {}

  if (fromMode.brand !== undefined || input.accent === undefined) {
    return { ...fromMode }
  }

  return { ...fromMode, brand: input.accent }
}

const TOKEN_CSS_VARS: Record<AppBrandTokenKey, readonly string[]> = {
  canvas: ['--background'],
  text: [
    '--foreground',
    '--card-foreground',
    '--popover-foreground',
    '--sidebar-foreground',
    '--secondary-foreground',
    '--accent-foreground',
    '--sidebar-accent-foreground',
  ],
  text_muted: ['--muted-foreground'],
  text_dim: ['--faint-foreground'],
  surface: ['--sidebar', '--viewport'],
  viewport: ['--viewport'],
  raised: ['--card', '--popover'],
  active: ['--accent', '--secondary', '--sidebar-accent'],
  field: ['--muted'],
  border: ['--border', '--input', '--sidebar-border'],
  brand: ['--primary', '--brand', '--sidebar-primary', '--selection-background'],
  brand_foreground: [
    '--primary-foreground',
    '--sidebar-primary-foreground',
    '--selection-foreground',
  ],
  brand_soft: ['--brand-soft'],
  warning: ['--clay'],
  success: ['--success'],
  info: ['--info'],
  danger: ['--danger', '--destructive'],
  radius: ['--radius'],
}

const appBrandTokenMapShape = Object.fromEntries(
  APP_BRAND_TOKEN_KEYS.map((key) => [key, z.string().optional()]),
) as { [K in AppBrandTokenKey]: z.ZodOptional<z.ZodString> }

export const appBrandTokenMapSchema = z
  .object(appBrandTokenMapShape)
  .strict()
  .superRefine((map, ctx) => {
    for (const key of APP_BRAND_TOKEN_KEYS) {
      const value = map[key]

      if (value === undefined) {
        continue
      }

      if (!isValidAppBrandTokenValue(key, value)) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid brand token "${key}"`,
          path: [key],
        })
      }
    }
  })

export const appBrandTokensSchema = z
  .object({
    light: appBrandTokenMapSchema.optional(),
    dark: appBrandTokenMapSchema.optional(),
  })
  .strict()

/** Expand a sparse author map into CSS custom properties for inline styles. */
export function brandTokensToCssVars(tokens: AppBrandTokenMap): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const key of APP_BRAND_TOKEN_KEYS) {
    const value = tokens[key]

    if (value === undefined) {
      continue
    }

    const properties = TOKEN_CSS_VARS[key]

    for (const property of properties) {
      vars[property] = value
    }

    if (key === 'brand') {
      const focusRing = `color-mix(in srgb, ${value} 42%, transparent)`
      vars['--ring'] = focusRing
      vars['--sidebar-ring'] = focusRing
    }
  }

  return vars
}
