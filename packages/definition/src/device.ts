/**
 * Device tags and selectors: how a project groups its enrolled machines and
 * how a run names the machines it is for. Shared by the platform-db column,
 * the contract, the language validator, the dashboard and the CLI.
 */

import { z } from 'zod'

/** Most tags one device or one enrollment token can carry. */
export const DEVICE_TAGS_MAX = 32

/** Most devices one fleet run reaches. A wider run has to be split. */
export const DEVICE_FLEET_RUN_MAX = 500

/**
 * A tag is lowercase so `Front-Office` and `front-office` cannot become two
 * groups. A colon is allowed so a project can write pairs such as
 * `site:denver`.
 */
export const deviceTagSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._:-]{0,62}$/,
    'must be 1-63 characters of a-z, 0-9, dot, dash, underscore or colon, starting with a letter or number',
  )

/** A device's tags, deduplicated and sorted so stored values compare equal. */
export const deviceTagsSchema = z
  .array(deviceTagSchema)
  .max(DEVICE_TAGS_MAX)
  .transform((tags) => [...new Set(tags)].sort())

/** The operating system families a device reports. */
export const deviceOsSchema = z.enum(['windows', 'linux', 'macos'])
export type DeviceOs = z.infer<typeof deviceOsSchema>

/**
 * Which devices a fleet run is for. A device matches when it has every tag
 * listed and, when `os` is set, runs that operating system. At least one of
 * the two is required: there is no selector that means "every device", so a
 * run can never reach a whole fleet by leaving a field out.
 */
export const deviceSelectorSchema = z
  .strictObject({
    tags: deviceTagsSchema.optional(),
    os: deviceOsSchema.optional(),
  })
  .refine(
    (selector) => (selector.tags?.length ?? 0) > 0 || selector.os !== undefined,
    'a selector needs at least one tag or an os',
  )
export type DeviceSelector = z.infer<typeof deviceSelectorSchema>

/**
 * Whether a device matches a selector. Revoked devices never match. The API
 * applies the same rule in SQL; this copy is for callers that already hold
 * the device list, such as the dashboard's match count.
 */
export function deviceMatchesSelector(
  device: { status: string; os: string; tags: readonly string[] },
  selector: DeviceSelector,
): boolean {
  if (device.status !== 'active') {
    return false
  }

  if (selector.os !== undefined && device.os !== selector.os) {
    return false
  }

  return (selector.tags ?? []).every((tag) => device.tags.includes(tag))
}

/**
 * Read tags typed by a person: separated by commas or spaces, in any case.
 * Returns the cleaned tags, or the first entry that is not a valid tag.
 */
export function parseDeviceTagsInput(
  text: string,
): { ok: true; tags: string[] } | { ok: false; invalid: string } {
  const entries = text
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')

  for (const entry of entries) {
    if (!deviceTagSchema.safeParse(entry).success) {
      return { ok: false, invalid: entry }
    }
  }

  if (new Set(entries).size > DEVICE_TAGS_MAX) {
    return { ok: false, invalid: `more than ${DEVICE_TAGS_MAX} tags` }
  }

  return { ok: true, tags: [...new Set(entries)].sort() }
}

/**
 * The API the daemon's install scripts enroll with when none is given. The
 * scripts carry the same address, and a test in the web app holds them to it.
 */
export const DEVICE_INSTALL_DEFAULT_API_URL = 'https://swirls.ai/api'

/**
 * The commands that install the daemon on a machine, enroll it and start it
 * as a service. `webUrl` is the Swirls site, which serves the install
 * scripts. The token is set in the environment and never passed as an
 * argument, because arguments are visible to every user on the machine. The
 * API address is only named when it is not the one the scripts default to.
 */
export function deviceInstallCommands(input: { token: string; apiUrl: string; webUrl: string }): {
  windows: string[]
  unix: string[]
} {
  const site = input.webUrl.replace(/\/+$/, '')
  const api = input.apiUrl.replace(/\/+$/, '')
  const namesApi = api !== DEVICE_INSTALL_DEFAULT_API_URL

  const preserved = namesApi
    ? 'SWIRLSOPS_ENROLLMENT_TOKEN,SWIRLSOPS_API_URL'
    : 'SWIRLSOPS_ENROLLMENT_TOKEN'

  return {
    windows: [
      `$env:SWIRLSOPS_ENROLLMENT_TOKEN = "${input.token}"`,
      ...(namesApi ? [`$env:SWIRLSOPS_API_URL = "${api}"`] : []),
      `irm ${site}/swirlsops/install.ps1 | iex`,
    ],
    unix: [
      `export SWIRLSOPS_ENROLLMENT_TOKEN="${input.token}"`,
      ...(namesApi ? [`export SWIRLSOPS_API_URL="${api}"`] : []),
      `curl -fsSL ${site}/swirlsops/install | sudo --preserve-env=${preserved} sh`,
    ],
  }
}
