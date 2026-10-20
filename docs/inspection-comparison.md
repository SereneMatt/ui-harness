# Comparing inspection with and without UI Harness

This is a proposed measurement protocol, not a recorded benchmark. No token
savings have been measured. The baseline below describes how I would inspect the
example directly without UI Harness.

Confirmed scope: run two fresh sessions on the unchanged example with identical
viewport sizes and layout requirements. Collect the sample before the first
public npm release, without promising token savings. Measure inspection through
the final report, including screenshots and tool results, with startup/setup
costs recorded separately. Use identical model, reasoning, and browser settings.

## Shared task

Inspect the example at 390 × 844, 768 × 1024, 1280 × 900, and 1440 × 900 CSS
pixels. Confirm that all twelve tiles are reachable, tiles remain square, the
grid has respectively 2, 3, 4, and 6 columns, and there is no clipping,
overlap, or unintended horizontal scrolling. Report findings with the affected
dimensions and screenshot evidence. Do not modify the application.

These expectations describe the current example source; they are not verified
browser results. The example has no application JavaScript or interactive
controls, so it cannot establish coverage of forms, navigation, or stateful flows.

## Local preparation

Install the pinned toolchain with `mise trust`, `mise install`, and
`pnpm install --frozen-lockfile` (use `mise exec -- pnpm` when mise is not active).
Complete `pnpm start setup` in an interactive terminal, then run `pnpm example`.
The target application is `https://avatars.localhost/`.

For the harness arm, run `pnpm example:harness` in another terminal and use
`https://harness.avatars.localhost`. The saved example configuration supplies
the four dimensions above. Keep application startup outside both inspection
measurements; record first-run setup costs separately.

## How I would test without UI Harness

1. Open the target application directly using the same browser tool available
   to the harness arm.
2. Set the browser content viewport to 390 × 844 CSS pixels. Confirm the actual
   layout dimensions; resizing the outer window may include browser chrome.
3. Inspect and capture the visible page, then scroll through the entire grid
   to check the remaining rows. Check column count, square tiles, clipping,
   overlap, and horizontal overflow. Use DOM measurements if that browser tool
   supports them, with the same permission in the harness arm.
4. Repeat at 768 × 1024, 1280 × 900, and 1440 × 900. Restore the scroll position
   to the top before each size. Record findings per viewport.
5. Produce a concise report with evidence and coverage gaps. A source-code
   reading alone would not count as visual inspection.

If the chosen tool cannot resize the content viewport, choose another browser
tool for both arms before starting; substituting screenshots from a different
rendering workflow would change the comparison.

## Harness arm

Inspect the same content in the four configured viewports. Begin with the
combined Fit view, scroll each viewport as needed, and inspect at 100% whenever
scaling prevents checking detail. Apply the same completion criteria and
evidence requirements as the direct arm. Count every browser call and screenshot,
including follow-up inspection; do not assume one combined image is sufficient.
Record the outer browser viewport dimensions as well, because they affect Fit
scale and the readability of combined screenshots.

## Token accounting and fairness

Use two fresh sessions with the same model, reasoning setting, browser tool,
task prompt, application revision, and reporting requirements. Give each only
its entry URL and the minimal instructions needed to operate its workflow. Do
not pass one arm's findings to the other. Record tool instructions and startup
context so hidden context differences remain visible.

Measure from the inspection prompt through the final report, including tool
results and screenshot processing. Use provider/session usage counters, not
estimates from text length or browser-call count. Record input tokens, cached
input tokens (a subset of input), output tokens, and any separately reported
reasoning tokens with their accounting semantics. Do not add cached tokens to
input again. If image usage is not separately exposed, say so.

For each arm retain the session identifier, model/settings, revision, timestamps,
usage-counter boundaries, report, browser-call count, screenshot count, and
coverage achieved. Report total input + output and the relative difference
`(direct - harness) / direct × 100%`, provided both counters have the same
semantics. A single pair is a sample, not a general savings claim. Repeated pairs
with alternating order are needed to characterize variability.

The unchanged example is a clean-layout smoke sample, not a labeled defect
benchmark. Record observed findings and manually verify them. Do not claim
missed-issue counts or detection rates without independently established ground
truth; a later defect-seeded fixture can measure detection quality.

## Results

Pending: select the measurement runner, execute both isolated inspections, and
attach usage records. No estimated values should be presented as measured tokens.
