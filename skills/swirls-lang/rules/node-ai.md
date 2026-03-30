---
title: AI Nodes
impact: CRITICAL
tags: node, ai, llm, text, object, image, video, embed, model, prompt
---

## AI Nodes

AI nodes call language models and other AI services. The `kind` field determines the output type and which additional fields are valid.

**Required fields:** `kind`, `model`, `prompt`

**Incorrect (object kind without schema):**

```swirls
node classify {
  type: ai
  label: "Classify"
  kind: object
  model: "anthropic/claude-3.5-sonnet"
  prompt: @ts { return "Classify this text" }
}
```

Error: AI nodes with `kind: object` require a `schema` to define the structured output.

**Correct (object kind with schema):**

```swirls
node classify {
  type: ai
  label: "Classify"
  kind: object
  model: "anthropic/claude-3.5-sonnet"
  prompt: @ts {
    const msg = context.nodes.root.output.message
    return "Classify this message as spam or not:\n\n" + msg
  }
  schema: @json {
    {
      "type": "object",
      "required": ["category", "confidence"],
      "properties": {
        "category": { "type": "string", "enum": ["spam", "not_spam"] },
        "confidence": { "type": "number" }
      }
    }
  }
}
```

**Correct (text kind for plain string output):**

```swirls
node summarize {
  type: ai
  label: "Summarize"
  kind: text
  model: "gpt-4o-mini"
  temperature: 0.7
  maxTokens: 200
  prompt: @ts {
    return "Summarize: " + context.nodes.root.output.body
  }
}
```

**Correct (image kind):**

```swirls
node generate_image {
  type: ai
  label: "Generate"
  kind: image
  model: "openai/dall-e-3"
  prompt: @ts { return "A professional illustration of " + context.nodes.root.output.topic }
  options: { n: 1, size: "1024x1024" }
}
```

**Correct (embed kind):**

```swirls
node embed {
  type: ai
  label: "Embed"
  kind: embed
  model: "openai/text-embedding-3-small"
  prompt: @ts { return [context.nodes.root.output.text] }
}
```

AI kinds: `text`, `object`, `image`, `video`, `embed`

AI node fields:
| Field | Required | Type |
|-------|----------|------|
| `kind` | yes | text, object, image, video, embed |
| `model` | yes | String (provider/model format) |
| `prompt` | yes | `@ts` block |
| `schema` | required for object | `@json` block |
| `temperature` | no | Number (0-1) |
| `maxTokens` | no | Number |
| `options` | no | Object (kind-specific, e.g. n, size) |

AI nodes infer `OPENROUTER_API_KEY` as a secret. You do not need to declare it.
