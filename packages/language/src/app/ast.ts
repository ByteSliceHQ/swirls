/**
 * AST types for top-level `app name { … }` blocks (RFC 0022).
 *
 * An `app` declares a bespoke consumption surface: shell layout (presets +
 * optional region overrides), navigation, and pages that bind to views,
 * workflows, Surface `platform: swirls` channels, or authoring-time `@openui` layouts.
 * The union of everything reachable from pages is the authority boundary.
 */

import type { AppBrandTokenKey } from '@swirls/definition/app-brand-tokens'
import type { SourceRange } from '../ast'

/** Shell presets shipped in Phase 0. */
export const APP_SHELL_PRESETS = [
  'sidebar',
  'topnav',
  'chat',
  'canvas',
] as const

export type AppShellPreset = (typeof APP_SHELL_PRESETS)[number]

export function isAppShellPreset(value: string): value is AppShellPreset {
  return (APP_SHELL_PRESETS as readonly string[]).includes(value)
}

/**
 * Top-level / nested fields reserved for later phases. Parsed for forward
 * compat so files written against later RFCs fail with one pointed diagnostic.
 */
export type AppReservedFieldName = 'domain' | 'slot' | 'split' | 'table'

/** External audience admission policy declared in the DSL (RFC 0016). */
export interface AppAudience {
  admission: string
  admissionRange?: SourceRange
  auth?: string
  authRange?: SourceRange
  idp?: string
  idpRange?: SourceRange
  allowDomains?: string[]
  allowDomainsRange?: SourceRange
  denyDomains?: string[]
  denyDomainsRange?: SourceRange
  range: SourceRange
}

/** `brand { avatar { variant, colors, shape } }` — boring-avatars config for Surface. */
export interface AppBrandAvatar {
  variant?: string
  variantRange?: SourceRange
  colors?: string[]
  colorsRange?: SourceRange
  shape?: string
  shapeRange?: SourceRange
  range: SourceRange
}

/** `brand { accent, logo, theme, tokens, avatar }` — tokens overlay Surface design tokens. */
export interface AppBrand {
  accent?: string
  accentRange?: SourceRange
  logo?: string
  logoRange?: SourceRange
  theme?: string
  themeRange?: SourceRange
  tokens?: AppBrandTokens
  avatar?: AppBrandAvatar
  range: SourceRange
}

export interface AppBrandTokenEntry {
  value: string
  range: SourceRange
}

export type AppBrandTokenMap = Partial<
  Record<AppBrandTokenKey, AppBrandTokenEntry>
>

export interface AppBrandTokens {
  light?: AppBrandTokenMap
  dark?: AppBrandTokenMap
  range: SourceRange
}

/** Sign-in / landing layout presets for app-targeted Surface auth. */
export const APP_LANDING_LAYOUTS = ['centered', 'split', 'cover'] as const

export type AppLandingLayout = (typeof APP_LANDING_LAYOUTS)[number]

export function isAppLandingLayout(value: string): value is AppLandingLayout {
  return (APP_LANDING_LAYOUTS as readonly string[]).includes(value)
}

/** One FAQ pair inside `landing.discover.faq`. */
export interface AppLandingFaqItem {
  question: string
  questionRange?: SourceRange
  answer: string
  answerRange?: SourceRange
  range: SourceRange
}

/** `faq { item { question, answer } }` inside `landing.discover`. */
export interface AppLandingFaq {
  items: AppLandingFaqItem[]
  range: SourceRange
}

/** `discover { index, meta_title, … }` — SEO/AEO/GEO metadata for app landings. */
export interface AppLandingDiscover {
  index?: boolean
  indexRange?: SourceRange
  metaTitle?: string
  metaTitleRange?: SourceRange
  metaDescription?: string
  metaDescriptionRange?: SourceRange
  keywords?: string[]
  keywordsRange?: SourceRange
  ogImage?: string
  ogImageRange?: SourceRange
  canonical?: string
  canonicalRange?: SourceRange
  locale?: string
  localeRange?: SourceRange
  summary?: string
  summaryRange?: SourceRange
  audience?: string
  audienceRange?: SourceRange
  capabilities?: string[]
  capabilitiesRange?: SourceRange
  faq?: AppLandingFaq
  organization?: string
  organizationRange?: SourceRange
  organizationUrl?: string
  organizationUrlRange?: SourceRange
  applicationCategory?: string
  applicationCategoryRange?: SourceRange
  range: SourceRange
}

/** `landing { layout, image, title, … }` — branded sign-in when opening a specific app. */
export interface AppLanding {
  layout?: string
  layoutRange?: SourceRange
  image?: string
  imageRange?: SourceRange
  title?: string
  titleRange?: SourceRange
  subtitle?: string
  subtitleRange?: SourceRange
  signInTitle?: string
  signInTitleRange?: SourceRange
  signInHint?: string
  signInHintRange?: SourceRange
  footer?: string
  footerRange?: SourceRange
  discover?: AppLandingDiscover
  range: SourceRange
}

/** One shell region override (`topbar`, `leftbar`, `rightbar`). */
export interface AppShellRegion {
  name: 'topbar' | 'leftbar' | 'rightbar'
  /** Raw property bag for Phase 0 (height, width, defaultState, etc.). */
  props: Record<string, string | boolean | string[]>
  range: SourceRange
}

/** `shell { preset: …; topbar { … } }` */
export interface AppShell {
  preset?: string
  presetRange?: SourceRange
  regions: AppShellRegion[]
  range: SourceRange
}

/** `page: name` or `page: name { label: "…" }` inside `nav { section … }`. */
export interface AppNavEntry {
  pageName: string
  pageNameRange: SourceRange
  label?: string
  labelRange?: SourceRange
  range: SourceRange
}

/** `section "Title" { page: … }` inside `nav`. */
export interface AppNavSection {
  title: string
  titleRange: SourceRange
  entries: AppNavEntry[]
  range: SourceRange
}

/** `nav { section … }` */
export interface AppNav {
  sections: AppNavSection[]
  range: SourceRange
}

/** Authoring-time OpenUI Lang island on a page. */
export interface AppOpenUiBlock {
  content: string
  contentRange: SourceRange
  range: SourceRange
}

/**
 * Page body: exactly one of `render: @openui { … }`,
 * `channel: <channel>`, `threads: [channel, …]`, or `reviews: [workflow, …]`.
 */
export interface AppPage {
  name: string
  nameRange: SourceRange
  label?: string
  labelRange?: SourceRange
  /** Optional curated icon name used by app navigation. */
  icon?: string
  iconRange?: SourceRange
  /** `full` removes page chrome and gives OpenUI the whole main viewport. */
  viewport?: string
  viewportRange?: SourceRange
  /** Portal channel name for a full-viewport room chat page. */
  channel?: string
  channelRange?: SourceRange
  /** Portal channels surfaced on an app-wide thread center page. */
  threads?: string[]
  threadsRanges?: SourceRange[]
  /** Workflows whose pending reviews are shown on this page. */
  reviews?: string[]
  reviewsRanges?: SourceRange[]
  render?: AppOpenUiBlock
  range: SourceRange
}

export interface AppReservedField {
  name: AppReservedFieldName
  range: SourceRange
}

/** Top-level `app name { … }` block. */
export interface AppDecl {
  id?: string
  name: string
  label?: string
  description?: string
  icon?: string
  docComment?: string
  brand?: AppBrand
  audience?: AppAudience
  landing?: AppLanding
  shell?: AppShell
  nav?: AppNav
  pages: AppPage[]
  reserved: AppReservedField[]
  range: SourceRange
}
