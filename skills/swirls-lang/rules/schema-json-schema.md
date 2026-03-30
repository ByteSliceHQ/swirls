---
title: JSON Schema Format
impact: HIGH
tags: schema, json, json-schema, type, properties, required
---

## JSON Schema Format

All schemas in Swirls use JSON Schema (draft 7) format inside `@json { }` blocks. Schemas define the shape of form inputs, node outputs, AI structured responses, and review forms.

**Incorrect (using TypeScript types instead of JSON Schema):**

```swirls
outputSchema: @json {
  { name: string, email: string }
}
```

**Correct (JSON Schema format):**

```swirls
outputSchema: @json {
  {
    "type": "object",
    "required": ["name", "email"],
    "properties": {
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    },
    "additionalProperties": false
  }
}
```

**Correct (array schema):**

```swirls
outputSchema: @json {
  {
    "type": "array",
    "items": {
      "type": "object",
      "required": ["id", "value"],
      "properties": {
        "id": { "type": "string" },
        "value": { "type": "number" }
      }
    }
  }
}
```

Supported JSON Schema features:
- `type`: string, number, boolean, array, object, null
- `required`, `properties`, `items`, `additionalProperties`
- `enum`, `const`
- `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`
- `minItems`, `maxItems`, `uniqueItems`
- `allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`
- `$ref`, `$id`, `$schema`

The `@json { }` block must contain valid JSON. Keys must be double-quoted. Trailing commas are not allowed.
