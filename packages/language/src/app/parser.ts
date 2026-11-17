/**
 * Parsing for `app` top-level blocks (RFC 0022). Called from the main parser
 * via delegation. Grammar is standard `key: value` with nested `shell`, `nav`,
 * `brand`, and `page` blocks; OpenUI via `render: @openui { … }`.
 */

import {
  APP_BRAND_TOKEN_KEYS,
  isAppBrandTokenKey,
} from '@swirls/definition/app-brand-tokens'
import type { SourceRange } from '../ast'
import type { Token } from '../lexer'
import type { ResourceParserDelegate } from '../parser-delegate'
import type {
  AppAudience,
  AppBrand,
  AppBrandAvatar,
  AppBrandTokenMap,
  AppBrandTokens,
  AppDecl,
  AppLanding,
  AppLandingDiscover,
  AppLandingFaq,
  AppLandingFaqItem,
  AppNav,
  AppNavEntry,
  AppNavSection,
  AppOpenUiBlock,
  AppPage,
  AppReservedField,
  AppReservedFieldName,
  AppShell,
  AppShellRegion,
} from './ast'

function rangeFromTokens(start: Token, end: Token): SourceRange {
  return {
    start: { ...start.range.start },
    end: { ...end.range.end },
  }
}

const RESERVED_FIELDS: ReadonlySet<string> = new Set([
  'domain',
  'slot',
  'split',
  'table',
])

const SHELL_REGIONS: ReadonlySet<string> = new Set([
  'topbar',
  'leftbar',
  'rightbar',
])

function isReservedField(value: string): value is AppReservedFieldName {
  return RESERVED_FIELDS.has(value)
}

function parseReferenceName(
  d: ResourceParserDelegate,
): { value: string; range: SourceRange } | null {
  const tok = d.peek()
  if (!tok || typeof tok.value !== 'string') {
    return null
  }
  if (
    tok.kind === 'identifier' ||
    tok.kind === 'keyword' ||
    tok.kind === 'string'
  ) {
    d.advance()
    return { value: tok.value, range: { ...tok.range } }
  }
  return null
}

function parseEntryLabelBlock(d: ResourceParserDelegate): {
  label?: string
  labelRange?: SourceRange
  end: Token | null
} {
  let label: string | undefined
  let labelRange: SourceRange | undefined

  if (!d.expect('lbrace')) {
    d.error('Expected { after entry', d.peek())
    return { label, labelRange, end: null }
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'label') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        label = val
        labelRange = valTok ? { ...valTok.range } : undefined
      } else {
        d.error('entry label must be a quoted string', valTok ?? t)
      }
      continue
    }

    d.error(`Unknown entry property "${key}" — only label`, keyTok ?? t)
    d.parseValue()
  }

  return { label, labelRange, end: d.expect('rbrace') }
}

function parseBrandAvatarBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppBrandAvatar {
  const avatar: AppBrandAvatar = { range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after avatar', d.peek())
    return avatar
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'variant') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val !== 'string') {
        d.error('brand avatar variant must be a quoted string', valTok ?? t)
        continue
      }
      avatar.variant = val
      avatar.variantRange = valTok ? { ...valTok.range } : undefined
      continue
    }

    if (key === 'colors') {
      const valTok = d.peek()
      const colors = parseQuotedStringList(d)
      if (colors === null) {
        continue
      }
      avatar.colors = colors
      avatar.colorsRange = valTok ? { ...valTok.range } : undefined
      continue
    }

    if (key === 'shape') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val !== 'string') {
        d.error('brand avatar shape must be a quoted string', valTok ?? t)
        continue
      }
      avatar.shape = val
      avatar.shapeRange = valTok ? { ...valTok.range } : undefined
      continue
    }

    d.error(
      `Unknown avatar property "${key}" — only variant, colors, and shape`,
      keyTok ?? t,
    )
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  avatar.range = rangeFromTokens(start, end ?? start)
  return avatar
}

