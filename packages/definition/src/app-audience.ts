/**
 * App audience policy (RFC 0016 / hybrid DSL + Cloud administration).
 *
 * The DSL declares admission mode, auth method, optional IdP alias, and domain
 * rules. Cloud manages invitations, roster, sessions, and IdP client secrets.
 */

import { z } from 'zod'

export const APP_AUDIENCE_ADMISSION = [
  'invite',
  'domain',
  'invite_or_domain',
  'public',
] as const

export const APP_AUDIENCE_AUTH = ['email_otp', 'oidc'] as const

export const APP_INVITATION_STATUS = ['pending', 'accepted', 'revoked'] as const
export const APP_INVITATION_EFFECTIVE_STATUS = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const
export const APP_USER_STATUS = ['active', 'revoked'] as const
export const APP_USER_AUTH_SOURCE = ['email_otp', 'oidc'] as const
export const APP_AUDIENCE_ACTIVITY_RANGE = ['24h', '7d', '30d'] as const

export type AppAudienceAdmission = (typeof APP_AUDIENCE_ADMISSION)[number]
export type AppAudienceAuth = (typeof APP_AUDIENCE_AUTH)[number]
export type AppInvitationStatus = (typeof APP_INVITATION_STATUS)[number]
export type AppInvitationEffectiveStatus =
  (typeof APP_INVITATION_EFFECTIVE_STATUS)[number]
export type AppUserStatus = (typeof APP_USER_STATUS)[number]
export type AppUserAuthSource = (typeof APP_USER_AUTH_SOURCE)[number]
export type AppAudienceActivityRange =
  (typeof APP_AUDIENCE_ACTIVITY_RANGE)[number]

export function effectiveInvitationStatus(input: {
  status: string
  expiresAt: Date | string
  now?: Date
}): AppInvitationEffectiveStatus {
  if (input.status === 'accepted' || input.status === 'revoked') {
    return input.status
  }
  const expiresAt =
    input.expiresAt instanceof Date
      ? input.expiresAt
      : new Date(input.expiresAt)
  const now = input.now ?? new Date()
  if (input.status === 'pending' && expiresAt.getTime() <= now.getTime()) {
    return 'expired'
  }
  return 'pending'
}

/** Normalized domain pattern (e.g. acme.com, *.partners.acme.com). */
export const appAudienceDomainPatternSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,
    'invalid domain pattern',
  )

export const appAudiencePolicySchema = z
  .object({
    admission: z.enum(APP_AUDIENCE_ADMISSION),
    auth: z.enum(APP_AUDIENCE_AUTH).optional(),
    /** Required when auth is oidc; references a Cloud-managed app IdP binding alias. */
    idp: z.string().min(1).max(64).optional(),
    allowDomains: z.array(appAudienceDomainPatternSchema).optional(),
    denyDomains: z.array(appAudienceDomainPatternSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.admission !== 'public' && !value.auth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth is required unless admission is public',
        path: ['auth'],
      })
    }
    if (value.auth === 'oidc' && !value.idp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'idp is required when auth is oidc',
        path: ['idp'],
      })
    }
    if (value.auth === 'email_otp' && value.idp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'idp must not be set when auth is email_otp',
        path: ['idp'],
      })
    }
    if (
      (value.admission === 'domain' ||
        value.admission === 'invite_or_domain') &&
      (!value.allowDomains || value.allowDomains.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allow_domains is required for domain admission modes',
        path: ['allowDomains'],
      })
    }
    if (value.admission === 'public' && value.auth === 'oidc') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'public admission cannot use oidc auth',
        path: ['auth'],
      })
    }
  })

export type AppAudiencePolicy = z.infer<typeof appAudiencePolicySchema>

/** Extract the registrable domain from an email address. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) {
    return null
  }
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
}

/** Whether `email` matches any allow pattern and no deny pattern. Deny wins. */
export function emailMatchesAudienceDomains(
  email: string,
  policy: Pick<AppAudiencePolicy, 'allowDomains' | 'denyDomains'>,
): boolean {
  const domain = emailDomain(email)
  if (!domain) {
    return false
  }
  const deny = policy.denyDomains ?? []
  if (deny.some((pattern) => domainMatchesPattern(domain, pattern))) {
    return false
  }
  const allow = policy.allowDomains ?? []
  if (allow.length === 0) {
    return false
  }
  return allow.some((pattern) => domainMatchesPattern(domain, pattern))
}

