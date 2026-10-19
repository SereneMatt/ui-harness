# Triage Labels

For local Markdown issues, record the corresponding role string in the issue's `Status:` line.

| Canonical role | Local status | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an unattended agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill mentions a triage role, use the corresponding local status from this table. Edit the Local status column to change the vocabulary.

Wayfinding tickets use the lifecycle statuses defined in `docs/agents/issue-tracker.md`.
