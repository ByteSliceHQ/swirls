import type { ConfigValue } from './ast'
import type { Token } from './lexer'

export interface ResourceParserDelegate {
  eof(): boolean
  peek(): Token | null
  advance(): Token | null
  expect(kind: Token['kind']): Token | null
  error(message: string, token?: Token | null): void
  parseValue(): unknown
  parsePropertyKey(): string | null
  skipToNextBlock(): void
  parseConfigValue(token: Token): ConfigValue | undefined
}