export type AudienceAdmissionDecision =
  | { allowed: true; reason: 'invite' | 'domain' | 'public' | 'returning' }
  | { allowed: false; reason: string }

/** Shared email admission used by Fabric and the hosted BFF. */
export function evaluateEmailAdmission(input: {
  policy: AppAudiencePolicy
  email: string
  hasValidInvite: boolean
  hasActiveAppUser?: boolean
}): AudienceAdmissionDecision {
  const email = input.email.trim().toLowerCase()
  const { policy } = input

  if (policy.admission === 'public') {
    return { allowed: true, reason: 'public' }
  }

  if (input.hasActiveAppUser) {
    return { allowed: true, reason: 'returning' }
  }

  const inviteOk =
    input.hasValidInvite &&
    (policy.admission === 'invite' || policy.admission === 'invite_or_domain')

  if (inviteOk) {
    return { allowed: true, reason: 'invite' }
  }

  const domainOk =
    (policy.admission === 'domain' ||
      policy.admission === 'invite_or_domain') &&
    emailMatchesAudienceDomains(email, policy)

  if (domainOk) {
    return { allowed: true, reason: 'domain' }
  }

  if (policy.admission === 'invite') {
    return { allowed: false, reason: 'invitation_required' }
  }
  if (policy.admission === 'domain') {
    return { allowed: false, reason: 'domain_not_allowed' }
  }
  return { allowed: false, reason: 'invitation_or_domain_required' }
}

/** Match a concrete domain against a pattern (supports `*.suffix`). */
export function domainMatchesPattern(domain: string, pattern: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase()
  const normalizedPattern = pattern.trim().toLowerCase()
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2)
    return (
      normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`)
    )
  }
  return normalizedDomain === normalizedPattern
}

/** Public auth hints safe to expose before sign-in (no expose set). */
export const appAudiencePublicAuthSchema = z.object({
  admission: z.enum(APP_AUDIENCE_ADMISSION),
  auth: z.enum(APP_AUDIENCE_AUTH),
  hasIdp: z.boolean(),
  allowDomains: z.array(z.string()).optional(),
})

export type AppAudiencePublicAuth = z.infer<typeof appAudiencePublicAuthSchema>

export function toPublicAudienceAuth(
  policy: AppAudiencePolicy,
): AppAudiencePublicAuth {
  return {
    admission: policy.admission,
    auth: policy.auth ?? 'email_otp',
    hasIdp: policy.auth === 'oidc' && policy.idp != null,
    allowDomains: policy.allowDomains,
  }
}

/** Query param Surface reads after an OIDC callback redirect. */
export const AUDIENCE_ERROR_QUERY = 'audience_error'
export const AUDIENCE_ERROR_DETAIL_QUERY = 'audience_error_detail'

/** Invite-link query param forwarded to the IdP as `login_hint`. */
export const AUDIENCE_LOGIN_HINT_QUERY = 'email'

/** Keep only a plausible email for OIDC `login_hint`. */
export function normalizeAudienceLoginHint(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null
  }
  const email = value.trim().toLowerCase()
  return emailDomain(email) ? email : null
}

/** Hosted app URL with the invited email attached for SSO hinting. */
export function audienceInviteUrl(hostedUrl: string, email: string): string {
  const hint = normalizeAudienceLoginHint(email)
  const url = new URL(hostedUrl)
  if (hint) {
    url.searchParams.set(AUDIENCE_LOGIN_HINT_QUERY, hint)
  }
  return url.toString()
}

/** User-facing copy for hosted audience access failures. */
export function formatAudienceAccessError(
  reason: string,
  detail?: string | null,
): string {
  switch (reason) {
    case 'invitation_required':
      return 'You need an invitation to sign in. Contact the app owner to request access.'
    case 'domain_not_allowed':
      return 'Your email domain is not allowed for this app.'
    case 'invitation_or_domain_required':
      return 'Sign in with an invited email address or an allowed company domain.'
    case 'user_revoked':
      return 'Your access to this app was revoked. Contact the app owner if you need to sign in again.'
    case 'oidc_email_unverified':
      return 'Your identity provider did not verify your email address.'
    case 'oidc_state_invalid':
    case 'oidc_token_invalid':
    case 'oidc_nonce_mismatch':
      return 'Sign-in expired or was interrupted. Please try again.'
    case 'invalid_callback':
      return 'Sign-in could not be completed. Please try again.'
    case 'oidc_provider_error':
      return detail?.trim()
        ? detail.trim()
        : 'Your identity provider rejected the sign-in request.'
    case 'rate_limited':
      return 'Too many attempts. Wait a moment and try again.'
    case 'session_restore_failed':
      return 'We could not restore your sign-in. Sign in again to continue.'
    default:
      return detail?.trim()
        ? detail.trim()
        : 'Sign-in failed. Please try again or contact the app owner.'
  }
}

export const APP_SESSION_COOKIE = 'swirls_app_session'
export const APP_CAPABILITY_COOKIE = 'swirls_app_capability'

export const PRODUCTION_HOSTED_BASE = 'swirls.cloud'
export const LOCAL_HOSTED_BASE = 'swirls.local'

/** Subdomains reserved for platform ingress; not hosted app slugs. */
export const RESERVED_HOSTED_LABELS = ['surface', 'portal', 'www'] as const

type ResolveSurfaceHostedBaseOptions = {
  /** Optional `SURFACE_HOSTED_BASE` override. */
  envBase?: string | undefined
  nodeEnv?: string | undefined
}

type RuntimeEnvironment = {
  readonly process?: {
    readonly env?: Readonly<Record<string, string | undefined>>
  }
}

/** Read a server environment value without requiring Node globals in browsers. */
function runtimeEnvironmentValue(name: string): string | undefined {
  return (globalThis as RuntimeEnvironment).process?.env?.[name]
}

/** Hosted-app DNS suffix: slug is served at `{slug}.{base}`. */
export function resolveSurfaceHostedBase(
  options: ResolveSurfaceHostedBaseOptions = {},
): string {
  const explicit = options.envBase?.trim()
  if (explicit) {
    return explicit
  }

  const nodeEnv = options.nodeEnv ?? runtimeEnvironmentValue('NODE_ENV')

  if (nodeEnv !== 'production') {
    return LOCAL_HOSTED_BASE
  }

  return PRODUCTION_HOSTED_BASE
}

export function hostedAppOrigin(slug: string, baseHost?: string): string {
  const base =
    baseHost ??
    resolveSurfaceHostedBase({
      envBase: runtimeEnvironmentValue('SURFACE_HOSTED_BASE'),
    })
  return `https://${slug}.${base}`
}

