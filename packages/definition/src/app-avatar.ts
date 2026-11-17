/**
 * `app … { brand { avatar { variant, colors, shape } } }` — boring-avatars config for
 * Surface procedural avatars. Shared by DSL validation, deployment definition,
 * and the contract.
 */

import { z } from 'zod'

export const APP_AVATAR_VARIANTS = [
  'beam',
  'marble',
  'bauhaus',
  'pixel',
  'sunset',
  'ring',
] as const

export type AppAvatarVariant = (typeof APP_AVATAR_VARIANTS)[number]

export function isAppAvatarVariant(value: string): value is AppAvatarVariant {
  return (APP_AVATAR_VARIANTS as readonly string[]).includes(value)
}

/** Square corners (default) or fully circular avatars. */
export const APP_AVATAR_SHAPES = ['square', 'circle'] as const

export type AppAvatarShape = (typeof APP_AVATAR_SHAPES)[number]

export function isAppAvatarShape(value: string): value is AppAvatarShape {
  return (APP_AVATAR_SHAPES as readonly string[]).includes(value)
}

export const appAvatarSchema = z.object({
  variant: z.enum(APP_AVATAR_VARIANTS).optional(),
  colors: z.array(z.string()).min(1).optional(),
  shape: z.enum(APP_AVATAR_SHAPES).optional(),
})

export type AppAvatar = z.infer<typeof appAvatarSchema>
