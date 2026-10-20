# Release readiness

Audit of revision `6aa462a` on 2026-10-20. This records evidence and open
decisions; it does not authorize publication.

## Pending before publication

- Resolve the failing Node 26 job in the [latest audited CI run](https://github.com/SereneMatt/ui-harness/actions/runs/39329480082)
  and obtain green CI on the release revision. Node 24 passed; Node 26.12.0
  failed to import `defaultViewports` from compiled `settings.js`. Concurrent
  packing/rebuilding while other tests import `dist` is a hypothesis to
  investigate, not a confirmed cause.
- Verify npm publishing authentication and first-publication setup. The release
  workflow requests OIDC and an `npm` environment; the repository environment
  inventory was empty, and npm trusted-publisher configuration was not verified.
  An absent environment alone does not prove publishing will fail.
- Obtain passing macOS CI results before release. The CI matrix now covers
  Ubuntu and macOS on Node 24 and 26, including HTTPS proxy setup, packed CLI
  launch, and browser preview rendering. The release workflow reuses this
  matrix, so publishing waits for both platforms. macOS execution remains
  unverified until the hosted jobs run.
- Execute and record a reproducible token-usage sample using the
  [inspection comparison](inspection-comparison.md). This is required before
  the first public npm release. Report the measured outcome without promising
  savings; no token measurements currently support a savings claim.
- After release checks and authorization, create the matching version tag
  (`v0.1.0` for the current package version) and dispatch the release workflow
  on that tag. The workflow runs CI, packs, tests the exact tarball, then
  publishes it. Verify installation from the registry afterward.

## Evidence already available

Local `pnpm typecheck` and `pnpm test` passed, including all 11 tests, browser
coverage, and packed CLI coverage, on Node 26.8.2 / pnpm 12.14.0. That local
result does not supersede the failing hosted CI run on Node 26.12.0.

Package metadata, a public scoped package configuration, executable entry point,
build, license/notices, and release workflow are present. At audit time the
registry lookup returned E404 and the repository had no remote tags or releases.
There were no local `.scratch` tickets to provide an existing release checklist.

## Confirmed decisions

The target is the first public npm release of `@serenematt/ui-harness`. A
reproducible token-usage sample is required before release as evidence, without
a promise of token savings.

The first sample uses two fresh sessions on the unchanged example, checking
the same four viewport sizes and layout requirements. It is an illustrative
token comparison, not a measurement of missed bugs.

Measure from the inspection prompt through the final report, including
screenshots and tool results. Record startup/setup costs separately. Use the
same model, reasoning settings, and browser tools for both sessions.

Keep macOS support and require macOS verification before release, covering
first-run setup, workspace launch, and preview rendering.

## Open interview decisions

The sample scope and measurement boundary are confirmed. No further product
decisions are pending for the illustrative comparison; runner selection and
usage-record collection remain execution tasks.
