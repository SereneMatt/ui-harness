import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startHarness } from '../dist/server.js';

let browser;
let target;
let targetUrl;

before(async () => {
  target = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/blocked') {
      response.writeHead(200, { 'Content-Security-Policy': "frame-ancestors 'none'", 'Content-Type': 'text/html' });
      return response.end('<h1>Direct access only</h1>');
    }
    if (path === '/fixture' || path === '/second') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      return response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{height:3000px}</style><h1>${path === '/fixture' ? 'First page' : 'Second page'}</h1><label>Draft<input></label><a href="/second">Next page</a>`);
    }
    response.writeHead(404).end();
  });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  targetUrl = `http://127.0.0.1:${target.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close();
  if (target) await new Promise(resolve => target.close(resolve));
});

async function workspace(t, path = '/fixture') {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-browser-'));
  const configPath = join(directory, 'settings.json');
  const harness = await startHarness({ url: `${targetUrl}${path}`, configPath, port: 0 });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await context.close();
    await harness.close();
    await rm(directory, { recursive: true, force: true });
    assert.deepEqual(errors, []);
  });
  await page.goto(harness.origin);
  await page.locator('iframe').nth(3).waitFor();
  return { page, harness, configPath };
}

test('target renders at exact dimensions and scaling preserves page state', async t => {
  const { page } = await workspace(t);
  const dimensions = [[390, 664], [768, 1024], [1280, 720], [1440, 900]];
  for (let index = 0; index < dimensions.length; index++) {
    const frame = await page.locator('iframe').nth(index).elementHandle().then(handle => handle.contentFrame());
    await frame.getByRole('heading', { name: 'First page', exact: true }).waitFor();
    assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight]), dimensions[index]);
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await frame.evaluate(() => { window.harnessState = 'retained'; });
  }
  const first = page.frameLocator('iframe').first();
  await first.getByLabel('Draft').fill('Retain this draft');
  await page.getByLabel('Display scale').selectOption('1');
  for (let index = 0; index < dimensions.length; index++) {
    const frame = await page.locator('iframe').nth(index).elementHandle().then(handle => handle.contentFrame());
    assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight, window.harnessState]), [...dimensions[index], 'retained']);
  }
  await page.getByLabel('Display scale').selectOption('fit');
  assert.equal(await first.getByLabel('Draft').inputValue(), 'Retain this draft');
});

test('native interaction stays independent while sizes change and reset returns all routes', async t => {
  const { page } = await workspace(t, '/fixture');
  const first = page.frameLocator('iframe').first();
  await first.getByLabel('Draft').fill('Keep this text');
  const frame = await page.locator('iframe').first().elementHandle().then(handle => handle.contentFrame());
  await frame.evaluate(() => scrollTo(0, 600));
  const second = await page.locator('iframe').nth(1).elementHandle().then(handle => handle.contentFrame());
  assert.equal(await second.evaluate(() => scrollY), 0);
  await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('500');
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('700');
  await page.getByRole('button', { name: 'Add viewport', exact: true }).click();
  assert.equal(await page.locator('iframe').count(), 5);
  assert.equal(await first.getByLabel('Draft').inputValue(), 'Keep this text');
  assert.equal(await frame.evaluate(() => scrollY), 600);
  await page.getByRole('button', { name: 'Remove 500 × 700', exact: true }).click();
  assert.equal(await page.locator('iframe').count(), 4);
  await first.getByRole('link', { name: 'Next page' }).click();
  await first.getByRole('heading', { name: 'Second page' }).waitFor();
  await page.frameLocator('iframe').nth(1).getByRole('heading', { name: 'First page' }).waitFor();
  await page.getByRole('button', { name: 'Reset all', exact: true }).click();
  for (let index = 0; index < 4; index++) await page.frameLocator('iframe').nth(index).getByRole('heading', { name: 'First page' }).waitFor();
});

test('saved workspace settings reopen and blocked targets have a direct-opening fallback', async t => {
  const { page, configPath } = await workspace(t);
  await page.getByLabel('Project URL', { exact: true }).fill(`${targetUrl}/blocked`);
  await page.getByRole('button', { name: 'Open URL', exact: true }).click();
  await page.getByText('Preview blank or blocked?', { exact: true }).click();
  const direct = page.getByRole('link', { name: 'Open project directly' });
  assert.equal(await direct.getAttribute('href'), `${targetUrl}/blocked`);
  const popupPromise = page.waitForEvent('popup');
  await direct.click();
  const popup = await popupPromise;
  await popup.getByRole('heading', { name: 'Direct access only' }).waitFor();
  await popup.close();
  await page.getByLabel('Display scale').selectOption('0.5');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Settings saved' }).waitFor();
  const saved = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(saved.url, `${targetUrl}/blocked`);
  assert.equal(saved.scale, 0.5);
  const restored = await startHarness({ configPath, port: 0 });
  t.after(() => restored.close());
  await page.goto(restored.origin);
  await page.locator('iframe').nth(3).waitFor();
  assert.equal(await page.getByLabel('Project URL', { exact: true }).inputValue(), `${targetUrl}/blocked`);
  assert.equal(await page.getByLabel('Display scale').inputValue(), '0.5');
});

test('catalog selection supports keyboard use and the workspace fits a narrow browser', async t => {
  const { page } = await workspace(t, '/fixture');
  await page.getByLabel('Find a size', { exact: true }).fill('344x882');
  const checkbox = page.getByRole('checkbox', { name: '344 × 882', exact: true });
  await checkbox.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('iframe').count(), 5);
  assert.equal(await checkbox.isChecked(), true);
  assert.equal(await checkbox.evaluate(element => document.activeElement === element), true);
  const frame = await page.locator('iframe[title="Preview 344 × 882"]').elementHandle().then(handle => handle.contentFrame());
  await frame.getByRole('heading', { name: 'First page' }).waitFor();
  assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight]), [344, 882]);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('iframe').count(), 4);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
