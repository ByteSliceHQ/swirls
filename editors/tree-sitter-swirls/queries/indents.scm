; Indentation, in the nvim-treesitter dialect. Helix and Zed use different
; capture names; the README has the equivalent for each.

[
  (body)
  (object)
  (array)
  (embedded_block)
] @indent.begin

[
  "}"
  "]"
] @indent.branch @indent.end

[
  (line_comment)
  (block_comment)
  (string)
] @indent.auto
