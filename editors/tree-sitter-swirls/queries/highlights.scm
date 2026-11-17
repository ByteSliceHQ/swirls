; Highlights for the Swirls DSL.
;
; Capture names follow the nvim-treesitter / Zed conventions. No two patterns
; capture the same node, so the result does not depend on whether an editor
; lets the first or the last matching pattern win.

; Comments

[
  (line_comment)
  (block_comment)
] @comment

; Blocks: `workflow notify { ... }`, `root { ... }`, `section "Today" { ... }`

(block
  kind: (identifier) @keyword)

(block
  name: (identifier) @type)

(block
  name: (string) @string)

; Fields: `label: "Notify"`

(field
  key: (identifier) @property)

(field
  key: (string) @property)

; Enum-like bare words: `type: code`, `mode: all`, `status: completed`

(field
  key: (identifier) @_key
  value: (reference) @constant.builtin
  (#any-of? @_key "type" "kind" "mode" "auto" "status" "severity"))

; `page: home { ... }` names another block

(field
  value: (reference) @type
  body: (object))

; Edges: `root -> send`, `route -["urgent"]-> escalate`

(edge
  source: (identifier) @type)

(edge
  target: (identifier) @type)

(labeled_arrow
  label: (string) @string)

; Trigger bindings: `form:contact -> notify`

(trigger_binding
  kind: (identifier) @keyword)

(trigger_binding
  resource: (identifier) @type)

(trigger_binding
  workflow: (identifier) @type)

; Policy grants: `allow sales -> agent accountant`

(grant
  effect: (identifier) @keyword)

(grant
  role: (identifier) @type)

(grant
  target_kind: (identifier) @keyword)

(grant
  target: (identifier) @type)

(wildcard) @constant.builtin

; Literals

; A string holding a duration, such as "30m". The pattern avoids `+` and `|`
; so it reads the same as a Rust regex and as a Vim regex.
(field
  value: (string) @string.special
  (#match? @string.special "^\"[0-9][0-9]*[smh]\"$"))

(field
  value: (string) @string
  (#not-match? @string "^\"[0-9][0-9]*[smh]\"$"))

(array
  (string) @string)

(escape_sequence) @string.escape

(path) @string.special.path

[
  (number)
  (duration)
] @number

(boolean) @boolean

(null) @constant.builtin

; Embedded code: `@ts { ... }`, `@sql { ... }`, `@ts "./file.ts.swirls"`

(embedded_block
  "@" @keyword.directive
  language: (embedded_language) @keyword.directive)

(file_reference
  "@" @keyword.directive
  language: (embedded_language) @keyword.directive)

(file_reference
  path: (string) @string.special.path)

; Punctuation

[
  "{"
  "}"
  "["
  "]"
] @punctuation.bracket

[
  ":"
  ","
  "."
] @punctuation.delimiter

[
  "->"
  "-["
  "]->"
] @operator
