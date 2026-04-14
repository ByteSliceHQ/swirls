<p align="center">
  <a href="https://swirls.ai">
    <h1 align="center">SWIRLS_</h1>
  </a>
</p>

<p align="center">
  Deploy agentic AI workflows with a Git-native DSL.
</p>

<p align="center">
  <a href="https://swirls.ai"><strong>Website</strong></a> ·
  <a href="https://swirls.ai/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.gg/dAY9Pn5jYe"><strong>Discord</strong></a>
</p>

Swirls is a compact workflow language for building and deploying agentic automations.
Write `.swirls` files, run locally with zero config, and deploy to the cloud with `swirls deploy` or `git push`.

```swirls
form inbound_lead {
  label: "Inbound Lead"
  schema: @json {
    {
      "type": "object",
      "required": ["name", "email", "notes"],
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" },
        "notes": { "type": "string" }
      }
    }
  }
}

graph score_lead {
  label: "Score Lead"

  root {
    type: code
    label: "Normalize"
    code: @ts {
      const input = context.nodes.root.input
      return {
        name: input.name,
        email: (input.email || "").trim().toLowerCase(),
        notes: input.notes || ""
      }
    }
    outputSchema: @json {
      {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string" },
          "notes": { "type": "string" }
        }
      }
    }
  }

  node classify {
    type: ai
    label: "Classify intent"
    kind: object
    model: "google/gemini-2.5-flash"
    prompt: @ts {
      return "Classify buyer intent from this lead note:\n\n" + context.nodes.root.output.notes
    }
    schema: @json {
      {
        "type": "object",
        "required": ["intent", "priority"],
        "properties": {
          "intent": { "type": "string" },
          "priority": { "type": "string", "enum": ["high", "medium", "low"] }
        }
      }
    }
  }

  flow {
    root -> classify
  }
}

trigger on_inbound_lead {
  form:inbound_lead -> score_lead
  enabled: true
}
```

## What's in this repo

This repo contains the open-source components of Swirls:

| Directory | Description |
|-----------|-------------|
| `skills/swirls-lang` | [Skills.sh](https://skills.sh) skill for writing correct `.swirls` files — used by Claude Code and other LLM agents |

## Core concepts

`.swirls` is a declarative DSL built around:

- **Resources** - Entry points like `form`, `webhook`, and `schedule`
- **Graphs** - DAG workflows composed of typed nodes (`code`, `ai`, `http`, `switch`, `stream`, `wait`, etc.)
- **Triggers** - Bindings like `form:name -> graph_name`

Each graph has exactly one `root {}` node and a `flow {}` block connecting downstream nodes.

## Project structure: one or many files

Swirls is not limited to a single file. Teams commonly organize automations across many `.swirls` files by domain.

```text
automations/
  leads/
    resources.swirls
    scoring.swirls
    notifications.swirls
  support/
    intake.swirls
    triage.swirls
```

Discovery behavior:

- The CLI discovers `.swirls` files recursively from the project root
- `.ts.swirls` files are TypeScript helpers loaded only when referenced via `@ts "./file.ts.swirls"`
- Each `.swirls` file is parsed independently
- If you use `type: graph` subgraph nodes, keep the referenced graph in the same file for `swirls doctor` validation

## Multi-trigger example

A single graph can be triggered from several sources:

```swirls
form manual_entry {
  label: "Manual Entry"
  schema: @json {
    {
      "type": "object",
      "required": ["message"],
      "properties": {
        "message": { "type": "string" }
      }
    }
  }
}

webhook api_entry {
  label: "API Entry"
}

schedule periodic_entry {
  label: "Periodic Entry"
  cron: "0 12 * * *"
}

graph process_message {
  label: "Process Message"

  root {
    type: code
    label: "Normalize input"
    code: @ts {
      const input = context.nodes.root.input
      return {
        message: input.message || "Scheduled run",
        source: context.meta.triggerType
      }
    }
  }

  flow {
  }
}

trigger from_form {
  form:manual_entry -> process_message
  enabled: true
}

trigger from_webhook {
  webhook:api_entry -> process_message
  enabled: true
}

trigger from_schedule {
  schedule:periodic_entry -> process_message
  enabled: true
}
```

## Skills

Skills are used to write correct `.swirls` files.
They are used by Claude Code and other LLM agents.

```bash
bunx skills add https://github.com/ByteSliceHQ/swirls --skill swirls-lang
```

For strict syntax and parser-safe patterns, see `skills/swirls-lang/AGENTS.md`.

## Swirls Cloud

[Swirls Cloud](https://swirls.ai) is the fastest way to get your `.swirls` workflows running with managed execution, observability, secret management, and deployment.

You can also use Cloud for free to visualize your `.swirls` files, even before deploying production automations.

Get started in minutes at [swirls.ai](https://swirls.ai).

## Contributing

We're building in public.
Join the [Discord](https://discord.gg/dAY9Pn5jYe) to shape the roadmap.

- **Add a Skill** — Follow the structure in `skills/`
- **Report issues** — Open an issue on this repo