function parseBrandBlock(d: ResourceParserDelegate, start: Token): AppBrand {
  const brand: AppBrand = { range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after brand', d.peek())
    return brand
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key === 'tokens') {
      brand.tokens = parseBrandTokensBlock(d, keyTok ?? t)
      continue
    }

    if (key === 'avatar') {
      brand.avatar = parseBrandAvatarBlock(d, keyTok ?? t)
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'accent' || key === 'logo' || key === 'theme') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val !== 'string') {
        d.error(`brand ${key} must be a quoted string`, valTok ?? t)
        continue
      }
      const range = valTok ? { ...valTok.range } : undefined
      if (key === 'accent') {
        brand.accent = val
        brand.accentRange = range
      } else if (key === 'logo') {
        brand.logo = val
        brand.logoRange = range
      } else {
        brand.theme = val
        brand.themeRange = range
      }
      continue
    }

    d.error(
      `Unknown brand property "${key}" — only accent, logo, theme, tokens, and avatar`,
      keyTok ?? t,
    )
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  brand.range = rangeFromTokens(start, end ?? start)
  return brand
}

function parseQuotedStringList(d: ResourceParserDelegate): string[] | null {
  if (!d.expect('lbracket')) {
    d.error('Expected [', d.peek())
    return null
  }

  const items: string[] = []
  while (!d.eof()) {
    const token = d.peek()
    if (!token || token.kind === 'rbracket') {
      break
    }
    if (token.kind === 'block_comment' || token.kind === 'comma') {
      d.advance()
      continue
    }
    const val = d.parseValue()
    if (typeof val !== 'string') {
      d.error('List entries must be quoted strings', token)
      d.advance()
      continue
    }
    items.push(val)
    const next = d.peek()
    if (next?.kind !== 'comma' && next?.kind !== 'rbracket') {
      d.error('Expected , or ] after list entry', next)
    }
  }

  if (!d.expect('rbracket')) {
    d.error('Expected ] after list', d.peek())
  }
  return items
}

function parseStringListValue(
  d: ResourceParserDelegate,
): { values: string[]; range: SourceRange } | null {
  const start = d.peek()
  const val = d.parseValue()
  if (!Array.isArray(val) || val.some((item) => typeof item !== 'string')) {
    d.error('Expected a string list', start ?? d.peek())
    return null
  }
  const end = d.peek() ?? start
  return {
    values: val,
    range: rangeFromTokens(start ?? end!, end ?? start!),
  }
}

function parseAudienceBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppAudience | null {
  const audience: AppAudience = {
    admission: '',
    range: { ...start.range },
  }

  if (!d.expect('lbrace')) {
    return null
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'admission' || key === 'auth' || key === 'idp') {
      const valTok = d.peek()
      const nameParsed = parseReferenceName(d)
      if (nameParsed) {
        if (key === 'admission') {
          audience.admission = nameParsed.value
          audience.admissionRange = nameParsed.range
        } else if (key === 'auth') {
          audience.auth = nameParsed.value
          audience.authRange = nameParsed.range
        } else {
          audience.idp = nameParsed.value
          audience.idpRange = nameParsed.range
        }
      } else {
        const val = d.parseValue()
        if (typeof val === 'string') {
          if (key === 'admission') {
            audience.admission = val
            audience.admissionRange = valTok ? { ...valTok.range } : undefined
          } else if (key === 'auth') {
            audience.auth = val
            audience.authRange = valTok ? { ...valTok.range } : undefined
          } else {
            audience.idp = val
            audience.idpRange = valTok ? { ...valTok.range } : undefined
          }
        } else {
          d.error(`${key} must be an identifier or string`, valTok ?? t)
        }
      }
      continue
    }

    if (key === 'allow_domains' || key === 'deny_domains') {
      const parsed = parseStringListValue(d)
      if (!parsed) {
        continue
      }
      if (key === 'allow_domains') {
        audience.allowDomains = parsed.values
        audience.allowDomainsRange = parsed.range
      } else {
        audience.denyDomains = parsed.values
        audience.denyDomainsRange = parsed.range
      }
      continue
    }

    d.error(`Unknown audience property "${key}"`, keyTok ?? t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  audience.range = rangeFromTokens(start, end ?? start)
  return audience
}

function parseLandingFaqItemBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppLandingFaqItem {
  const item: AppLandingFaqItem = {
    question: '',
    answer: '',
    range: { ...start.range },
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after item', d.peek())
    return item
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }
    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    const valTok = d.peek()
    const val = d.parseValue()
    if (typeof val !== 'string') {
      d.error(`faq item ${key} must be a quoted string`, valTok ?? t)
      continue
    }
    const range = valTok ? { ...valTok.range } : undefined

    switch (key) {
      case 'question':
        item.question = val
        item.questionRange = range
        break
      case 'answer':
        item.answer = val
        item.answerRange = range
        break
      default:
        d.error(
          `Unknown faq item property "${key}" — only question and answer`,
          keyTok ?? t,
        )
        break
    }
  }

  const end = d.expect('rbrace') ?? d.peek()
  item.range = rangeFromTokens(start, end ?? start)
  return item
}

function parseLandingFaqBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppLandingFaq {
  const faq: AppLandingFaq = { items: [], range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after faq', d.peek())
    return faq
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key !== 'item') {
      d.error(`Unknown faq property "${key}" — only item { … }`, keyTok ?? t)
      d.parseValue()
      continue
    }

    faq.items.push(parseLandingFaqItemBlock(d, keyTok ?? t))
  }

  const end = d.expect('rbrace') ?? d.peek()
  faq.range = rangeFromTokens(start, end ?? start)
  return faq
}

function parseLandingDiscoverBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppLandingDiscover {
  const discover: AppLandingDiscover = { range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after discover', d.peek())
    return discover
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }
    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key === 'faq') {
      discover.faq = parseLandingFaqBlock(d, keyTok ?? t)
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'index') {
      const valTok = d.peek()
      if (
        valTok &&
        (valTok.kind === 'identifier' || valTok.kind === 'keyword') &&
        (valTok.value === 'true' || valTok.value === 'false')
      ) {
        d.advance()
        discover.index = valTok.value === 'true'
        discover.indexRange = { ...valTok.range }
      } else {
        const val = d.parseValue()
        if (typeof val === 'boolean') {
          discover.index = val
          discover.indexRange = valTok ? { ...valTok.range } : undefined
        } else {
          d.error('discover index must be true or false', valTok ?? t)
        }
      }
      continue
    }

    if (key === 'keywords' || key === 'capabilities') {
      const listStart = d.peek()
      const items = parseQuotedStringList(d)
      if (items) {
        const range = listStart ? { ...listStart.range } : undefined
        if (key === 'keywords') {
          discover.keywords = items
          discover.keywordsRange = range
        } else {
          discover.capabilities = items
          discover.capabilitiesRange = range
        }
      }
      continue
    }

    const valTok = d.peek()
    const val = d.parseValue()
    if (typeof val !== 'string') {
      d.error(`discover ${key} must be a quoted string`, valTok ?? t)
      continue
    }
    const range = valTok ? { ...valTok.range } : undefined

    switch (key) {
      case 'meta_title':
        discover.metaTitle = val
        discover.metaTitleRange = range
        break
      case 'meta_description':
        discover.metaDescription = val
        discover.metaDescriptionRange = range
        break
      case 'og_image':
        discover.ogImage = val
        discover.ogImageRange = range
        break
      case 'canonical':
        discover.canonical = val
        discover.canonicalRange = range
        break
      case 'locale':
        discover.locale = val
        discover.localeRange = range
        break
      case 'summary':
        discover.summary = val
        discover.summaryRange = range
        break
      case 'audience':
        discover.audience = val
        discover.audienceRange = range
        break
      case 'organization':
        discover.organization = val
        discover.organizationRange = range
        break
      case 'organization_url':
        discover.organizationUrl = val
        discover.organizationUrlRange = range
        break
      case 'application_category':
        discover.applicationCategory = val
        discover.applicationCategoryRange = range
        break
      default:
        d.error(
          `Unknown discover property "${key}" — see landing.discover in the app resource docs`,
          keyTok ?? t,
        )
        break
    }
  }

  const end = d.expect('rbrace') ?? d.peek()
  discover.range = rangeFromTokens(start, end ?? start)
  return discover
}

function parseLandingBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppLanding {
  const landing: AppLanding = { range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after landing', d.peek())
    return landing
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key === 'discover') {
      landing.discover = parseLandingDiscoverBlock(d, keyTok ?? t)
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'layout') {
      const valTok = d.peek()
      const nameParsed = parseReferenceName(d)
      if (nameParsed) {
        landing.layout = nameParsed.value
        landing.layoutRange = nameParsed.range
      } else {
        const val = d.parseValue()
        if (typeof val === 'string') {
          landing.layout = val
          landing.layoutRange = valTok ? { ...valTok.range } : undefined
        } else {
          d.error('landing layout must be an identifier or string', valTok ?? t)
        }
      }
      continue
    }

    const valTok = d.peek()
    const val = d.parseValue()
    if (typeof val !== 'string') {
      d.error(`landing ${key} must be a quoted string`, valTok ?? t)
      continue
    }
    const range = valTok ? { ...valTok.range } : undefined

    switch (key) {
      case 'image':
        landing.image = val
        landing.imageRange = range
        break
      case 'title':
        landing.title = val
        landing.titleRange = range
        break
      case 'subtitle':
        landing.subtitle = val
        landing.subtitleRange = range
        break
      case 'sign_in_title':
        landing.signInTitle = val
        landing.signInTitleRange = range
        break
      case 'sign_in_hint':
        landing.signInHint = val
        landing.signInHintRange = range
        break
      case 'footer':
        landing.footer = val
        landing.footerRange = range
        break
      default:
        d.error(
          `Unknown landing property "${key}" — only layout, image, title, subtitle, sign_in_title, sign_in_hint, footer, and discover`,
          keyTok ?? t,
        )
        break
    }
  }

  const end = d.expect('rbrace') ?? d.peek()
  landing.range = rangeFromTokens(start, end ?? start)
  return landing
}

function parseBrandTokensBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppBrandTokens {
  const tokens: AppBrandTokens = { range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after tokens', d.peek())
    return tokens
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key === 'light' || key === 'dark') {
      tokens[key] = parseBrandTokenMapBlock(d, keyTok ?? t)
      continue
    }

    d.error(
      `Unknown tokens property "${key}" — only light and dark`,
      keyTok ?? t,
    )
    if (d.peek()?.kind === 'lbrace') {
      parseBrandTokenMapBlock(d, keyTok ?? t)
    } else if (d.peek()?.kind === 'colon') {
      d.expect('colon')
      d.parseValue()
    }
  }

  const end = d.expect('rbrace') ?? d.peek()
  tokens.range = rangeFromTokens(start, end ?? start)
  return tokens
}

function parseBrandTokenMapBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppBrandTokenMap {
  const map: AppBrandTokenMap = {}

  if (!d.expect('lbrace')) {
    d.error('Expected { after token mode', d.peek())
    return map
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    const valTok = d.peek()
    const val = d.parseValue()
    if (typeof val !== 'string') {
      d.error(`brand token "${key}" must be a quoted string`, valTok ?? t)
      continue
    }

    if (!isAppBrandTokenKey(key)) {
      d.error(
        `Unknown brand token "${key}" — one of: ${APP_BRAND_TOKEN_KEYS.join(', ')}`,
        keyTok ?? t,
      )
      continue
    }

    map[key] = {
      value: val,
      range: valTok ? { ...valTok.range } : { ...start.range },
    }
  }

  d.expect('rbrace')
  return map
}

/**
 * Parse a shell region body: string props, booleans, or `[widget.x, …]` lists.
 */
