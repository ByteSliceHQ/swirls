/**
 * Validation for `app` blocks (RFC 0022).
 * Called from the main validator.
 */

import {
  appAudienceDomainPatternSchema,
  appAudiencePolicySchema,
} from '@swirls/definition/app-audience'
import {
  APP_AVATAR_SHAPES,
  APP_AVATAR_VARIANTS,
  isAppAvatarShape,
  isAppAvatarVariant,
} from '@swirls/definition/app-avatar'
import {
  isAppBrandTokenKey,
  isCssColorValue,
  isValidAppBrandTokenValue,
} from '@swirls/definition/app-brand-tokens'
import { resourceNameSchema } from '@swirls/definition/schemas'
import type { Diagnostic, SourceRange, SwirlsFile } from '../ast'
import { type ChannelDecl, isSurfaceChannelPlatform } from '../channel/ast'
import type { LanguageHost, OpenUiSupport } from '../host'
import type { WorkspaceResourceIndex } from '../workspace/workspace-resources'
import { nameLookup } from '../workspace/workspace-resources'
import type { AppPage } from './ast'
import { isAppLandingLayout, isAppShellPreset } from './ast'
import { APP_THEMES, isAppTheme } from './themes'

/** True when pages expose chat, reviews, workflows, agents, or database writes. */
function appPagesHaveMutatingExpose(
  pages: AppPage[],
  openui: OpenUiSupport | undefined,
): boolean {
  for (const page of pages) {
    if (page.channel != null) {
      return true
    }
    if (page.threads != null && page.threads.length > 0) {
      return true
    }
    if (page.reviews != null && page.reviews.length > 0) {
      return true
    }
    if (page.render != null && openui) {
      const bindings = openui.extractBindings(page.render.content)
      if (
        bindings.agents.length > 0 ||
        bindings.channels.length > 0 ||
        bindings.workflows.length > 0 ||
        bindings.datastores.length > 0
      ) {
        return true
      }
    }
  }
  return false
}

function validateAudienceBlock(
  appName: string,
  audience: NonNullable<import('./ast').AppDecl['audience']>,
  pages: AppPage[],
  openui: OpenUiSupport | undefined,
): Diagnostic[] {
  const out: Diagnostic[] = []
  if (!audience.admission) {
    out.push(
      diag(`App "${appName}" audience requires admission`, audience.range),
    )
    return out
  }

  const parsed = appAudiencePolicySchema.safeParse({
    admission: audience.admission,
    auth: audience.auth,
    idp: audience.idp,
    allowDomains: audience.allowDomains,
    denyDomains: audience.denyDomains,
  })

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path[0]
      let range = audience.range
      if (path === 'admission' && audience.admissionRange) {
        range = audience.admissionRange
      } else if (path === 'auth' && audience.authRange) {
        range = audience.authRange
      } else if (path === 'idp' && audience.idpRange) {
        range = audience.idpRange
      } else if (path === 'allowDomains' && audience.allowDomainsRange) {
        range = audience.allowDomainsRange
      } else if (path === 'denyDomains' && audience.denyDomainsRange) {
        range = audience.denyDomainsRange
      }
      out.push(diag(`App "${appName}" audience: ${issue.message}`, range))
    }
    return out
  }

  for (const pattern of [
    ...(audience.allowDomains ?? []),
    ...(audience.denyDomains ?? []),
  ]) {
    if (!appAudienceDomainPatternSchema.safeParse(pattern).success) {
      out.push(
        diag(
          `App "${appName}" audience domain pattern "${pattern}" is invalid`,
          audience.allowDomainsRange ??
            audience.denyDomainsRange ??
            audience.range,
        ),
      )
    }
  }

  if (parsed.data.admission === 'public' && appPagesHaveMutatingExpose(pages, openui)) {
    out.push(
      diag(
        `App "${appName}" audience admission "public" requires a read-only expose set (no chat, reviews, workflows, agents, or database bindings)`,
        audience.range,
      ),
    )
  }

  return out
}

