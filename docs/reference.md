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
and certificate trust for unattended use.

The default workspace name is derived from the settings-file path. Use
`--name harness.myapp` for `https://harness.myapp.localhost`. Concurrent workspaces
need distinct names. Closing the CLI removes its route, while the shared proxy
continues running.

The target application's URL is independent of the workspace URL.

The tool server
serves package assets only, not files from the target application's project.

## License

The tool is MIT licensed. The Chromium-derived catalog retains its upstream
BSD-style notice in `THIRD_PARTY_NOTICES`.