/** Extract hosted slug from a request host like `{slug}.swirls.cloud`. */
export function parseHostedSlugFromHost(
  host: string,
  baseHost?: string,
): string | null {
  const base =
    baseHost ??
    resolveSurfaceHostedBase({
      envBase: runtimeEnvironmentValue('SURFACE_HOSTED_BASE'),
    })
  const normalized = host.split(':')[0]?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const suffix = `.${base}`
  if (normalized === base || !normalized.endsWith(suffix)) {
    return null
  }

  const slug = normalized.slice(0, -suffix.length)
  if (!slug || slug.includes('.')) {
    return null
  }

  if ((RESERVED_HOSTED_LABELS as readonly string[]).includes(slug)) {
    return null
  }

  return slug
}

/** Redirect member-surface URLs to the canonical hosted origin for audience apps. */
export function audienceHostedRedirectUrl(input: {
  hostedUrl: string | null | undefined
  hasAudienceAuth: boolean
  requestHost: string
  pathname: string
  search?: string
}): string | null {
  if (!input.hasAudienceAuth || !input.hostedUrl) {
    return null
  }

  let hostedHost: string
  try {
    hostedHost = new URL(input.hostedUrl).host.toLowerCase()
  } catch {
    return null
  }

  const currentHost = input.requestHost.split(':')[0]?.trim().toLowerCase()
  if (!currentHost || currentHost === hostedHost) {
    return null
  }

  const target = new URL(input.hostedUrl)
  target.pathname = input.pathname
  target.search = input.search ?? ''
  return target.toString()
}

/** Derive a stable hosted slug from org and app names. */
export function deriveHostedSlug(orgSlug: string, appName: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)

  const orgPart = normalize(orgSlug) || 'org'
  const appPart = normalize(appName) || 'app'
  return `${orgPart}-${appPart}`.slice(0, 63)
}