function parseShellRegion(
  d: ResourceParserDelegate,
  name: 'topbar' | 'leftbar' | 'rightbar',
  start: Token,
): AppShellRegion {
  const props: Record<string, string | boolean | string[]> = {}

  if (!d.expect('lbrace')) {
    d.error(`Expected { after ${name}`, d.peek())
    return { name, props, range: { ...start.range } }
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    const valTok = d.peek()
    if (valTok?.kind === 'lbracket') {
      d.advance()
      const items: string[] = []
      while (!d.eof() && d.peek()?.kind !== 'rbracket') {
        if (d.peek()?.kind === 'comma') {
          d.advance()
          continue
        }
        // widget.user_menu as dotted path: identifier(s) separated by dots
        const parts: string[] = []
        while (!d.eof()) {
          const p = d.peek()
          if (
            p &&
            (p.kind === 'identifier' || p.kind === 'keyword') &&
            typeof p.value === 'string'
          ) {
            parts.push(p.value)
            d.advance()
            if (d.peek()?.kind === 'dot') {
              d.advance()
              continue
            }
            break
          }
          break
        }
        if (parts.length > 0) {
          items.push(parts.join('.'))
        } else {
          const s = d.parseValue()
          if (typeof s === 'string') {
            items.push(s)
          } else {
            break
          }
        }
        if (d.peek()?.kind === 'comma') {
          d.advance()
        }
      }
      d.expect('rbracket')
      props[key] = items
      continue
    }

    if (
      valTok &&
      (valTok.kind === 'identifier' || valTok.kind === 'keyword') &&
      (valTok.value === 'true' || valTok.value === 'false')
    ) {
      d.advance()
      props[key] = valTok.value === 'true'
      continue
    }

    const val = d.parseValue()
    if (typeof val === 'string' || typeof val === 'boolean') {
      props[key] = val
    } else if (val != null) {
      props[key] = String(val)
    } else {
      d.error(`Invalid value for shell region property "${key}"`, keyTok ?? t)
    }
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    name,
    props,
    range: rangeFromTokens(start, end ?? start),
  }
}

