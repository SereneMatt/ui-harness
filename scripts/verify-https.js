import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const workspaceUrl = process.argv[2];
assert.ok(workspaceUrl, 'Pass the HTTPS workspace URL as the first argument.');
assert.equal(new URL(workspaceUrl).protocol, 'https:');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(workspaceUrl);
  assert.equal(response.status(), 200);
  const security = await response.securityDetails();
  assert.ok(security, 'The workspace must use a verified TLS connection.');
  assert.equal(await page.evaluate(() => isSecureContext), true);
  const settings = await page.evaluate(async () => {
    const response = await fetch('/api/workspace');
    if (!response.ok) throw new Error('Could not read workspace settings.');
    return (await response.json()).settings;
  });
  assert.equal(new URL(settings.url).protocol, 'https:');
  await page.locator('iframe').nth(settings.viewports.length - 1).waitFor();
  for (const size of settings.viewports) {
    const handle = await page.locator(`iframe[title="Preview ${size.width} × ${size.height}"]`).elementHandle();
    const frame = await handle.contentFrame();
    await frame.waitForURL(settings.url);
    await frame.waitForLoadState('load');
    assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight, isSecureContext, location.protocol]), [size.width, size.height, true, 'https:']);
  }
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Settings saved' }).waitFor();
  assert.deepEqual(errors, []);
  const protocol = await page.evaluate(() => performance.getEntriesByType('navigation')[0].nextHopProtocol);
  process.stdout.write(`Verified ${page.url()} using ${security.protocol} / ${protocol}, ${settings.viewports.length} HTTPS previews, and settings persistence.\n`);
} finally {
  await browser.close();
}
