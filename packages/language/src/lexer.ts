/**
 * Lexer for the .swirls DSL. Produces tokens with source positions for parser and LSP.
 */

import type { SourceRange } from './ast'

const KEYWORDS = new Set([
  'form',
  'webhook',
  'schedule',
  'graph',
  'workflow',
  'trigger',
  'secret',
  'auth',
  'node',
  'root',
  'type',
  'label',
  'description',
  'enabled',
  'schema',
  'cron',
  'timezone',
  'version',
  'review',
  'condition',
  'name',
  'flow',
  'stream',
  'view',
  'postgres',
  'database',
  'migration',
  'disk',
  'computer',
  'operation',
  'skill',
  'agent',
  'decision',
  'mcp',
  'network',
  'channel',
  'query',
  'connection',
  'connector',
  'action',
  'app',
  'role',
  'profile',
  'match',
  'policy',
  'allow',
  'deny',
  'tools',
  'select',
  'insert',
  'delete',
  'params',
  'table',
  'subgraph',
  'map',
  'while',
  'items',
  'update',
  'maxItems',
  'maxIterations',
  'concurrency',
  'executionTokenTtl',
  'mock',
  'playbook',
  'case',
  'eval',
  'expect',
  'judge',
])

export type TokenKind =
  | 'block_comment'
  | 'keyword'
  | 'identifier'
  | 'string'
  | 'number'
  | 'boolean'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'colon'
  | 'comma'
  | 'dot'
  | 'eq'
  | 'star'
  | 'arrow'
  | 'labeled_arrow'
  | 'fenced_block'
  /** @ts "path.ts.swirls" — path in `value`, inner path span in `pathInnerRange`. */
  | 'ts_path_ref'
  /**
   * @ps "path.ps1" or @sh "path.sh": a script file for an `operation`. Path in
   * `value`, inner path span in `pathInnerRange`, language in `fencedLang`.
   */
  | 'script_path_ref'

/** The fenced languages that hold a device script: PowerShell and sh. */
export type ScriptBlockLang = 'ps' | 'sh'

export type FencedBlockLang = 'ts' | 'json' | 'sql' | 'prisma' | 'openui' | ScriptBlockLang

export interface Token {
  kind: TokenKind
  value: string | number | boolean
  range: SourceRange
  /** For fenced_block, the raw code inside the block. */
  fencedContent?: string
  /** For fenced_block, the range of the content (inside @lang { ... }, excluding braces). */
  fencedContentRange?: SourceRange
  /**
   * For fenced_block, which language the block holds. For script_path_ref,
   * the script language (`ps` or `sh`).
   */
  fencedLang?: FencedBlockLang
  /** For ts_path_ref and script_path_ref: 1-based range of the path text inside quotes. */
  pathInnerRange?: SourceRange
}

interface SourceLocation {
  line: number
  column: number
  offset: number
}

function pos(line: number, column: number, offset: number): SourceLocation {
  return { line, column, offset }
}

/** The `@lang` marker string stored on a fenced_block token. */
function atLangTokenValue(lang: FencedBlockLang): string {
  return `@${lang}`
}

function range(
  start: SourceLocation,
  end: SourceLocation,
): { start: SourceLocation; end: SourceLocation } {
  return { start, end }
}

export class Lexer {
  private source: string
  private len: number
  private line = 1
  private column = 1
  private offset = 0
  /**
   * Characters the lexer could not turn into a token. Each is skipped so the
   * rest of the file is still tokenized; the parser reports them.
   */
  readonly errors: Array<{ message: string; range: SourceRange }> = []

  constructor(source: string) {
    this.source = source
    this.len = source.length
  }

  eof(): boolean {
    return this.offset >= this.len
  }

  peek(): string {
    return this.offset < this.len ? this.source[this.offset]! : ''
  }

  peekAhead(n: number): string {
    const i = this.offset + n
    return i < this.len ? this.source[i]! : ''
  }

  advance(): string {
    if (this.offset >= this.len) {
      return ''
    }

    const ch = this.source[this.offset]!
    this.offset++

    if (ch === '\n') {
      this.line++
      this.column = 1
    } else {
      this.column++
    }

    return ch
  }

  private startPos(): SourceLocation {
    return pos(this.line, this.column, this.offset)
  }

