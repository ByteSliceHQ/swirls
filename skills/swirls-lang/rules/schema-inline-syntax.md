---
title: Inline Schema Syntax
impact: MEDIUM
tags: schema, inline, object, json
---

## Inline Schema Syntax

Schemas can use either `@json { }` blocks (with double-quoted JSON) or inline object literal syntax (without `@json`). Both are valid.

**Correct (@json block syntax):**

```swirls
inputSchema: @json {
  {
    "type": "object",
    "required": ["title", "body"],
    "properties": {
      "title": { "type": "string" },
      "body": { "type": "string" }
    },
    "additionalProperties": false
  }
}
```

**Correct (inline object literal syntax):**

```swirls
inputSchema: {
  type: "object"
  required: ["title", "body"]
  properties: {
    title: {
      type: "string"
    }
    body: {
      type: "string"
    }
  }
  additionalProperties: false
}
```

The inline syntax uses the DSL's own object format: keys may be bare identifiers or double-quoted strings (quote any key that is not a plain identifier, e.g. contains a hyphen), commas are optional, and string values are double-quoted.

Both produce the same AST. Use whichever style is more readable for your case. `@json` is more common and maps directly to JSON Schema documentation.
