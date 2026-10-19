# UI harness

Inspect a development website in interactive desktop, tablet, and mobile viewports
side by side. The goal is to reduce repeated resizing, screenshots, and browser
calls during responsive UI inspection. Agents use their existing browser tools;
no agent skill installation is required.

Supports macOS and Linux with Node.js 24 or newer. Provides an HTTPS workspace URL without a port number.

## Run

Start your application's development server, then run from its project directory:

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

The harness starts or reuses the Portless HTTPS proxy automatically. The first
run may ask for administrator authentication to bind the standard HTTPS port and
trust the local certificate authority. For an unattended agent, complete this
once in an interactive terminal first:

```sh
pnpx @serenematt/ui-harness setup
```

Setup must succeed before the workspace starts. There is no direct-port fallback.
The harness chooses its internal listener automatically. Ctrl+C stops the workspace and removes its route while
leaving the shared proxy available for other projects.

## Blank previews and HTTPS

If a preview is blank, use **Preview blank or blocked? → Open project directly**
and check that the target server is running. A target that forbids framing needs
its development-only `Content-Security-Policy: frame-ancestors` and any conflicting
`X-Frame-Options` adjusted to allow the printed workspace origin.

See [Portless HTTPS setup](https://portless.sh/https) for certificate troubleshooting.

## Animal avatar example

The example lives in this repository and is excluded from the npm package.

For local development, use [mise](https://mise.jdx.dev/) to install the pnpm
version pinned in `mise.toml` (matching `package.json`):

```sh
mise trust
mise install
pnpm install --frozen-lockfile
```

With mise activated in your shell, entering this repository selects its pnpm
version automatically. In a shell without activation, use `mise exec -- pnpm`.

Complete `pnpm start setup` once. Then start the example:

```sh
pnpm example
```

In a second terminal:

```sh
pnpm example:harness
```

Open `https://harness.avatars.localhost`. The included workspace compares 390,
768, 1280, and 1440px widths: the same twelve animal avatars arrange into 2, 3,
4, and 6 columns respectively. Each colored avatar tile stays square.

The example itself is [one HTML file](examples/avatars/index.html) with inline
CSS and no browser JavaScript. You can also open it directly and resize the
window. Its tiny TypeScript server is compiled locally by `tsc-ts` when you run `pnpm example`.

## Measuring agent token usage

| Metric                                | Direct inspection | Harness inspection |
| ------------------------------------- | ----------------- | ------------------ |
| Input tokens                          | Not measured      | Not measured       |
| Output tokens                         | Not measured      | Not measured       |
| Cached input tokens (subset of input) | Not measured      | Not measured       |
| Browser tool calls                    | Not measured      | Not measured       |
| Screenshots                           | Not measured      | Not measured       |
| Correctly identified UI issues        | Not measured      | Not measured       |
| Missed UI issues                      | Not measured      | Not measured       |
| False positives                       | Not measured      | Not measured       |

## Origin and license

MIT licensed; the Chromium-derived catalog retains its
upstream notice in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
