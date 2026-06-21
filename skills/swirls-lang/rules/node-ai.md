---
title: AI Nodes
impact: CRITICAL
tags: node, ai, llm, text, object, image, video, embed, model, prompt
---

## AI Nodes

AI nodes call language models and other AI services. The `kind` field determines the output type and which additional fields are valid.

**Default model:** Unless the user specifies a different model, always use `google/gemini-2.5-flash` for text and object kinds. Use specialized models only for image generation (e.g. `openai/dall-e-3`) and embeddings (e.g. `openai/text-embedding-3-small`).

**Required fields:** `kind` (validator-enforced), plus `model` and `prompt` (required at runtime for a working call).

**Incorrect (object kind without schema):**

```swirls
node classify {
  type: ai
  label: "Classify"
  kind: object
  model: "google/gemini-2.5-flash"
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
  model: "google/gemini-2.5-flash"
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
  model: "google/gemini-2.5-flash"
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

**Validator warning** when `kind: text` and `schema:` are both set: `AI node with kind "text" produces a plain string output; remove "schema" or use kind "object" for structured JSON.` Either drop the schema or change `kind` to `object`.

When an AI node is the **leaf of a workflow used as an agent tool**, you do **not** need to add a schema to satisfy the tool's output-schema contract. Any `kind` other than `object` (`text`, `embed`, `image`, `video`) has an inferred output shape and is exempt from that requirement, so a bare `kind: text` leaf is valid. Adding `schema: @json { { "type": "string" } }` to force it would only trip the warning above. See `resource-agent`.

AI node fields:
| Field | Required | Type |
|-------|----------|------|
| `kind` | yes | text, object, image, video, embed. Invalid values error: `Invalid ai kind "<k>". Must be one of: text, object, image, video, embed` |
| `model` | runtime | String (provider/model format) |
| `prompt` | runtime | `@ts` block |
| `provider` | no | Bare identifier: `openrouter` (default), `anthropic`, `openai`, `google`. Invalid values error: `Invalid ai provider "<p>". Must be one of: openrouter, anthropic, openai, google` |
| `schema` | required for object | `@json` block |
| `temperature` | no | Number (0-1) |
| `maxTokens` | no | Number |
| `options` | no | Object (kind-specific, e.g. n, size) |

AI nodes resolve their vendor key from `provider:` (`OPENROUTER_API_KEY` by default; `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` otherwise). You do not need to declare it in `secrets:`.
