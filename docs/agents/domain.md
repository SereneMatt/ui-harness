# Domain Docs

This repo uses a single-context layout: `GLOSSARY.md` at the root and architecture decision records (ADRs) under `docs/adr/`.

## Before exploring

- Read `GLOSSARY.md` for established domain terms.
- Read ADRs under `docs/adr/` that touch the area being explored.

If these files or directories do not exist, proceed silently. The `/domain-modeling` skill creates domain documentation lazily as terms or decisions are resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test, use the glossary's term and respect its guidance on synonyms.

If a needed concept is missing, reconsider whether it belongs to the project's domain; note genuine gaps for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain why its decision should be reconsidered.
