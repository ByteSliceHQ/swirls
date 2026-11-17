/**
 * Curated theme names selectable via `app … { brand { theme: "…" } }`.
 *
 * This is defined in `@swirls/definition` because deployment-definition validation
 * needs it and `@swirls/language` already depends on this package.
 */
export const APP_THEMES = [
  'swirls-light',
  'swirls-dark',
  'github-light',
  'github-dark',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'tokyo-night',
  'nord',
  'gruvbox-light',
  'gruvbox-dark',
  'rose-pine',
  'dracula',
] as const

export type AppTheme = (typeof APP_THEMES)[number]

export function isAppTheme(value: string): value is AppTheme {
  return APP_THEMES.some((theme) => theme === value)
}
