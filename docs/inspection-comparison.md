# Inspection comparison

This measures the README claim that the harness lets an agent inspect a site at
several viewports with fewer screenshots, browser calls, and resizes. It also
measures which framing policies render in each harness mode.

## Task

Look at `bench/fixture/index.html` at the four default harness viewports
(390×664, 768×1024, 1280×720, 1440×900). The fixture is a static page with no
scripts, web fonts, images, or network requests. Its grid has 4, 3, 2, or 1
columns depending on width, and its navigation collapses below 600px.

## Method

`bench/inspect.js` serves the fixture on `127.0.0.1`, starts one headless
Chromium, and runs every mode once per run in a fresh browser context. The mode
order rotates each run. There is no warm-up; every run is reported.

| Mode | What it does |
| --- | --- |
| `baseline` | One page. For each viewport: `setViewportSize`, `goto` (wait for `load`), viewport screenshot. |
| `harness-window` | Harness through `startHarness()` on plain HTTP (the server the CLI runs). One `goto`, wait for each iframe's content, one 1440×900 window screenshot. |
| `harness-previews` | Same, but one element screenshot of the previews strip only. |
| `harness-cards-100` | Same load, then **Display scale → 100%** and one element screenshot per preview card (the README's "check individual previews at 100%"). |
| `same-origin-window` | Same as `harness-window`, with `sameOrigin: true` (previews load through the harness origin). |
| `portless-window` | Same as `harness-window`, but through the real CLI (`dist/cli.js --no-open`) behind the Portless HTTPS proxy on port 8443. |

- Browser calls: every Playwright call an agent would issue, counted by the script
  (`newPage`, `setViewportSize`, `goto`, frame waits, `selectOption`, `screenshot`).
  The harness modes include one wait per iframe (4).
- Wall-clock: from creating the browser context to the last screenshot written.
  Browser launch and harness startup are measured separately.
- Pixels and bytes: from the PNG files written. Device scale factor 1.
- Anthropic estimate: `tokens = w*h/750`. "After resize" first scales the image so
  its long edge is at most 1568 px and its cost is at most about 1600 tokens.
- OpenAI estimate (high detail, GPT-4o style): fit in 2048×2048, scale the short
  side down to 768, then `85 + 170 * ceil(w/512) * ceil(h/512)`.
- Values are summed over all screenshots in a run. Nothing is rounded.
- Framing matrix: the fixture is also served with each framing header below. For
  each harness mode, the script counts the previews whose frame contains the
  fixture after load.

## Environment

- OS: Debian GNU/Linux 13 (trixie), kernel 6.12.94+, x86_64, 8 vCPU (Intel Xeon), 15 GiB RAM
- Node v24.22.2, pnpm 12.14.0, Playwright 1.64.0
- Browser: Playwright Chromium headless shell 156.0.8078.4
- Window for harness modes: 1440×900
- Run: 2026-10-29 09:24 CET

## Results

| mode | run | browserCalls | screenshots | resizes | pixels | bytes | anthropicTokensRaw | anthropicTokensAfterResize | openaiTokens | wallMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 1 | 13 | 4 | 4 | 3262992 | 203811 | 4350.656 | 4222.656 | 3400 | 240.584206 |
| baseline | 2 | 13 | 4 | 4 | 3262992 | 203811 | 4350.656 | 4222.656 | 3400 | 193.78264299999955 |
| baseline | 3 | 13 | 4 | 4 | 3262992 | 203811 | 4350.656 | 4222.656 | 3400 | 226.74897799999962 |
| baseline | 4 | 13 | 4 | 4 | 3262992 | 203811 | 4350.656 | 4222.656 | 3400 | 225.84745099999964 |
| baseline | 5 | 13 | 4 | 4 | 3262992 | 203811 | 4350.656 | 4222.656 | 3400 | 235.96375699999953 |
| **baseline** | **avg** | 13 | 4 | 4 | 3262992 | 203811 | 4350.656 | 4222.656 | 3400 | 224.58540699999966 |
| harness-window | 1 | 7 | 1 | 0 | 1296000 | 146774 | 1728 | 1600 | 1105 | 341.9230070000001 |
| harness-window | 2 | 7 | 1 | 0 | 1296000 | 146768 | 1728 | 1600 | 1105 | 222.0054329999998 |
| harness-window | 3 | 7 | 1 | 0 | 1296000 | 146730 | 1728 | 1600 | 1105 | 224.86326100000042 |
| harness-window | 4 | 7 | 1 | 0 | 1296000 | 146732 | 1728 | 1600 | 1105 | 231.81861000000026 |
| harness-window | 5 | 7 | 1 | 0 | 1296000 | 146732 | 1728 | 1600 | 1105 | 244.17977500000052 |
| **harness-window** | **avg** | 7 | 1 | 0 | 1296000 | 146747.2 | 1728 | 1600 | 1105 | 252.95801720000023 |
| harness-previews | 1 | 7 | 1 | 0 | 603542 | 75411 | 804.7226666666667 | 804.7226666666667 | 1105 | 300.5677719999999 |
| harness-previews | 2 | 7 | 1 | 0 | 603542 | 75412 | 804.7226666666667 | 804.7226666666667 | 1105 | 268.0921010000002 |
| harness-previews | 3 | 7 | 1 | 0 | 603542 | 75412 | 804.7226666666667 | 804.7226666666667 | 1105 | 258.15068600000086 |
| harness-previews | 4 | 7 | 1 | 0 | 603542 | 75411 | 804.7226666666667 | 804.7226666666667 | 1105 | 266.27768899999955 |
| harness-previews | 5 | 7 | 1 | 0 | 603542 | 75412 | 804.7226666666667 | 804.7226666666667 | 1105 | 254.23493899999994 |
| **harness-previews** | **avg** | 7 | 1 | 0 | 603542 | 75411.6 | 804.7226666666667 | 804.7226666666667 | 1105 | 269.4646374000001 |
| harness-cards-100 | 1 | 11 | 4 | 0 | 3494996 | 206512 | 4659.9946666666665 | 4418.08 | 3740 | 587.9524789999998 |
| harness-cards-100 | 2 | 11 | 4 | 0 | 3494996 | 206512 | 4659.9946666666665 | 4418.08 | 3740 | 588.7110549999998 |
| harness-cards-100 | 3 | 11 | 4 | 0 | 3494996 | 206512 | 4659.9946666666665 | 4418.08 | 3740 | 591.0586520000006 |
| harness-cards-100 | 4 | 11 | 4 | 0 | 3494996 | 206512 | 4659.9946666666665 | 4418.08 | 3740 | 553.491857 |
| harness-cards-100 | 5 | 11 | 4 | 0 | 3494996 | 206512 | 4659.9946666666665 | 4418.08 | 3740 | 572.3156789999994 |
| **harness-cards-100** | **avg** | 11 | 4 | 0 | 3494996 | 206512 | 4659.9946666666665 | 4418.08 | 3740 | 578.7059443999999 |
| same-origin-window | 1 | 7 | 1 | 0 | 1296000 | 146727 | 1728 | 1600 | 1105 | 228.0688869999999 |
| same-origin-window | 2 | 7 | 1 | 0 | 1296000 | 146727 | 1728 | 1600 | 1105 | 241.15886499999988 |
| same-origin-window | 3 | 7 | 1 | 0 | 1296000 | 146771 | 1728 | 1600 | 1105 | 238.72306500000013 |
| same-origin-window | 4 | 7 | 1 | 0 | 1296000 | 146727 | 1728 | 1600 | 1105 | 214.728787 |
| same-origin-window | 5 | 7 | 1 | 0 | 1296000 | 146728 | 1728 | 1600 | 1105 | 212.59926599999926 |
| **same-origin-window** | **avg** | 7 | 1 | 0 | 1296000 | 146736 | 1728 | 1600 | 1105 | 227.05577399999984 |
| portless-window | 1 | 7 | 1 | 0 | 1296000 | 146732 | 1728 | 1600 | 1105 | 259.4247270000001 |
| portless-window | 2 | 7 | 1 | 0 | 1296000 | 146732 | 1728 | 1600 | 1105 | 232.31333700000005 |
| portless-window | 3 | 7 | 1 | 0 | 1296000 | 146732 | 1728 | 1600 | 1105 | 232.59456500000033 |
| portless-window | 4 | 7 | 1 | 0 | 1296000 | 146728 | 1728 | 1600 | 1105 | 227.99728099999993 |
| portless-window | 5 | 7 | 1 | 0 | 1296000 | 146728 | 1728 | 1600 | 1105 | 232.45263200000045 |
| **portless-window** | **avg** | 7 | 1 | 0 | 1296000 | 146730.4 | 1728 | 1600 | 1105 | 236.95650840000016 |

Startup and one-time costs from the same run:

- Browser launch: 83.04941000000002 ms (shared by all modes)
- Harness startup, `startHarness()` in-process: 3.6669769999999744 ms
- Harness startup, CLI through Portless (spawn until the URL is printed; the CLI
  prints it only once Portless routes it): 320.401562 ms
- One-time `ui-harness setup --proxy-port 8443`: 1.484 s real (shell `time`, separate
  run). It started the proxy and installed a CA with `sudo` into
  `/usr/local/share/ca-certificates`. Passwordless sudo was available on this machine.

Preview scale in the 1440×900 window (`harness-window`, run 1):

| Preview | Display scale | 16px text renders at | Fully in window |
| --- | --- | --- | --- |
| 390×664 | 0.7 | 11.2 px | yes |
| 768×1024 | 0.355469 | 5.687504 px | yes |
| 1280×720 | 0.213281 | 3.412496 px | yes |
| 1440×900 | 0.189583 | 3.033328 px | yes |

## Framing

Previews (of 4) that rendered the fixture, same run:

| framing policy | cross-origin (default) | same-origin | same-origin + allow-framing | Portless cross-origin (default) | Portless same-origin | Portless same-origin + allow-framing |
| --- | --- | --- | --- | --- | --- | --- |
| none (no header) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 |
| X-Frame-Options: SAMEORIGIN | 0/4 | 4/4 | 4/4 | 0/4 | 4/4 | 4/4 |
| CSP frame-ancestors 'self' | 0/4 | 4/4 | 4/4 | 0/4 | 4/4 | 4/4 |
| X-Frame-Options: DENY | 0/4 | 0/4 | 4/4 | 0/4 | 0/4 | 4/4 |
| CSP frame-ancestors 'none' | 0/4 | 0/4 | 4/4 | 0/4 | 0/4 | 4/4 |


- Default (cross-origin) previews only render pages with no framing header.
- `--same-origin` fixes `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`.
  `DENY` and `'none'` block same-origin framing too, as the specs require.
- `--allow-framing` (with `--same-origin`) rewrites those headers to `SAMEORIGIN`
  and `frame-ancestors 'self'` on proxied responses, so all five cases render.
- Results are the same with plain HTTP and behind Portless HTTPS.

Manual checks (scripts not in the repo, run once on this machine):

- Vite 8.3.5 dev server at `http://127.0.0.1:5173`, harness with `--same-origin`,
  both in-process and through Portless: the HMR WebSocket connected through the
  harness origin (`ws://127.0.0.1:<harness>/` and `wss://harness.….localhost:8443/`),
  and editing `main.js` updated 4 of 4 previews. Cross-origin mode also updated 4 of 4.
- HTTPS Portless target (`https://benchtarget.localhost:8443`, `X-Frame-Options:
  SAMEORIGIN`, a `Domain=` cookie): cross-origin rendered 0 of 4, `--same-origin`
  rendered 4 of 4 and stored the cookie as host-only on the harness host.

## Findings

- Counts: one harness screenshot replaces four. Calls drop from 13 to 7, resizes
  from 4 to 0, and pixels from 3262992 to 1296000 (window) or 603542 (strip only).
  Estimated image tokens drop from 4222.656 to 1600 or 804.7226666666667
  (Anthropic, after resize) and from 3400 to 1105 (OpenAI).
- Wall-clock is about the same: average 224.58540699999966 ms for baseline against
  252.95801720000023 ms for `harness-window` and 227.05577399999984 ms for
  `same-origin-window`. This fixture is tiny and local.
- Readability: at Fit, the 1280 and 1440 previews render body text at about 3 px.
  Column counts and navigation state are visible; text and small spacing problems
  are not. The 390 preview is readable.
- Readable follow-up costs more than the baseline. `harness-cards-100` takes 11 calls,
  4 screenshots, 3494996 pixels, 4418.08 Anthropic tokens, 3740 OpenAI tokens, and
  578.7059443999999 ms on average. In a 1440×900 window the 1280 and 1440 cards
  (1282 and 1442 px wide) are wider than the 1154 px previews strip, so their
  100% screenshots are cropped: part of each preview is missing and the sidebar
  shows in the shot. A wider window, or horizontal scrolling and more shots, is needed.

## Caveats

- Setup: the README path needs Portless and a trusted local CA. Here it worked
  because sudo needed no password. Playwright's Chromium does not read the system
  CA bundle, so Portless modes use `ignoreHTTPSErrors`.
- Same-origin mode shares one origin between the workspace and the target, so the
  target's scripts can read the workspace page, including its save token. Use it
  only with targets you trust. Absolute target URLs inside HTML or JavaScript are
  not rewritten; those requests and links leave the proxy.
- The harness hosts every preview in one browser. It does not emulate touch, device
  pixel ratio, or mobile browser chrome; neither does the baseline as written.
- Baseline does 4 resizes; 3 would do if the page already started at one of the sizes.
- Counts are Playwright calls. An agent's tool calls may batch differently.
- Bytes vary by a few dozen between runs (PNG output of the scaled iframes).
- One fixture, one machine, 5 runs. Real apps with scripts, fonts, and network
  will change the times.

## Reproduce

```sh
pnpm install
pnpm exec playwright install chromium
pnpm bench:inspect                     # baseline, harness, and same-origin modes, 5 runs
# Optional Portless modes (needs a one-time setup, may prompt for sudo):
PORTLESS_STATE_DIR=/tmp/uih-portless node dist/cli.js setup --proxy-port 8443
PORTLESS_STATE_DIR=/tmp/uih-portless pnpm bench:inspect --runs 5 --portless
```

Options: `--runs N`, `--window WxH`, `--out DIR`. Screenshots and `results.json`
(every call, shot, preview measurement, and framing result) go to `bench/out/`
(git-ignored).
