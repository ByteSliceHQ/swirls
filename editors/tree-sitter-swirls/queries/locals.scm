; Names are looked up from the block they are used in outwards, so a node
; name resolves inside its workflow and a resource name at the top level.

(body) @local.scope

(block
  name: (identifier) @local.definition)

(edge
  source: (identifier) @local.reference)

(edge
  target: (identifier) @local.reference)

(trigger_binding
  resource: (identifier) @local.reference)

(trigger_binding
  workflow: (identifier) @local.reference)

(grant
  role: (identifier) @local.reference)

(grant
  target: (identifier) @local.reference)

(reference
  (identifier) @local.reference)
