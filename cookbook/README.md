# The Swirls Cookbook

Copy-paste recipes for real workflows. Each `.swirls` file is a complete, runnable workflow you can drop into your project, tweak to taste, and deploy.

Browse by what you're trying to do, not what technology you need.

---

## Table of Contents

- [Sales & Marketing](#sales--marketing)
- [Customer Support](#customer-support)
- [Content & Media](#content--media)
- [HR & Operations](#hr--operations)
- [Finance & Legal](#finance--legal)
- [DevOps](#devops)
- [Patterns](#patterns)
- [Running the Cookbook](#running-the-cookbook)

---

## Sales & Marketing

Recipes for lead management, competitive analysis, content planning, and outbound communications.

| Recipe | What it does | Nodes used |
|--------|-------------|------------|
| [lead-scoring](sales-and-marketing/lead-scoring.swirls) | Scores incoming leads, persists results, and alerts sales on hot ones | ai, switch, email |
| [competitive-intel-monitor](sales-and-marketing/competitive-intel-monitor.swirls) | Scrapes competitor sites weekly and emails a summary of changes | scrape, ai, email |
| [newsletter-generator](sales-and-marketing/newsletter-generator.swirls) | Scrapes your blog and industry news, composes a weekly newsletter with human review | scrape, ai, email |
| [seo-audit](sales-and-marketing/seo-audit.swirls) | Scrapes a page and produces an SEO audit with scores, issues, and fixes | scrape, ai |
| [content-calendar-generator](sales-and-marketing/content-calendar-generator.swirls) | Generates a month of content ideas from themes and goals | ai |
| [social-media-post-generator](sales-and-marketing/social-media-post-generator.swirls) | Creates platform-specific social posts from a topic and key points | ai |
| [sales-call-summarizer](sales-and-marketing/sales-call-summarizer.swirls) | Summarizes sales call transcripts and extracts deal signals | ai |
| [price-monitor](sales-and-marketing/price-monitor.swirls) | Monitors competitor pricing pages and alerts on changes | scrape, ai, stream, switch, email |

---

## Customer Support

Recipes for ticket routing, satisfaction scoring, feedback processing, and automated responses.

| Recipe | What it does | Nodes used |
|--------|-------------|------------|
| [support-ticket-router](customer-support/support-ticket-router.swirls) | Routes tickets by urgency and department, sends Slack alerts for critical ones | ai, switch, http |
| [bug-report-triage](customer-support/bug-report-triage.swirls) | Classifies bug severity, assigns priority, notifies the right Slack channel, and emails the reporter | ai, switch, http, email |
| [contact-form-autoresponder](customer-support/contact-form-autoresponder.swirls) | Classifies contact form inquiries and sends a tailored autoresponse | ai, email |
| [csat-scorer](customer-support/csat-scorer.swirls) | Scores customer satisfaction from support interactions and triggers follow-ups for unhappy customers | ai, switch, email |
| [feedback-survey-processor](customer-support/feedback-survey-processor.swirls) | Processes NPS surveys, routes detractors for follow-up, and persists all scores | ai, switch, email |
| [review-sentiment-analysis](customer-support/review-sentiment-analysis.swirls) | Analyzes product review sentiment and persists results for dashboards | ai |

---

## Content & Media

Recipes for content creation, translation, moderation, and distribution.

| Recipe | What it does | Nodes used |
|--------|-------------|------------|
| [blog-post-moderation](content-and-media/blog-post-moderation.swirls) | AI checks blog submissions for policy violations, then routes to human review or auto-publish | ai, switch, email |
| [meeting-notes-summarizer](content-and-media/meeting-notes-summarizer.swirls) | Turns raw meeting notes into structured summaries with action items | ai |
| [content-translator](content-and-media/content-translator.swirls) | Translates content into multiple languages with tone preservation | ai |
| [kb-article-generator](content-and-media/kb-article-generator.swirls) | Generates knowledge base articles from support ticket patterns, scrapes existing docs to find gaps | ai |
| [recipe-generator](content-and-media/recipe-generator.swirls) | Generates recipes from available ingredients and dietary preferences | ai |
| [changelog-announcer](content-and-media/changelog-announcer.swirls) | Takes a changelog entry and generates announcements for email, Slack, and social | ai, http, email |
| [daily-news-digest](content-and-media/daily-news-digest.swirls) | Fetches top Hacker News stories daily, summarizes with AI, and emails a digest | http, map, ai, email |
| [ai-embeddings](content-and-media/ai-embeddings.swirls) | Generates text embeddings for semantic search | ai (embed) |
| [image-generation](content-and-media/image-generation.swirls) | Generates product images from text descriptions with prompt refinement | ai (image) |

---

## HR & Operations

Recipes for hiring, onboarding, expense management, and event coordination.

| Recipe | What it does | Nodes used |
|--------|-------------|------------|
| [job-application-screener](hr-and-operations/job-application-screener.swirls) | AI evaluates job applications for fit, routes top candidates to human review, and sends rejections | ai, switch, email |
| [expense-report-processor](hr-and-operations/expense-report-processor.swirls) | Validates expense amounts against policy, routes high-value expenses for manager approval | switch, email |
| [onboarding-email-sequence](hr-and-operations/onboarding-email-sequence.swirls) | Sends personalized onboarding emails tailored to plan and use case | ai, email |
| [employee-feedback-analyzer](hr-and-operations/employee-feedback-analyzer.swirls) | Analyzes anonymous employee feedback for themes and action items, persists for trend tracking | ai |
| [event-registration](hr-and-operations/event-registration.swirls) | Handles registrations with confirmation emails and waitlist overflow | switch, stream, email |

---

## Finance & Legal

Recipes for document review, invoice processing, and approval workflows.

| Recipe | What it does | Nodes used |
|--------|-------------|------------|
| [contract-reviewer](finance-and-legal/contract-reviewer.swirls) | Reviews contracts for risks and key terms, flags critical clauses for human legal review | ai, switch |
| [invoice-processor](finance-and-legal/invoice-processor.swirls) | Extracts line items and totals from invoices, flags anomalies, and stores results | ai, switch |
| [document-approval-workflow](finance-and-legal/document-approval-workflow.swirls) | Multi-stage document approval with human review gates and revision requests | ai, switch, email |

---

## DevOps

Recipes for monitoring, alerting, webhooks, and infrastructure integration patterns.

| Recipe | What it does | Nodes used |
|--------|-------------|------------|
| [website-uptime-monitor](devops/website-uptime-monitor.swirls) | Pings a URL every 15 minutes, emails an alert when it goes down | http, switch, email |
| [inventory-alert](devops/inventory-alert.swirls) | Checks inventory levels via API, emails when stock hits reorder point | http, switch, email |
| [pr-review-notifier](devops/pr-review-notifier.swirls) | Receives GitHub PR webhooks, summarizes changes with AI, and posts to Slack | ai, http, switch |
| [webhook-to-slack](devops/webhook-to-slack.swirls) | Forwards any webhook event to Slack with formatted messages | http |
| [data-quality-checker](devops/data-quality-checker.swirls) | Validates incoming data records against quality rules and quarantines bad data | switch |
| [api-key-auth-example](devops/api-key-auth-example.swirls) | Demonstrates auth blocks with API key authentication (OpenWeatherMap) | http, auth |
| [oauth-github-integration](devops/oauth-github-integration.swirls) | Demonstrates OAuth auth blocks with GitHub client credentials | http, auth |
| [postgres-crm-pipeline](devops/postgres-crm-pipeline.swirls) | Reads leads from Postgres, scores with AI, writes results back | postgres, ai |
| [bucket-file-processor](devops/bucket-file-processor.swirls) | Downloads a file from a bucket, processes it, and uploads the result | bucket |

---

## Patterns

These aren't use-case recipes -- they demonstrate specific Swirls language features you can mix into your own workflows.

| Pattern | What it demonstrates |
|---------|---------------------|
| [parallel-branches](patterns/parallel-branches.swirls) | Fan-out: root splits into multiple independent nodes that run concurrently |
| [multi-trigger-workflow](patterns/multi-trigger-workflow.swirls) | One workflow, three trigger sources (form, webhook, schedule) |
| [subgraph-data-enrichment](patterns/subgraph-data-enrichment.swirls) | Subworkflows: calling one workflow from another with a workflow node |
| [wait-node-delayed-followup](patterns/wait-node-delayed-followup.swirls) | Wait node: sends email immediately, then waits 3 days before a follow-up |
| [stream-reporting-dashboard](patterns/stream-reporting-dashboard.swirls) | Persistence and stream queries: one workflow logs events, another queries and reports |
| [external-ts-file-pattern](patterns/external-ts-file-pattern.swirls) | Referencing an external .ts.swirls file from a code node with @ts "path" |

---

## Running the Cookbook

Every recipe is a standalone `.swirls` file. Drop it into any Swirls project and run it.

### Quick start

```bash
# Clone and enter the cookbook
cd cookbook

# Validate everything parses correctly
swirls doctor

# Run a single workflow with test input
swirls workflow execute score_lead --input '{"company": "Acme", "email": "j@acme.co", "source": "demo"}'
```

The `.swirls` language skill for coding agents installs directly from the site:

```bash
npx skills add https://swirls.ai
```

### Environment variables

Most recipes work out of the box. Some require API keys:

| Variable | Required by | What it does |
|----------|------------|--------------|
| `OPENROUTER_API_KEY` | All `ai` nodes | Routes LLM calls through OpenRouter |
| `RESEND_API_KEY` | All `email` nodes | Sends transactional emails via Resend |
| `FIRECRAWL_API_KEY` | All `scrape` nodes | Web scraping via Firecrawl |
| `WEATHER_API_KEY` | api-key-auth-example | OpenWeatherMap API key |
| `GITHUB_CLIENT_ID` | oauth-github-integration | GitHub OAuth app credentials |
| `GITHUB_CLIENT_SECRET` | oauth-github-integration | GitHub OAuth app credentials |
| `DATABASE_URL` | postgres-crm-pipeline | PostgreSQL connection string |
| `SLACK_WEBHOOK_URL` | Slack notification recipes | Slack incoming webhook URL |
| `MONITOR_URL` | website-uptime-monitor | URL to ping |
| `INVENTORY_API_URL` / `INVENTORY_API_KEY` | inventory-alert | Inventory API endpoint and key |

Set them with the Swirls CLI:

```bash
swirls secret set OPENROUTER_API_KEY=sk-or-...
swirls secret set RESEND_API_KEY=re_...
swirls secret set FIRECRAWL_API_KEY=fc-...
```

### Node type cheat sheet

| Node type | What it does |
|-----------|-------------|
| `code` | Run TypeScript logic in a sandboxed @ts block |
| `ai` | Call an LLM (text, object, embed, image, or video) |
| `http` | Make HTTP requests to external APIs |
| `email` | Send transactional email (via Resend) |
| `scrape` | Scrape and extract web page content (via Firecrawl) |
| `switch` | Route execution down different paths based on conditions |
| `postgres` | Run parameterized SQL against a database you operate |
| `bucket` | Download or upload files to cloud storage |
| `stream` | Read persisted stream data with filters |
| `workflow` | Call another workflow one-shot |
| `wait` | Pause execution for a duration before continuing |

The full language has 18 node types — the rest (`agent`, `database`, `disk`, `integration`, `map`, `parallel`, `while`) are covered by the [swirls-lang skill](https://swirls.ai/.well-known/agent-skills/swirls-lang/SKILL.md).
