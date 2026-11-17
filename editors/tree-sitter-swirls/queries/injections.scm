; Language injections for embedded blocks. These match what the VS Code
; TextMate grammar embeds (TypeScript, JSON, SQL, Prisma) and add shell and
; PowerShell for `operation` scripts. `@openui` blocks are left alone: OpenUI
; Lang has no tree-sitter grammar.

((embedded_block
  language: (embedded_language) @_language
  content: (embedded_content) @injection.content)
  (#eq? @_language "ts")
  (#set! injection.language "typescript"))

((embedded_block
  language: (embedded_language) @_language
  content: (embedded_content) @injection.content)
  (#eq? @_language "json")
  (#set! injection.language "json"))

((embedded_block
  language: (embedded_language) @_language
  content: (embedded_content) @injection.content)
  (#eq? @_language "sql")
  (#set! injection.language "sql"))

((embedded_block
  language: (embedded_language) @_language
  content: (embedded_content) @injection.content)
  (#eq? @_language "prisma")
  (#set! injection.language "prisma"))

((embedded_block
  language: (embedded_language) @_language
  content: (embedded_content) @injection.content)
  (#eq? @_language "sh")
  (#set! injection.language "bash"))

((embedded_block
  language: (embedded_language) @_language
  content: (embedded_content) @injection.content)
  (#eq? @_language "ps")
  (#set! injection.language "powershell"))

([
  (line_comment)
  (block_comment)
] @injection.content
  (#set! injection.language "comment"))
