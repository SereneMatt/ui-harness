# Releasing @serenematt/ui-harness

Development, packaging, and publication use the pnpm 12 version pinned in
`package.json`. pnpm supports npm trusted publishing directly; the workflow does
not install a separate npm CLI. See [pnpm publish](https://pnpm.io/cli/publish).

## First release setup

1. Confirm your npm account can publish under `@serenematt` (`npm login` and
   `npm whoami` in your own terminal). The GitHub username alone does not grant
   access to the npm scope.
2. Push the reviewed repository and workflows to `SereneMatt/ui-harness`. Ensure
   CI passes on Linux and macOS before releasing.
3. If the package does not exist yet, publish the initial tested tarball from an
   authenticated maintainer terminal. This creates the package whose settings
   contain the trusted publisher configuration:

   ```sh
   pnpm install --frozen-lockfile
   pnpm exec playwright install chromium
   pnpm start setup
   pnpm test
   pnpm pack --out release.tgz
   UI_HARNESS_TARBALL=release.tgz pnpm test:package
   pnpm publish ./release.tgz --access public
   ```

4. Create the GitHub repository environment `npm`. In the npm package settings,
   add a GitHub Actions trusted publisher with these exact values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `SereneMatt` |
   | Repository | `ui-harness` |
   | Workflow filename | `release.yml` |
   | Environment | `npm` |
   | Allowed action | Direct publishing with `npm publish` |

   Configure this close to the next release: npm currently requires the first
   successful trusted publish within two days of creating the configuration.
   See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for
   current setup requirements. No long-lived npm token is needed in GitHub.

If the initial version was published manually, use a new version for the first
workflow release. npm does not allow republishing an existing name/version pair.

## Subsequent releases

1. Update `package.json` to the intended stable version and commit the reviewed
   changes. Push the commit to main and wait for CI.
2. Tag that commit with the matching version, for example `v0.1.1`, and push the
   tag. The tag itself does not trigger publication.
3. Explicitly dispatch the workflow on that tag:

   ```sh
   gh workflow run release.yml --ref v0.1.1
   ```

The workflow rejects branch refs, prerelease versions, and tags that do not match
`package.json`. It runs the Linux/macOS Node.js 24/26 test matrix, packs the selected
revision, tests that exact tarball outside the source tree, then publishes it.
`pnpm pack` runs the `prepack` build with tsc-ts. The CLI, Portless launcher, server, browser app, and settings parser are authored in
`src/*.ts` and compiled into `dist/`. The package entry point is `dist/cli.js`;
only generated JavaScript ships, and consumers need no compiler or TypeScript loader.
The browser uses `tsconfig.browser.json` with DOM types and no Node.js globals.
The server serves compiled `dist/browser.js` at `/app.js`; HTML and CSS remain in `web/`.
The avatar demo under `examples/avatars/` is repository-only and is excluded from the npm package.
Publishing uses `--no-git-checks` because the workflow checks out a version tag
rather than a branch; the version job validates that tag before tests run.
The workflow must already be present on the default branch for manual dispatch.

## Local validation without publishing

Complete `pnpm start setup` once before the HTTPS package test.

```sh
pnpm pack --out release.tgz
UI_HARNESS_TARBALL=release.tgz pnpm test:package
pnpm publish ./release.tgz --access public --no-git-checks --dry-run
```

These checks validate packaging and execution, not npm ownership or OIDC
configuration. Actual macOS results come from CI; Linux execution cannot verify
macOS behavior. Token-usage benchmarks are documented separately in the README
and are not claimed by a passing package test.
