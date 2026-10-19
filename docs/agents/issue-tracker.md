# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Triage state is recorded as a `Status:` line near the top of each issue file. Use the role strings in `docs/agents/triage-labels.md`.
- Append comments and conversation history under a `## Comments` heading at the bottom of the file.

## When a skill says "publish to the issue tracker"

Create a spec or individual issue file at the corresponding path above, creating directories as needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. Resolve an issue number within its feature directory; if multiple features match, ask which feature is intended.

## Wayfinding operations

Used by `/wayfinder`. The map is a file with one child file per ticket.

- **Map**: `.scratch/<effort>/map.md`, containing Notes / Decisions-so-far / Fog.
- **Child ticket**: `.scratch/<effort>/issues/<NN>-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records `research`, `prototype`, `grilling`, or `task`. For this workflow, `Status:` records `open`, `claimed`, or `resolved` rather than a triage role.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every listed ticket is `resolved`.
- **Frontier**: scan the effort's issues for open, unblocked, unclaimed tickets; first by number wins.
- **Claim**: set `Status: claimed` and save before starting work.
- **Resolve**: append the answer under `## Answer`, set `Status: resolved`, then append a gist and relative link to the map's Decisions-so-far.