function diag(
  message: string,
  range: SourceRange,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return { message, range, severity }
}

function validateResourceName(
  name: string,
  range: SourceRange,
  kind: string,
): Diagnostic[] {
  const result = resourceNameSchema.safeParse(name)
  if (result.success) {
    return []
  }
  const msg = result.error.issues[0]?.message ?? 'Invalid name'
  return [diag(`${kind} name: ${msg}`, range)]
}

function channelsByName(
  ast: SwirlsFile,
  workspace?: WorkspaceResourceIndex,
): Map<string, ChannelDecl> {
  const byName = new Map((ast.channels ?? []).map((c) => [c.name, c]))
  for (const [name, decl] of workspace?.channelBlocks ?? []) {
    if (!byName.has(name)) {
      byName.set(name, decl)
    }
  }
  return byName
}

function validateHttpsUrl(
  value: string,
  range: SourceRange,
  label: string,
): Diagnostic[] {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') {
      return [diag(`${label} must be an https URL`, range)]
    }
  } catch {
    return [diag(`${label} must be a valid absolute https URL`, range)]
  }
  return []
}

function validateLandingCopy(
  value: string,
  range: SourceRange,
  label: string,
  maxLength: number,
): Diagnostic[] {
  if (value.length > maxLength) {
    return [
      diag(
        `${label} must be at most ${maxLength} characters (got ${value.length})`,
        range,
      ),
    ]
  }
  return []
}