function parseShellBlock(d: ResourceParserDelegate, start: Token): AppShell {
  const shell: AppShell = { regions: [], range: { ...start.range } }

  if (!d.expect('lbrace')) {
    d.error('Expected { after shell', d.peek())
    return shell
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (SHELL_REGIONS.has(key)) {
      shell.regions.push(
        parseShellRegion(
          d,
          key as 'topbar' | 'leftbar' | 'rightbar',
          keyTok ?? t,
        ),
      )
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'preset') {
      const valTok = d.peek()
      const nameParsed = parseReferenceName(d)
      if (nameParsed) {
        shell.preset = nameParsed.value
        shell.presetRange = nameParsed.range
      } else {
        const val = d.parseValue()
        if (typeof val === 'string') {
          shell.preset = val
          shell.presetRange = valTok ? { ...valTok.range } : undefined
        } else {
          d.error('shell preset must be an identifier or string', valTok ?? t)
        }
      }
      continue
    }

    d.error(`Unknown shell property "${key}"`, keyTok ?? t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  shell.range = rangeFromTokens(start, end ?? start)
  return shell
}

function parseNavSection(
  d: ResourceParserDelegate,
  start: Token,
): AppNavSection {
  let title = ''
  let titleRange: SourceRange = { ...start.range }

  const titleTok = d.peek()
  if (titleTok?.kind === 'string' && typeof titleTok.value === 'string') {
    d.advance()
    title = titleTok.value
    titleRange = { ...titleTok.range }
  } else {
    d.error(
      'Section title must be a quoted string (e.g. `section "Overview" {`)',
      titleTok ?? d.peek(),
    )
  }

  const entries: AppNavEntry[] = []

  if (!d.expect('lbrace')) {
    d.error('Expected { after section title', d.peek())
    return { title, titleRange, entries, range: rangeFromTokens(start, start) }
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const kindTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      d.error('Expected a nav entry (page: name)', t)
      break
    }

    if (key !== 'page') {
      d.error(`Unknown nav entry "${key}" — only page`, kindTok ?? t)
      if (d.peek()?.kind === 'colon') {
        d.advance()
      }
      d.parseValue()
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected : after page', d.peek())
      break
    }

    const nameParsed = parseReferenceName(d)
    if (!nameParsed) {
      d.error('Expected a page name after "page:"', d.peek())
      continue
    }

    const entryStart = kindTok ?? t
    let label: string | undefined
    let labelRange: SourceRange | undefined
    let entryEnd: SourceRange = nameParsed.range

    if (d.peek()?.kind === 'lbrace') {
      const parsed = parseEntryLabelBlock(d)
      label = parsed.label
      labelRange = parsed.labelRange
      if (parsed.end) {
        entryEnd = { ...parsed.end.range }
      }
    }

    entries.push({
      pageName: nameParsed.value,
      pageNameRange: nameParsed.range,
      label,
      labelRange,
      range: {
        start: { ...entryStart.range.start },
        end: { ...entryEnd.end },
      },
    })
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    title,
    titleRange,
    entries,
    range: rangeFromTokens(start, end ?? start),
  }
}

function parseNavBlock(d: ResourceParserDelegate, start: Token): AppNav {
  const sections: AppNavSection[] = []

  if (!d.expect('lbrace')) {
    d.error('Expected { after nav', d.peek())
    return { sections, range: { ...start.range } }
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key === 'section') {
      sections.push(parseNavSection(d, keyTok ?? t))
      continue
    }

    d.error(`Unknown nav property "${key}" — only section`, keyTok ?? t)
    if (d.peek()?.kind === 'colon') {
      d.advance()
    }
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()
  return {
    sections,
    range: rangeFromTokens(start, end ?? start),
  }
}

function parseOpenUiBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppOpenUiBlock | null {
  const tok = d.peek()
  if (
    !tok ||
    tok.kind !== 'fenced_block' ||
    tok.fencedLang !== 'openui' ||
    typeof tok.fencedContent !== 'string'
  ) {
    d.error('Expected @openui { … } after render:', tok ?? start)
    return null
  }
  d.advance()
  return {
    content: tok.fencedContent,
    contentRange: tok.fencedContentRange
      ? { ...tok.fencedContentRange }
      : { ...tok.range },
    range: { ...tok.range },
  }
}

function parseWorkflowList(d: ResourceParserDelegate): {
  names: string[]
  ranges: SourceRange[]
} | null {
  if (!d.expect('lbracket')) {
    d.error('Expected [ after reviews:', d.peek())
    return null
  }

  const names: string[] = []
  const ranges: SourceRange[] = []

  while (!d.eof()) {
    const token = d.peek()
    if (!token || token.kind === 'rbracket') {
      break
    }
    if (token.kind === 'block_comment' || token.kind === 'comma') {
      d.advance()
      continue
    }
    if (token.kind !== 'identifier' || typeof token.value !== 'string') {
      d.error('reviews entries must be bare workflow identifiers', token)
      d.advance()
      continue
    }

    d.advance()
    names.push(token.value)
    ranges.push({ ...token.range })

    const next = d.peek()
    if (next?.kind !== 'comma' && next?.kind !== 'rbracket') {
      d.error('Expected , or ] after reviews workflow identifier', next)
    }
  }

  if (!d.expect('rbracket')) {
    d.error('Expected ] after reviews list', d.peek())
    return null
  }
  if (names.length === 0) {
    d.error(
      'page reviews must contain at least one workflow identifier',
      d.peek(),
    )
  }

  return { names, ranges }
}

function parseChannelList(
  d: ResourceParserDelegate,
  label: 'threads' | 'reviews',
): {
  names: string[]
  ranges: SourceRange[]
} | null {
  if (!d.expect('lbracket')) {
    d.error(`Expected [ after ${label}:`, d.peek())
    return null
  }

  const names: string[] = []
  const ranges: SourceRange[] = []

  while (!d.eof()) {
    const token = d.peek()
    if (!token || token.kind === 'rbracket') {
      break
    }
    if (token.kind === 'block_comment' || token.kind === 'comma') {
      d.advance()
      continue
    }
    const parsed = parseReferenceName(d)
    if (!parsed) {
      d.error(
        `${label} entries must be Surface channel identifiers`,
        d.peek() ?? token,
      )
      continue
    }
    names.push(parsed.value)
    ranges.push(parsed.range)

    const next = d.peek()
    if (next?.kind !== 'comma' && next?.kind !== 'rbracket') {
      d.error(`Expected , or ] after ${label} channel identifier`, next)
    }
  }

  if (!d.expect('rbracket')) {
    d.error(`Expected ] after ${label} list`, d.peek())
    return null
  }
  if (names.length === 0) {
    d.error(
      `page ${label} must contain at least one channel identifier`,
      d.peek(),
    )
  }

  return { names, ranges }
}

/** Fields the page parser accepts. `view`, `workflow`, and `chat` stay so they get the removal error instead of "unknown field". */
const PAGE_FIELDS = new Set([
  'label',
  'icon',
  'viewport',
  'view',
  'workflow',
  'chat',
  'render',
  'channel',
  'reviews',
  'threads',
])

const PAGE_FIELD_HINT =
  'label, icon, viewport, render, channel, reviews, threads'

function skipRestOfLine(d: ResourceParserDelegate, line: number): void {
  while (!d.eof()) {
    const next = d.peek()
    if (!next || next.range.start.line !== line || next.kind === 'rbrace') {
      break
    }
    d.advance()
  }
}

function parsePageBlock(
  d: ResourceParserDelegate,
  start: Token,
): AppPage | null {
  const nameTok = d.advance()
  if (
    !nameTok ||
    (nameTok.kind !== 'identifier' && nameTok.kind !== 'keyword') ||
    typeof nameTok.value !== 'string'
  ) {
    d.error('Expected page name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected { after page name', d.peek())
    d.skipToNextBlock()
    return null
  }

  const page: AppPage = {
    name: nameTok.value,
    nameRange: { ...nameTok.range },
    range: { ...start.range },
  }

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (!PAGE_FIELDS.has(key)) {
      d.error(
        `Unknown page field "${key}". Expected one of: ${PAGE_FIELD_HINT}`,
        keyTok ?? t,
      )
      if (d.peek()?.kind === 'colon') {
        d.advance()
        d.parseValue()
      } else {
        skipRestOfLine(d, (keyTok ?? t).range.start.line)
      }
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'label' || key === 'icon') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        if (key === 'label') {
          page.label = val
          page.labelRange = valTok ? { ...valTok.range } : undefined
        } else {
          page.icon = val
          page.iconRange = valTok ? { ...valTok.range } : undefined
        }
      } else {
        d.error(`page ${key} must be a quoted string`, valTok ?? t)
      }
      continue
    }

    if (key === 'viewport') {
      const parsed = parseReferenceName(d)
      if (parsed) {
        page.viewport = parsed.value
        page.viewportRange = parsed.range
      } else {
        d.error('page viewport must be full', d.peek() ?? t)
      }
      continue
    }

    if (key === 'view' || key === 'workflow' || key === 'chat') {
      d.error(
        `page preset "${key}:" is no longer supported — use render: @openui { … } with OpenUI components instead`,
        keyTok ?? t,
      )
      d.parseValue()
      continue
    }

    if (key === 'render') {
      const openui = parseOpenUiBlock(d, keyTok ?? t)
      if (openui) {
        page.render = openui
      }
      continue
    }

    if (key === 'channel') {
      const parsed = parseReferenceName(d)
      if (parsed) {
        page.channel = parsed.value
        page.channelRange = parsed.range
      } else {
        d.error('page channel must be an identifier', d.peek() ?? t)
      }
      continue
    }

    if (key === 'reviews') {
      const parsed = parseWorkflowList(d)
      if (parsed) {
        page.reviews = parsed.names
        page.reviewsRanges = parsed.ranges
      }
      continue
    }

    if (key === 'threads') {
      const parsed = parseChannelList(d, 'threads')
      if (parsed) {
        page.threads = parsed.names
        page.threadsRanges = parsed.ranges
      }
    }
  }

  const declaredBodies = [
    page.render != null ? 'render:' : null,
    page.channel != null ? 'channel:' : null,
    page.threads != null ? 'threads:' : null,
    page.reviews != null ? 'reviews:' : null,
  ].filter((body): body is string => body !== null)
  if (declaredBodies.length > 1) {
    d.error(
      `page cannot declare both ${declaredBodies.join(' and ')} — use exactly one page body`,
    )
  }

  const end = d.expect('rbrace') ?? d.peek()
  page.range = rangeFromTokens(start, end ?? nameTok)
  return page
}

