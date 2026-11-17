/**
 * AST types for top-level `computer name { }` blocks bound by `type: shell` nodes.
 * Runtime nouns (Flox, Daytona, snapshot) are not authored in the DSL.
 */

import type { SourceRange } from '../ast'

export interface ComputerSoftwarePin {
  packageName: string
  /** Quoted catalog pin. Empty string is a validator error. */
  pin: string
  range: SourceRange
}

export interface ComputerResourcesDecl {
  cpus?: number
  cpusRange?: SourceRange
  memoryMiB?: number
  memoryMiBRange?: SourceRange
  diskGiB?: number
  diskGiBRange?: SourceRange
  range: SourceRange
}

/** `harness: { type: coding, provider: codex }`. At most one per computer. */
export interface ComputerHarnessDecl {
  /** Any bare name; the host's harness catalog decides which are valid. */
  type: string
  typeRange: SourceRange
  provider: string
  providerRange: SourceRange
  /** From the `harness` key through the closing brace. */
  range: SourceRange
}

export interface ComputerDecl {
  name: string
  label?: string
  description?: string
  software?: ComputerSoftwarePin[]
  disks?: string[]
  disksRanges?: SourceRange[]
  resources?: ComputerResourcesDecl
  harness?: ComputerHarnessDecl
  docComment?: string
  range: SourceRange
}
