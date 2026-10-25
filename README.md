# UI harness

Inspect a development website in interactive desktop, tablet, and mobile viewports
side by side. The goal is to reduce repeated resizing, screenshots, and browser
calls during responsive UI inspection. Agents use their existing browser tools;
no agent skill installation is required.

Supports macOS and Linux with Node.js 24 or newer. Provides a named HTTPS workspace URL; custom proxy ports appear in the URL.

## Run

Complete first-run setup below once. Start your application's development server,
then run from its project directory:

```sh
pnpx @serenematt/ui-harness https://your-app
```

For an agent-controlled browser or a headless terminal:

```sh
pnpx @serenematt/ui-harness https://your-app --no-open
```

Open the HTTPS workspace URL printed by the CLI, for example
`https://harness.my-app-a1b2c3d4.localhost`. The default name stays stable for the
same settings-file path and distinguishes projects with the same folder name.
To choose a shorter name, pass `--name harness.myapp`; its URL will be
`https://harness.myapp.localhost`. The target application remains a separate process.
Stop the harness with Ctrl+C when inspection is complete.

Select sizes from the included Chromium DevTools catalog or add custom dimensions.
**Display scale → 100%** shows a preview at its actual size; **Fit** changes its
appearance without changing its layout dimensions. Inspect an individual preview
at 100% when a combined view hides details. Scroll and navigate each preview
independently; **Reset all** returns every preview to the target URL.

**Save settings** writes the URL, viewports, and scale to `ui-harness.config.json`
in the current directory. Use `--config PATH`
to choose another settings file. See the [workspace reference](docs/reference.md)
for configuration limits and browser behavior. Viewports change layout dimensions;
they do not emulate mobile hardware or switch browser engines.

## First-run setup

Run setup explicitly before the first workspace launch. Setup starts and may ask for administrator authentication to bind the standard HTTPS port and
trust the local certificate authority. For an unattended agent, complete this
once in an interactive terminal first:

```sh
pnpx @serenematt/ui-harness setup
```

Workspace launches reuse the proxy and do not run administrator setup. If the
proxy stops, launch exits with a setup command.
Setup must succeed before the workspace starts. There is no automatic fallback.
If port 443 is busy, run `pnpx @serenematt/ui-harness setup --proxy-port 8443`
once. Setup remembers that port; later workspace launches need no extra flag.

If Safari cannot resolve the workspace hostname, keep the workspace running and
run `pnpx @serenematt/ui-harness hosts sync` in another terminal. This may ask for
administrator authentication. It reuses the saved proxy port. See the
[workspace reference](docs/reference.md#workspace-url).

The harness chooses its internal listener automatically. Ctrl+C stops the workspace and removes its route while
leaving the shared proxy available for other projects.

## Blank previews and HTTPS

If a preview is blank, use **Preview blank or blocked? → Open project directly**
and check that the target server is running. A target that forbids framing needs
its development-only `Content-Security-Policy: frame-ancestors` and any conflicting
`X-Frame-Options` adjusted to allow the printed workspace origin.

## Agent workflow

Use one persistent browser session. Open the workspace, inspect the combined Fit
view, and check individual previews at 100% when details are too small. Recheck
affected viewports after changes. The harness organizes responsive inspection;
it does not replace browser verification.

## Origin and license

MIT licensed; the Chromium-derived catalog retains its
upstream notice in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