export function parseAppBlock(
  d: ResourceParserDelegate,
  docComment?: string,
): AppDecl | null {
  const start = d.expect('keyword')

  if (!start || start.value !== 'app') {
    return null
  }

  const nameTok = d.advance()

  if (nameTok?.kind === 'string') {
    d.error(
      'App name must be a bare identifier, not a quoted string (e.g. `app support_center {`)',
      nameTok,
    )
    d.skipToNextBlock()
    return null
  }

  if (
    !nameTok ||
    nameTok.kind !== 'identifier' ||
    typeof nameTok.value !== 'string'
  ) {
    d.error('Expected app name', nameTok)
    d.skipToNextBlock()
    return null
  }

  if (!d.expect('lbrace')) {
    d.error('Expected {', d.peek())
    d.skipToNextBlock()
    return null
  }

  let label: string | undefined
  let description: string | undefined
  let icon: string | undefined
  let brand: AppBrand | undefined
  let audience: AppAudience | undefined
  let landing: AppLanding | undefined
  let shell: AppShell | undefined
  let nav: AppNav | undefined
  const pages: AppPage[] = []
  const reserved: AppReservedField[] = []

  while (!d.eof()) {
    const t = d.peek()
    if (!t || t.kind === 'rbrace') {
      break
    }

    if (t.kind === 'block_comment') {
      d.advance()
      continue
    }

    const keyTok = d.peek()
    const key = d.parsePropertyKey()
    if (!key) {
      break
    }

    if (key === 'brand') {
      brand = parseBrandBlock(d, keyTok ?? t)
      continue
    }

    if (key === 'landing') {
      landing = parseLandingBlock(d, keyTok ?? t)
      continue
    }

    if (key === 'audience') {
      if (d.peek()?.kind === 'colon') {
        d.advance()
        d.error(
          'audience must be a block (`audience { … }`), not a string value',
          keyTok ?? t,
        )
        d.parseValue()
        continue
      }
      const parsedAudience = parseAudienceBlock(d, keyTok ?? t)
      if (parsedAudience) {
        audience = parsedAudience
      }
      continue
    }

    if (key === 'shell') {
      shell = parseShellBlock(d, keyTok ?? t)
      continue
    }

    if (key === 'nav') {
      nav = parseNavBlock(d, keyTok ?? t)
      continue
    }

    if (key === 'page') {
      const page = parsePageBlock(d, keyTok ?? t)
      if (page) {
        pages.push(page)
      }
      continue
    }

    if (isReservedField(key)) {
      if (keyTok) {
        reserved.push({ name: key, range: { ...keyTok.range } })
      }
      if (d.peek()?.kind === 'colon') {
        d.advance()
      }
      // slot/split/table may be blocks; skip a following brace body if present
      if (d.peek()?.kind === 'lbrace') {
        d.advance()
        let depth = 1
        while (!d.eof() && depth > 0) {
          const n = d.advance()
          if (n?.kind === 'lbrace') {
            depth++
          } else if (n?.kind === 'rbrace') {
            depth--
          }
        }
      } else {
        d.parseValue()
      }
      continue
    }

    if (!d.expect('colon')) {
      d.error('Expected :', d.peek())
      break
    }

    if (key === 'label' || key === 'description' || key === 'icon') {
      const valTok = d.peek()
      const val = d.parseValue()
      if (typeof val === 'string') {
        if (key === 'label') {
          label = val
        } else if (key === 'description') {
          description = val
        } else {
          icon = val
        }
      } else {
        d.error(`app ${key} must be a quoted string`, valTok ?? t)
      }
      continue
    }

    d.error(`Unknown app property "${key}"`, keyTok ?? t)
    d.parseValue()
  }

  const end = d.expect('rbrace') ?? d.peek()

  return {
    name: nameTok.value,
    label,
    description,
    icon,
    docComment,
    brand,
    audience,
    landing,
    shell,
    nav,
    pages,
    reserved,
    range: rangeFromTokens(start, end ?? nameTok),
  }
}