  private skipWhitespace(): void {
    while (!this.eof()) {
      const ch = this.peek()

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.advance()
      } else if (ch === '/' && this.peekAhead(1) === '/') {
        this.skipLineComment()
      } else {
        break
      }
    }
  }

  private skipHorizontalWhitespace(): void {
    while (!this.eof()) {
      const ch = this.peek()

      if (ch === ' ' || ch === '\t') {
        this.advance()
      } else {
        break
      }
    }
  }

  private skipLineComment(): void {
    while (!this.eof() && this.peek() !== '\n') {
      this.advance()
    }
  }

  /** Read block comment from current position (after /). Returns inner text only, without the opening or closing delimiters. */
  private readBlockComment(): string {
    this.advance() // consume /
    this.advance() // consume *
    let content = ''

    while (!this.eof()) {
      if (this.peek() === '*' && this.peekAhead(1) === '/') {
        this.advance()
        this.advance()
        break
      }

      content += this.advance()
    }

    return content.trim()
  }

  private readString(): string {
    this.advance() // consume "
    let value = ''

    while (!this.eof()) {
      const ch = this.peek()

      if (ch === '\\') {
        this.advance()
        const next = this.advance()

        switch (next) {
          case '"':
            value += '"'
            break
          case '\\':
            value += '\\'
            break
          case 'n':
            value += '\n'
            break
          case 'r':
            value += '\r'
            break
          case 't':
            value += '\t'
            break
          default:
            value += next
        }
      } else if (ch === '"') {
        this.advance()
        break
      } else {
        value += this.advance()
      }
    }

    return value
  }

  private readNumber(): number {
    let s = ''

    while (!this.eof() && /[0-9.]/.test(this.peek())) {
      s += this.advance()
    }

    return s.includes('.') ? parseFloat(s) : parseInt(s, 10)
  }

  private readIdentifier(): string {
    let s = ''
    const first = this.peek()

    if (/[a-zA-Z_]/.test(first)) {
      s += this.advance()

      while (!this.eof() && /[a-zA-Z0-9_]/.test(this.peek())) {
        s += this.advance()
      }
    }

    return s
  }

  /** Skip a JSON string starting at opening " (caller should not have consumed "). */
  private skipJsonStringContent(): void {
    while (!this.eof()) {
      const ch = this.peek()

      if (ch === '\\') {
        this.advance()

        if (!this.eof()) {
          this.advance()
        }

        continue
      }

      if (ch === '"') {
        this.advance()
        return
      }

      this.advance()
    }
  }

  /** Skip TS/JS double-quoted string; caller consumes opening ". */
  private skipTsDoubleString(): void {
    while (!this.eof()) {
      const ch = this.peek()

      if (ch === '\\') {
        this.advance()

        if (!this.eof()) {
          this.advance()
        }

        continue
      }

      if (ch === '"') {
        this.advance()
        return
      }

      this.advance()
    }
  }

  /** Skip TS single-quoted string; caller consumes opening '. */
  private skipTsSingleString(): void {
    while (!this.eof()) {
      const ch = this.peek()

      if (ch === '\\') {
        this.advance()

        if (!this.eof()) {
          this.advance()
        }

        continue
      }

      if (ch === "'") {
        this.advance()
        return
      }

      this.advance()
    }
  }

  /** Skip SQL single-quoted string; '' is escaped quote. */
  private skipSqlSingleString(): void {
    this.advance() // opening '

    while (!this.eof()) {
      const ch = this.peek()

      if (ch === "'") {
        this.advance()

        if (this.peek() === "'") {
          this.advance()
          continue
        }

        return
      }

      this.advance()
    }
  }

  /**
   * Skip a template literal starting at ` (caller consumes `).
   * Handles ${ ... } with brace-balanced scanning using TS rules.
   */
  private skipTemplateLiteral(): void {
    while (!this.eof()) {
      const ch = this.peek()

      if (ch === '\\') {
        this.advance()

        if (!this.eof()) {
          this.advance()
        }

        continue
      }

      if (ch === '`') {
        this.advance()
        return
      }

      if (ch === '$' && this.peekAhead(1) === '{') {
        this.advance()
        this.advance()
        this.scanTsBraceGroup()
        continue
      }

      this.advance()
    }
  }

  /**
   * Scan until outermost `}` closes (depth starts at 1). Used for ${ ... } inside templates.
   */
  private scanTsBraceGroup(): void {
    let depth = 1

    while (depth > 0 && !this.eof()) {
      if (this.peek() === '/' && this.peekAhead(1) === '/') {
        this.skipLineComment()
        continue
      }

      if (this.peek() === '/' && this.peekAhead(1) === '*') {
        this.advance()
        this.advance()

        while (!this.eof()) {
          if (this.peek() === '*' && this.peekAhead(1) === '/') {
            this.advance()
            this.advance()
            break
          }

          this.advance()
        }

        continue
      }

      const ch = this.peek()

      if (ch === '"') {
        this.advance()
        this.skipTsDoubleString()
        continue
      }

      if (ch === "'") {
        this.advance()
        this.skipTsSingleString()
        continue
      }

      if (ch === '`') {
        this.advance()
        this.skipTemplateLiteral()
        continue
      }

      if (ch === '{') {
        depth++
        this.advance()
        continue
      }

      if (ch === '}') {
        depth--
        this.advance()
        continue
      }

      this.advance()
    }
  }

  /**
   * Body of @ts { ... }: brace-balanced with TS strings, comments, template literals.
   */
  private scanTsBlockBody(): void {
    let depth = 1

    while (depth > 0 && !this.eof()) {
      if (this.peek() === '/' && this.peekAhead(1) === '/') {
        this.skipLineComment()
        continue
      }

      if (this.peek() === '/' && this.peekAhead(1) === '*') {
        this.advance()
        this.advance()

        while (!this.eof()) {
          if (this.peek() === '*' && this.peekAhead(1) === '/') {
            this.advance()
            this.advance()
            break
          }

          this.advance()
        }

        continue
      }

      const ch = this.peek()

      if (ch === '"') {
        this.advance()
        this.skipTsDoubleString()
        continue
      }

      if (ch === "'") {
        this.advance()
        this.skipTsSingleString()
        continue
      }

      if (ch === '`') {
        this.advance()
        this.skipTemplateLiteral()
        continue
      }

      if (ch === '{') {
        depth++
        this.advance()
        continue
      }

      if (ch === '}') {
        depth--

        if (depth === 0) {
          return
        }

        this.advance()
        continue
      }

      this.advance()
    }
  }

  /**
   * Body of @json { ... }: brace-balanced; only JSON strings affect braces inside strings.
   */
  private scanJsonBlockBody(): void {
    let depth = 1

    while (depth > 0 && !this.eof()) {
      const ch = this.peek()

      if (ch === '"') {
        this.advance()
        this.skipJsonStringContent()
        continue
      }

      if (ch === '{') {
        depth++
        this.advance()
        continue
      }

      if (ch === '}') {
        depth--

        if (depth === 0) {
          return
        }

        this.advance()
        continue
      }

      this.advance()
    }
  }

  /**
   * Body of @sql { ... }: brace-balanced; strings and comments.
   */
  private scanSqlBlockBody(): void {
    let depth = 1

    while (depth > 0 && !this.eof()) {
      if (this.peek() === '-' && this.peekAhead(1) === '-') {
        while (!this.eof() && this.peek() !== '\n') {
          this.advance()
        }

        continue
      }

      if (this.peek() === '/' && this.peekAhead(1) === '*') {
        this.advance()
        this.advance()

        while (!this.eof()) {
          if (this.peek() === '*' && this.peekAhead(1) === '/') {
            this.advance()
            this.advance()
            break
          }

          this.advance()
        }

        continue
      }

      const ch = this.peek()

      if (ch === "'") {
        this.skipSqlSingleString()
        continue
      }

      if (ch === '"') {
        this.advance()

        while (!this.eof() && this.peek() !== '"') {
          if (this.peek() === '\\' && !this.eof()) {
            this.advance()
          }

          this.advance()
        }

        if (this.peek() === '"') {
          this.advance()
        }

        continue
      }

      if (ch === '{') {
        depth++
        this.advance()
        continue
      }

      if (ch === '}') {
        depth--

        if (depth === 0) {
          return
        }

        this.advance()
        continue
      }

      this.advance()
    }
  }

  /**
   * Body of @prisma { ... }: brace-balanced. The Prisma schema language uses
   * double-quoted strings and `//` / `///` line comments (no single-quoted
   * strings, no block comments), so only those two constructs can hide a brace.
   */
  private scanPrismaBlockBody(): void {
    let depth = 1

    while (depth > 0 && !this.eof()) {
      if (this.peek() === '/' && this.peekAhead(1) === '/') {
        this.skipLineComment()
        continue
      }

      const ch = this.peek()

      if (ch === '"') {
        this.advance()
        this.skipTsDoubleString()
        continue
      }

      if (ch === '{') {
        depth++
        this.advance()
        continue
      }

      if (ch === '}') {
        depth--

        if (depth === 0) {
          return
        }

        this.advance()
        continue
      }

      this.advance()
    }
  }

  /**
   * After consuming `@lang` and `{`, scan until matching `}` for the @-block.
   * Leaves offset at the closing `}`.
   */
  private scanAtLangBlockBody(lang: FencedBlockLang): void {
    if (lang === 'ts' || lang === 'openui') {
      this.scanTsBlockBody()
    } else if (lang === 'json') {
      this.scanJsonBlockBody()
    } else if (lang === 'prisma') {
      this.scanPrismaBlockBody()
    } else if (lang === 'ps' || lang === 'sh') {
      this.scanScriptBlockBody(lang)
    } else {
      this.scanSqlBlockBody()
    }
  }

  /**
   * Body of @ps { ... } or @sh { ... }: brace-balanced, skipping the places
   * a shell script can hold a brace that is not structure. Those are
   * single-quoted and double-quoted strings, `#` comments that start a word,
   * and in PowerShell `<# #>` comments and here-strings.
   *
   * A double-quoted string ends at the next unescaped quote, so a quote
   * nested inside `$( )` within a string is not understood. A script that
   * needs that goes in a file, referenced as `@ps "path"`.
   */
  private scanScriptBlockBody(lang: ScriptBlockLang): void {
    let depth = 1
    let atWordStart = true

    while (depth > 0 && !this.eof()) {
      const ch = this.peek()
      const wordStart = atWordStart
      atWordStart = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

      if (lang === 'ps' && ch === '<' && this.peekAhead(1) === '#') {
        while (!this.eof()) {
          if (this.peek() === '#' && this.peekAhead(1) === '>') {
            this.advance()
            this.advance()
            break
          }

          this.advance()
        }

        continue
      }

      if (ch === '#' && wordStart) {
        while (!this.eof() && this.peek() !== '\n') {
          this.advance()
        }

        continue
      }

      if (lang === 'ps' && ch === '@') {
        const quote = this.peekAhead(1)
        const afterQuote = this.peekAhead(2)

        if ((quote === '"' || quote === "'") && (afterQuote === '\n' || afterQuote === '\r')) {
          // A here-string runs to a line that starts with the quote and `@`.
          this.advance()
          this.advance()

          while (!this.eof()) {
            if (this.peek() === '\n' && this.peekAhead(1) === quote && this.peekAhead(2) === '@') {
              this.advance()
              this.advance()
              this.advance()
              break
            }

            this.advance()
          }

          continue
        }
      }

      if (ch === "'") {
        // No escapes inside single quotes, in sh or in PowerShell. A doubled
        // quote in PowerShell reads as two strings side by side, which
        // balances the same way.
        this.advance()

        while (!this.eof() && this.peek() !== "'") {
          this.advance()
        }

        if (this.peek() === "'") {
          this.advance()
        }

        continue
      }

      if (ch === '"') {
        const escape = lang === 'ps' ? '`' : '\\'
        this.advance()

        while (!this.eof() && this.peek() !== '"') {
          if (this.peek() === escape) {
            this.advance()
          }

          this.advance()
        }

        if (this.peek() === '"') {
          this.advance()
        }

        continue
      }

      if (ch === '{') {
        depth++
        this.advance()
        continue
      }

      if (ch === '}') {
        depth--

        if (depth === 0) {
          return
        }

        this.advance()
        continue
      }

      this.advance()
    }
  }

  /**
   * Parse @ts { ... }, @json { ... }, or @sql { ... }. Assumes current char is `@`.
   */
  private readAtLangBlock(): {
    value: string
    fencedContent: string
    fencedContentRange: SourceRange
    end: SourceLocation
    fencedLang: FencedBlockLang
  } | null {
    const saveOff = this.offset
    const saveLine = this.line
    const saveCol = this.column

    this.advance() // @
    this.skipHorizontalWhitespace()
    const id = this.readIdentifier()
    let lang: FencedBlockLang | null = null

    if (id === 'ts') {
      lang = 'ts'
    } else if (id === 'json') {
      lang = 'json'
    } else if (id === 'sql') {
      lang = 'sql'
    } else if (id === 'prisma') {
      lang = 'prisma'
    } else if (id === 'openui') {
      lang = 'openui'
    } else if (id === 'ps' || id === 'sh') {
      lang = id
    }

    if (lang === null) {
      this.offset = saveOff
      this.line = saveLine
      this.column = saveCol
      return null
    }

    this.skipHorizontalWhitespace()

    if (this.peek() !== '{') {
      this.offset = saveOff
      this.line = saveLine
      this.column = saveCol
      return null
    }

    this.advance() // {

    const contentStart = this.startPos()
    const contentStartOffset = this.offset

    this.scanAtLangBlockBody(lang)

    if (this.peek() !== '}') {
      // Unterminated: use rest of file as content
      const content = this.source.slice(contentStartOffset, this.offset)
      const end = this.startPos()
      return {
        value: atLangTokenValue(lang),
        fencedContent: content,
        fencedContentRange: range(contentStart, end),
        end,
        fencedLang: lang,
      }
    }

    const contentEnd = this.startPos()
    const content = this.source.slice(contentStartOffset, this.offset)
    this.advance() // closing }

    const end = this.startPos()
    const tokenValue = atLangTokenValue(lang)

    return {
      value: tokenValue,
      fencedContent: content,
      fencedContentRange: range(contentStart, contentEnd),
      end,
      fencedLang: lang,
    }
  }

  /**
   * Parse @ts "path.ts.swirls", @ps "path.ps1" or @sh "path.sh". Assumes
   * current char is `@`. Returns null if this is not a path reference in one
   * of those languages (caller may try other @ forms).
   */
  private readAtPathRef(): {
    lang: 'ts' | ScriptBlockLang
    path: string
    pathInnerRange: SourceRange
    end: SourceLocation
  } | null {
    const saveOff = this.offset
    const saveLine = this.line
    const saveCol = this.column

    this.advance() // @
    this.skipHorizontalWhitespace()
    const id = this.readIdentifier()

    if (id !== 'ts' && id !== 'ps' && id !== 'sh') {
      this.offset = saveOff
      this.line = saveLine
      this.column = saveCol
      return null
    }

    const lang = id

    this.skipHorizontalWhitespace()

    if (this.peek() !== '"') {
      this.offset = saveOff
      this.line = saveLine
      this.column = saveCol
      return null
    }

    this.advance() // opening "
    const innerStart = this.startPos()
    let value = ''

    while (!this.eof()) {
      const ch = this.peek()

      if (ch === '\\') {
        this.advance()
        const next = this.advance()

        switch (next) {
          case '"':
            value += '"'
            break
          case '\\':
            value += '\\'
            break
          case 'n':
            value += '\n'
            break
          case 'r':
            value += '\r'
            break
          case 't':
            value += '\t'
            break
          default:
            value += next
        }
      } else if (ch === '"') {
        const innerEnd = this.startPos()
        this.advance()
        const end = this.startPos()
        return {
          lang,
          path: value,
          pathInnerRange: range(innerStart, innerEnd),
          end,
        }
      } else {
        value += this.advance()
      }
    }

    // Unterminated string: still emit ref so parser can recover
    const innerEnd = this.startPos()
    const end = this.startPos()
    return {
      lang,
      path: value,
      pathInnerRange: range(innerStart, innerEnd),
      end,
    }
  }

  next(): Token | null {
    this.skipWhitespace()

    if (this.eof()) {
      return null
    }

    const start = this.startPos()
    const ch = this.peek()

    if (ch === '/' && this.peekAhead(1) === '*') {
      const value = this.readBlockComment()
      return {
        kind: 'block_comment',
        value,
        range: range(start, this.startPos()),
      }
    }

    if (ch === '{') {
      this.advance()

      return {
        kind: 'lbrace',
        value: '{',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '}') {
      this.advance()

      return {
        kind: 'rbrace',
        value: '}',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '[') {
      this.advance()

      return {
        kind: 'lbracket',
        value: '[',
        range: range(start, this.startPos()),
      }
    }

    if (ch === ']') {
      this.advance()

      return {
        kind: 'rbracket',
        value: ']',
        range: range(start, this.startPos()),
      }
    }

    if (ch === ':') {
      this.advance()

      return {
        kind: 'colon',
        value: ':',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '=') {
      this.advance()

      return {
        kind: 'eq',
        value: '=',
        range: range(start, this.startPos()),
      }
    }

    if (ch === ',') {
      this.advance()

      return {
        kind: 'comma',
        value: ',',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '.') {
      this.advance()

      return {
        kind: 'dot',
        value: '.',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '*') {
      this.advance()

      return {
        kind: 'star',
        value: '*',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '-' && this.peekAhead(1) === '[') {
      this.advance()
      this.advance()

      if (this.peek() === '"') {
        const label = this.readString()

        if (this.peek() === ']') {
          this.advance()

          if (this.peek() === '-' && this.peekAhead(1) === '>') {
            this.advance()
            this.advance()

            return {
              kind: 'labeled_arrow',
              value: label,
              range: range(start, this.startPos()),
            }
          }
        }
      }

      // Invalid -["..."]-> sequence; emit labeled_arrow with empty label so we don't lose the consumed "-[".
      return {
        kind: 'labeled_arrow',
        value: '',
        range: range(start, this.startPos()),
      }
    }

    if (ch === '-' && this.peekAhead(1) === '>') {
      this.advance()
      this.advance()

      return {
        kind: 'arrow',
        value: '->',
        range: range(start, this.startPos()),
      }
    }

    // Negative number literal (e.g. `autoDeleteMinutes: -1`). Unambiguous here:
    // the arrow forms `->` and `-[` are handled above, so a `-` directly before
    // a digit is a number. Without this the `-` lexes as a stray token, desyncs
    // the parser, and silently swallows the rest of the file.
    if (ch === '-' && /[0-9]/.test(this.peekAhead(1))) {
      this.advance() // consume '-'

      return {
        kind: 'number',
        value: -this.readNumber(),
        range: range(start, this.startPos()),
      }
    }

    if (ch === '"') {
      const value = this.readString()

      return {
        kind: 'string',
        value,
        range: range(start, this.startPos()),
      }
    }

    if (ch === '@') {
      const atBlock = this.readAtLangBlock()

      if (atBlock) {
        return {
          kind: 'fenced_block',
          value: atBlock.value,
          range: range(start, atBlock.end),
          fencedContent: atBlock.fencedContent,
          fencedContentRange: atBlock.fencedContentRange,
          fencedLang: atBlock.fencedLang,
        }
      }

      const pathRef = this.readAtPathRef()

      if (pathRef) {
        if (pathRef.lang === 'ts') {
          return {
            kind: 'ts_path_ref',
            value: pathRef.path,
            range: range(start, pathRef.end),
            pathInnerRange: pathRef.pathInnerRange,
          }
        }

        return {
          kind: 'script_path_ref',
          value: pathRef.path,
          range: range(start, pathRef.end),
          pathInnerRange: pathRef.pathInnerRange,
          fencedLang: pathRef.lang,
        }
      }

      this.advance() // invalid @directive; skip and continue
      return this.next()
    }

    if (/[0-9]/.test(ch)) {
      return {
        kind: 'number',
        value: this.readNumber(),
        range: range(start, this.startPos()),
      }
    }

    // Integration node paths and similar values: /chat.postMessage, /v1/users
    if (ch === '/') {
      let value = this.advance()!

      while (!this.eof()) {
        const next = this.peek()

        if (/[a-zA-Z0-9_./-]/.test(next)) {
          value += this.advance()
        } else {
          break
        }
      }

      return {
        kind: 'string',
        value,
        range: range(start, this.startPos()),
      }
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const id = this.readIdentifier()

      if (id === 'true') {
        return {
          kind: 'boolean',
          value: true,
          range: range(start, this.startPos()),
        }
      }

      if (id === 'false') {
        return {
          kind: 'boolean',
          value: false,
          range: range(start, this.startPos()),
        }
      }

      if (KEYWORDS.has(id)) {
        return {
          kind: 'keyword',
          value: id,
          range: range(start, this.startPos()),
        }
      }

      return {
        kind: 'identifier',
        value: id,
        range: range(start, this.startPos()),
      }
    }

    return null
  }

  tokenize(): Token[] {
    const tokens: Token[] = []

    while (true) {
      const t = this.next()

      if (t === null) {
        if (this.eof()) {
          break
        }

        // Not end of input: `next()` met a character that starts no token.
        // Skip it and keep going, so one stray character cannot hide the
        // rest of the file.
        const start = this.startPos()
        const ch = String.fromCodePoint(this.source.codePointAt(this.offset)!)

        for (let i = 0; i < ch.length; i++) {
          this.advance()
        }

        // A byte order mark at the very start is not an error.
        if (!(ch === '\uFEFF' && start.offset === 0)) {
          this.errors.push({
            message: `Unexpected character ${JSON.stringify(ch)}`,
            range: range(start, this.startPos()),
          })
        }

        continue
      }

      tokens.push(t)
    }

    return tokens
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize()
}
