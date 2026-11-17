/**
 * AST types for top-level `network name { … }` declarations.
 *
 * A network is a provider-neutral private connectivity requirement. Outbound
 * consumers reference it by name; its `expose: { }` field is the centralized
 * allowlist of addressable interfaces admitted to private ingress.
 */

import type { SourceRange } from '../ast'

export interface NetworkNamedExposureRef {
  name: string
  range: SourceRange
}

export interface NetworkDatabaseExposureDecl {
  database: string
  databaseRange?: SourceRange
  connections: NetworkNamedExposureRef[]
  range: SourceRange
}

export interface NetworkExposeDecl {
  apps: NetworkNamedExposureRef[]
  channels: NetworkNamedExposureRef[]
  forms: NetworkNamedExposureRef[]
  webhooks: NetworkNamedExposureRef[]
  /**
   * Reserved for the service primitive. The parser preserves the intended
   * shape, while validation fails closed until that primitive is available.
   */
  services: NetworkNamedExposureRef[]
  databases: NetworkDatabaseExposureDecl[]
  range: SourceRange
}

export interface NetworkDecl {
  /** Set by deploy bundle / tooling; not produced by the parser. */
  id?: string
  name: string
  label?: string
  labelRange?: SourceRange
  description?: string
  descriptionRange?: SourceRange
  expose?: NetworkExposeDecl
  /** Doc comment immediately above this declaration; shown on hover. */
  docComment?: string
  range: SourceRange
}