export function validateAppBlocks(
  ast: SwirlsFile,
  options?: { workspace?: WorkspaceResourceIndex; host?: LanguageHost },
): Diagnostic[] {
  const out: Diagnostic[] = []
  const openui = options?.host?.openui
  const appBlocks = ast.apps ?? []

  if (appBlocks.length === 0) {
    return out
  }

  const channels = channelsByName(ast, options?.workspace)
  const viewNames = nameLookup(
    new Set((ast.views ?? []).map((v) => v.name)),
    options?.workspace?.views,
  )
  const workflowNames = nameLookup(
    new Set(ast.workflows.map((w) => w.name)),
    options?.workspace?.workflows,
  )
  const agentNames = nameLookup(
    new Set((ast.agent ?? []).map((a) => a.name)),
    options?.workspace?.agent,
  )
  const databaseNames = nameLookup(
    new Set((ast.databases ?? []).map((d) => d.name)),
    options?.workspace?.databases,
  )
  const postgresNames = nameLookup(
    new Set((ast.postgres ?? []).map((p) => p.name)),
    options?.workspace?.postgres,
  )
  const queryNames = nameLookup(
    new Set((ast.queries ?? []).map((q) => q.name)),
    options?.workspace?.queries,
  )
  const streamNames = nameLookup(
    new Set((ast.streams ?? []).map((s) => s.name)),
    options?.workspace?.streams,
  )
  const diskNames = nameLookup(
    new Set((ast.disk ?? []).map((d) => d.name)),
    options?.workspace?.disk,
  )

  for (const app of appBlocks) {
    if (app.name === '') {
      out.push(diag('App requires a name', app.range))
    } else {
      out.push(...validateResourceName(app.name, app.range, 'App'))
    }

    const sameName = appBlocks.filter((x) => x.name === app.name)
    if (sameName.length > 1) {
      out.push(diag(`Duplicate app name "${app.name}"`, app.range))
    }

    if (app.label === undefined || app.label.trim() === '') {
      out.push(
        diag(
          `App "${app.name}" requires a "label" (the title shown in chrome and catalog)`,
          app.range,
        ),
      )
    }

    const theme = app.brand?.theme
    if (theme !== undefined && !isAppTheme(theme)) {
      out.push(
        diag(
          `App "${app.name}" brand theme "${theme}" is not a supported theme — one of: ${APP_THEMES.join(', ')}`,
          app.brand?.themeRange ?? app.brand?.range ?? app.range,
        ),
      )
    }

    const avatar = app.brand?.avatar
    if (avatar?.variant !== undefined && !isAppAvatarVariant(avatar.variant)) {
      out.push(
        diag(
          `App "${app.name}" brand avatar variant "${avatar.variant}" is not supported — one of: ${APP_AVATAR_VARIANTS.join(', ')}`,
          avatar.variantRange ?? avatar.range ?? app.brand?.range ?? app.range,
        ),
      )
    }
    if (avatar?.colors !== undefined) {
      if (avatar.colors.length === 0) {
        out.push(
          diag(
            `App "${app.name}" brand avatar colors must be a non-empty list`,
            avatar.colorsRange ?? avatar.range ?? app.brand?.range ?? app.range,
          ),
        )
      } else {
        for (const color of avatar.colors) {
          if (!isCssColorValue(color)) {
            out.push(
              diag(
                `App "${app.name}" brand avatar colors must be CSS colors (hex, oklch(), rgb(), or hsl())`,
                avatar.colorsRange ??
                  avatar.range ??
                  app.brand?.range ??
                  app.range,
              ),
            )
            break
          }
        }
      }
    }
    if (avatar?.shape !== undefined && !isAppAvatarShape(avatar.shape)) {
      out.push(
        diag(
          `App "${app.name}" brand avatar shape "${avatar.shape}" is not supported — one of: ${APP_AVATAR_SHAPES.join(', ')}`,
          avatar.shapeRange ?? avatar.range ?? app.brand?.range ?? app.range,
        ),
      )
    }

    const tokenModes = [
      ['light', app.brand?.tokens?.light],
      ['dark', app.brand?.tokens?.dark],
    ] as const
    for (const [mode, map] of tokenModes) {
      if (map === undefined) {
        continue
      }
      for (const [key, entry] of Object.entries(map)) {
        if (entry === undefined) {
          continue
        }
        if (!isAppBrandTokenKey(key)) {
          continue
        }
        if (!isValidAppBrandTokenValue(key, entry.value)) {
          const expected =
            key === 'radius'
              ? 'a CSS length (for example "8px")'
              : 'a CSS color (hex, oklch(), rgb(), or hsl())'
          out.push(
            diag(
              `App "${app.name}" brand tokens.${mode}.${key} must be ${expected}`,
              entry.range,
            ),
          )
        }
      }
    }

    const landingLayout = app.landing?.layout
    if (landingLayout !== undefined && !isAppLandingLayout(landingLayout)) {
      out.push(
        diag(
          `App "${app.name}" landing layout "${landingLayout}" is not supported — one of: centered, split, cover`,
          app.landing?.layoutRange ?? app.landing?.range ?? app.range,
        ),
      )
    }

    if (app.landing?.image !== undefined) {
      out.push(
        ...validateHttpsUrl(
          app.landing.image,
          app.landing.imageRange ?? app.landing.range,
          `App "${app.name}" landing image`,
        ),
      )
    }

    if (app.landing?.title !== undefined) {
      out.push(
        ...validateLandingCopy(
          app.landing.title,
          app.landing.titleRange ?? app.landing.range,
          `App "${app.name}" landing title`,
          120,
        ),
      )
    }

    if (app.landing?.subtitle !== undefined) {
      out.push(
        ...validateLandingCopy(
          app.landing.subtitle,
          app.landing.subtitleRange ?? app.landing.range,
          `App "${app.name}" landing subtitle`,
          280,
        ),
      )
    }

    if (app.landing?.signInTitle !== undefined) {
      out.push(
        ...validateLandingCopy(
          app.landing.signInTitle,
          app.landing.signInTitleRange ?? app.landing.range,
          `App "${app.name}" landing sign_in_title`,
          80,
        ),
      )
    }

    if (app.landing?.signInHint !== undefined) {
      out.push(
        ...validateLandingCopy(
          app.landing.signInHint,
          app.landing.signInHintRange ?? app.landing.range,
          `App "${app.name}" landing sign_in_hint`,
          280,
        ),
      )
    }

    if (app.landing?.footer !== undefined) {
      out.push(
        ...validateLandingCopy(
          app.landing.footer,
          app.landing.footerRange ?? app.landing.range,
          `App "${app.name}" landing footer`,
          280,
        ),
      )
    }

    const discover = app.landing?.discover
    if (discover !== undefined) {
      if (discover.metaTitle !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.metaTitle,
            discover.metaTitleRange ?? discover.range,
            `App "${app.name}" landing discover meta_title`,
            70,
          ),
        )
      }
      if (discover.metaDescription !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.metaDescription,
            discover.metaDescriptionRange ?? discover.range,
            `App "${app.name}" landing discover meta_description`,
            160,
          ),
        )
      }
      if (discover.summary !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.summary,
            discover.summaryRange ?? discover.range,
            `App "${app.name}" landing discover summary`,
            500,
          ),
        )
      }
      if (discover.audience !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.audience,
            discover.audienceRange ?? discover.range,
            `App "${app.name}" landing discover audience`,
            280,
          ),
        )
      }
      if (discover.organization !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.organization,
            discover.organizationRange ?? discover.range,
            `App "${app.name}" landing discover organization`,
            120,
          ),
        )
      }
      if (discover.applicationCategory !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.applicationCategory,
            discover.applicationCategoryRange ?? discover.range,
            `App "${app.name}" landing discover application_category`,
            80,
          ),
        )
      }
      if (discover.locale !== undefined) {
        out.push(
          ...validateLandingCopy(
            discover.locale,
            discover.localeRange ?? discover.range,
            `App "${app.name}" landing discover locale`,
            10,
          ),
        )
      }
      if (discover.ogImage !== undefined) {
        out.push(
          ...validateHttpsUrl(
            discover.ogImage,
            discover.ogImageRange ?? discover.range,
            `App "${app.name}" landing discover og_image`,
          ),
        )
      }
      if (discover.canonical !== undefined) {
        out.push(
          ...validateHttpsUrl(
            discover.canonical,
            discover.canonicalRange ?? discover.range,
            `App "${app.name}" landing discover canonical`,
          ),
        )
      }
      if (discover.organizationUrl !== undefined) {
        out.push(
          ...validateHttpsUrl(
            discover.organizationUrl,
            discover.organizationUrlRange ?? discover.range,
            `App "${app.name}" landing discover organization_url`,
          ),
        )
      }
      if (discover.keywords !== undefined) {
        if (discover.keywords.length > 20) {
          out.push(
            diag(
              `App "${app.name}" landing discover keywords must have at most 20 entries`,
              discover.keywordsRange ?? discover.range,
            ),
          )
        }
        for (const [index, keyword] of discover.keywords.entries()) {
          if (keyword.length > 50) {
            out.push(
              diag(
                `App "${app.name}" landing discover keywords[${index}] must be at most 50 characters`,
                discover.keywordsRange ?? discover.range,
              ),
            )
          }
        }
      }
      if (discover.capabilities !== undefined) {
        if (discover.capabilities.length > 20) {
          out.push(
            diag(
              `App "${app.name}" landing discover capabilities must have at most 20 entries`,
              discover.capabilitiesRange ?? discover.range,
            ),
          )
        }
        for (const [index, capability] of discover.capabilities.entries()) {
          if (capability.length > 120) {
            out.push(
              diag(
                `App "${app.name}" landing discover capabilities[${index}] must be at most 120 characters`,
                discover.capabilitiesRange ?? discover.range,
              ),
            )
          }
        }
      }
      if (discover.faq !== undefined) {
        if (discover.faq.items.length > 20) {
          out.push(
            diag(
              `App "${app.name}" landing discover faq must have at most 20 items`,
              discover.faq.range,
            ),
          )
        }
        for (const item of discover.faq.items) {
          out.push(
            ...validateLandingCopy(
              item.question,
              item.questionRange ?? item.range,
              `App "${app.name}" landing discover faq question`,
              200,
            ),
          )
          out.push(
            ...validateLandingCopy(
              item.answer,
              item.answerRange ?? item.range,
              `App "${app.name}" landing discover faq answer`,
              1000,
            ),
          )
        }
      }
    }

    const preset = app.shell?.preset
    if (preset !== undefined && !isAppShellPreset(preset)) {
      out.push(
        diag(
          `App "${app.name}" shell preset "${preset}" is not supported — one of: sidebar, topnav, chat, canvas`,
          app.shell?.presetRange ?? app.shell?.range ?? app.range,
        ),
      )
    }

    if (app.pages.length === 0) {
      out.push(
        diag(`App "${app.name}" requires at least one "page"`, app.range),
      )
    }

    const pageNames = new Set<string>()
    for (const page of app.pages) {
      if (pageNames.has(page.name)) {
        out.push(
          diag(
            `App "${app.name}" declares page "${page.name}" more than once`,
            page.nameRange,
          ),
        )
      }
      pageNames.add(page.name)

      if (page.viewport !== undefined && page.viewport !== 'full') {
        out.push(
          diag(
            `App "${app.name}" page "${page.name}" viewport "${page.viewport}" is not supported — use full or omit viewport`,
            page.viewportRange ?? page.range,
          ),
        )
      }

      const hasRender = page.render != null
      const hasChannel = page.channel != null
      const threads = page.threads
      const hasThreads = threads != null
      const reviews = page.reviews
      const hasReviews = reviews != null
      const bodyCount =
        Number(hasRender) +
        Number(hasChannel) +
        Number(hasThreads) +
        Number(hasReviews)

      if (bodyCount === 0) {
        out.push(
          diag(
            `App "${app.name}" page "${page.name}" must declare exactly one of render: @openui { … }, channel: <channel>, threads: [channel, …], or reviews: [workflow, …]`,
            page.range,
          ),
        )
      }

      if (bodyCount > 1) {
        out.push(
          diag(
            `App "${app.name}" page "${page.name}" must declare exactly one of render:, channel:, threads:, or reviews:`,
            page.reviewsRanges?.[0] ??
              page.threadsRanges?.[0] ??
              page.channelRange ??
              page.render?.range ??
              page.range,
          ),
        )
      }

      if (hasReviews) {
        if (reviews.length === 0) {
          out.push(
            diag(
              `App "${app.name}" page "${page.name}" reviews must contain at least one workflow`,
              page.range,
            ),
          )
        }
        for (const [index, workflowName] of reviews.entries()) {
          if (!workflowNames.has(workflowName)) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" reviews workflow "${workflowName}" is not defined`,
                page.reviewsRanges?.[index] ?? page.range,
              ),
            )
          }
        }
      }

      if (hasChannel) {
        const channelName = page.channel!
        const channelRange = page.channelRange ?? page.range
        if (!channels.has(channelName)) {
          out.push(
            diag(
              `App "${app.name}" page "${page.name}" binds channel "${channelName}" which is not defined`,
              channelRange,
            ),
          )
        } else {
          const channel = channels.get(channelName)!
          if (!isSurfaceChannelPlatform(channel.platform)) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" binds channel "${channelName}" with platform "${channel.platform}" — channel pages require "platform: swirls"`,
                channelRange,
              ),
            )
          }
          if (!channel.agent) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" binds channel "${channelName}" which has no agent`,
                channelRange,
              ),
            )
          } else if (!agentNames.has(channel.agent)) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" binds channel "${channelName}" whose agent "${channel.agent}" is not defined`,
                channelRange,
              ),
            )
          }
        }
      }

      if (hasThreads) {
        if (threads!.length === 0) {
          out.push(
            diag(
              `App "${app.name}" page "${page.name}" threads must contain at least one channel`,
              page.range,
            ),
          )
        }
        for (const [index, channelName] of threads!.entries()) {
          const channelRange = page.threadsRanges?.[index] ?? page.range
          if (!channels.has(channelName)) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" threads channel "${channelName}" is not defined`,
                channelRange,
              ),
            )
          } else {
            const channel = channels.get(channelName)!
            if (!isSurfaceChannelPlatform(channel.platform)) {
              out.push(
                diag(
                  `App "${app.name}" page "${page.name}" threads channel "${channelName}" with platform "${channel.platform}" — thread pages require "platform: swirls"`,
                  channelRange,
                ),
              )
            }
            if (!channel.agent) {
              out.push(
                diag(
                  `App "${app.name}" page "${page.name}" threads channel "${channelName}" which has no agent`,
                  channelRange,
                ),
              )
            } else if (!agentNames.has(channel.agent)) {
              out.push(
                diag(
                  `App "${app.name}" page "${page.name}" threads channel "${channelName}" whose agent "${channel.agent}" is not defined`,
                  channelRange,
                ),
              )
            }
          }
        }
      }

      if (page.render != null && page.render.content.trim() === '') {
        out.push(
          diag(
            `App "${app.name}" page "${page.name}" render @openui block is empty`,
            page.render.range,
          ),
        )
      } else if (page.render != null && openui) {
        const bindings = openui.extractBindings(page.render.content)
        for (const channelName of bindings.channels) {
          if (!channels.has(channelName)) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" @openui binds channel "${channelName}" which is not defined`,
                page.render.range,
              ),
            )
          } else {
            const channel = channels.get(channelName)
            if (channel && !isSurfaceChannelPlatform(channel.platform)) {
              out.push(
                diag(
                  `App "${app.name}" page "${page.name}" @openui binds channel "${channelName}" with platform "${channel.platform}" — Chat requires "platform: swirls"`,
                  page.render.range,
                ),
              )
            }
          }
        }

        const openUi = openui.validate(page.render.content, {
          expose: {
            agents: [...agentNames],
            channels: [...channels.keys()],
            workflows: [...workflowNames],
            views: [...viewNames],
            streams: [...streamNames],
            databases: [...databaseNames],
            postgres: [...postgresNames],
            queries: [...queryNames],
            disks: [...diskNames],
          },
        })
        if (!openUi.ok) {
          for (const message of openUi.errors) {
            out.push(
              diag(
                `App "${app.name}" page "${page.name}" @openui: ${message}`,
                page.render.range,
              ),
            )
          }
        }
      }
    }

    if (app.nav) {
      if (app.nav.sections.length === 0) {
        out.push(
          diag(
            `App "${app.name}" nav requires at least one section`,
            app.nav.range,
          ),
        )
      }
      for (const section of app.nav.sections) {
        if (section.title.trim() === '') {
          out.push(
            diag(
              `App "${app.name}" nav section requires a quoted title`,
              section.titleRange,
            ),
          )
        }
        if (section.entries.length === 0) {
          out.push(
            diag(
              `App "${app.name}" nav section "${section.title}" requires at least one page entry`,
              section.range,
            ),
          )
        }
        for (const entry of section.entries) {
          if (!pageNames.has(entry.pageName)) {
            out.push(
              diag(
                `App "${app.name}" nav references page "${entry.pageName}" which is not declared`,
                entry.pageNameRange,
              ),
            )
          }
        }
      }
    } else if (app.pages.length > 1) {
      out.push(
        diag(
          `App "${app.name}" has multiple pages and requires a "nav" block`,
          app.range,
        ),
      )
    }

    if (app.audience) {
      out.push(...validateAudienceBlock(app.name, app.audience, app.pages, openui))
    }

    for (const field of app.reserved) {
      const msg =
        field.name === 'domain'
          ? `\`${field.name}\` is reserved for custom domains (RFC 0017) and not yet supported`
          : `\`${field.name}\` is reserved for a later app phase and not yet supported`
      out.push(diag(msg, field.range))
    }
  }

  return out
}
