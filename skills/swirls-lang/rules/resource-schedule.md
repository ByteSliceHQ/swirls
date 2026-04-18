---
title: Schedule Declarations
impact: HIGH
tags: resource, schedule, cron, timezone, recurring
---

## Schedule Declarations

Schedules trigger graphs on a cron schedule. The payload is an empty object `{}`.

**Incorrect (missing cron):**

```swirls
schedule daily {
  label: "Daily run"
  timezone: "America/New_York"
}
```

Schedules require a `cron` field.

**Correct (schedule with cron and timezone):**

```swirls
schedule daily {
  label: "Daily run"
  cron: "0 9 * * *"
  timezone: "America/New_York"
  enabled: true
}
```

Schedule fields:
| Field | Required | Type |
|-------|----------|------|
| `label` | yes | String |
| `cron` | yes | Cron expression string |
| `timezone` | no | IANA timezone string |
| `enabled` | no | Boolean (default: true) |

Common cron expressions (standard 5-field form):
- `"0 9 * * *"` - Daily at 9 AM
- `"0 */6 * * *"` - Every 6 hours
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"*/15 * * * *"` - Every 15 minutes

Schedule names must match `^[a-zA-Z0-9_]+$` (letters, digits, underscores). Bind a schedule to a graph via a trigger:

```swirls
trigger daily_trigger {
  schedule:daily -> morning_report
  enabled: true
}
```
