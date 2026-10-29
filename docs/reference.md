# Workspace reference

## Configuration

```json
{
  "version": 1,
  "url": "https://your-app/",
  "viewports": [
    { "width": 390, "height": 664 },
    { "width": 768, "height": 1024 },
    { "width": 1280, "height": 720 },
    { "width": 1440, "height": 900 }
  ],
  "scale": "fit"
}
```

| Field             | Accepted values                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `version`         | `1`                                                                                        |
| `url`             | HTTP or HTTPS URL without embedded credentials; HTTP is assumed when the scheme is omitted |
| `viewports`       | 1–128 unique width and height pairs, in CSS pixels                                         |
| `width`, `height` | Integers from 1 through 10000                                                              |
| `scale`           | `"fit"` or a number from `0.1` through `1`                                                 |

A CLI URL overrides the saved URL for the current session. **Save settings**
persists that override. Removing a preview discards its page state. Adding another
size or changing scale preserves the remaining previews.

## Catalog and browser coverage

The package includes 74 unique dimensions from the Chromium DevTools revision
recorded in `data/chromium-viewports.json`. The four starting dimensions are a
chosen selection, not a web standard. Sizes outside the Chromium catalog carry a
**STARTER** or **CUSTOM** label.

The browser hosting the workspace renders every preview. Selecting a size does
not switch browser engines, emulate touch input, change device pixel ratio, apply
foldable hinges, or simulate mobile browser controls. Iframes for the same target
origin share browser storage; they are not separate login sessions.

Cross-origin previews support native interaction, but the harness cannot inspect
their current routes or document contents. **Reset all** navigates them to the
shared project URL. Embedding policies, authentication policies, and browser
permissions can affect framed pages.

## Workspace URL

First-run setup
may require administrator authentication; `ui-harness setup` prepares the proxy
and certificate trust for unattended use. Workspace launch requires the proxy
already running and never invokes setup. For a busy 443, use
`ui-harness setup --proxy-port 8443` once. Setup saves the selected port in
`~/.portless/ui-harness.port`; later launches and `hosts sync` reuse it.
With `PORTLESS_STATE_DIR`, the saved choice stays inside that directory.
The selection order is `--proxy-port`, `PORTLESS_PORT`, the saved setup port,
then 443. Successful setup replaces the saved choice; a launch override does
not change it. A stopped proxy produces a setup command for the saved port.

Linux setup installs each proxy CA under a distinct fingerprint, preserving trust
for proxies on other ports and for the target application.

Hosts synchronization is enabled by default; `PORTLESS_SYNC_HOSTS=0` opts out.
Safari uses the system DNS resolver, which may not resolve `.localhost` names.
If the workspace hostname does not resolve, keep the workspace running and run
`ui-harness hosts sync` in another terminal. This explicit command may request
administrator authentication to update `/etc/hosts`, particularly when the proxy runs on an unprivileged port. Ordinary
workspace launches never request administrator authentication.

The default workspace name is derived from the settings-file path. Use
`--name harness.myapp` for `https://harness.myapp.localhost`. Concurrent workspaces
need distinct names. Closing the CLI removes its route, while the shared proxy
continues running.

The CLI prints the workspace URL only after the proxy serves this workspace at it.
If the route does not appear within 10 seconds, launch stops with an error.

The target application's URL is independent of the workspace URL.

The tool server
serves package assets only, not files from the target application's project.

## Same-origin mode

`--same-origin` serves the workspace at `/__ui-harness/` and forwards every other
path to the target origin, including WebSocket upgrades such as Vite HMR. Previews
load through the workspace origin, so the target's `X-Frame-Options: SAMEORIGIN`
and `frame-ancestors 'self'` allow them. `DENY` and `frame-ancestors 'none'` still
block. `--allow-framing`, which requires `--same-origin`, rewrites those headers to
`SAMEORIGIN` and `'self'` on proxied responses; use it for development only.

The proxy sets `Host` to the target host and rewrites `Origin` and `Referer` to the
target origin. It rewrites `Location` headers that point at the target origin, and
removes `Domain=` from `Set-Cookie`, so cookies are host-only on the workspace host.
It does not rewrite absolute target URLs in HTML, CSS, or JavaScript; those
requests and links go to the target directly. The proxied origin is the origin of
the URL at launch; previews of other origins load directly.

The target's scripts share the workspace origin and can read and change the
workspace page, including its save token. Service workers and storage belong to
the workspace origin. Use this mode only with a target you trust.

## License

The tool is MIT licensed. The Chromium-derived catalog retains its upstream
BSD-style notice in `THIRD_PARTY_NOTICES`.
