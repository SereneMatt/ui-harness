// Measured before/after comparison for one fixed inspection task:
// "look at bench/fixture/index.html at every default harness viewport".
// Usage: pnpm bench:inspect [--runs 5] [--window 1440x900] [--portless] [--out bench/out]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, release, platform, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startHarness } from '../dist/server.js';
import { defaultViewports } from '../dist/settings.js';

const { values } = parseArgs({ options: {
  runs: { type: 'string', default: '5' },
  window: { type: 'string', default: '1440x900' },
  portless: { type: 'boolean', default: false },
  out: { type: 'string', default: 'bench/out' },
} });
const runs = Number(values.runs);
const [winW, winH] = values.window.split('x').map(Number);
const windowSize = { width: winW, height: winH };
const outDir = resolve(values.out);
const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = await readFile(new URL('./fixture/index.html', import.meta.url));

// Target application: the static fixture at `/`, and the same page under each framing policy.
const framingCases = {
  'none (no header)': '/',
  'X-Frame-Options: SAMEORIGIN': '/xfo-sameorigin',
  "CSP frame-ancestors 'self'": '/csp-self',
  'X-Frame-Options: DENY': '/xfo-deny',
  "CSP frame-ancestors 'none'": '/csp-none',
};
const framingHeaders = {
  '/xfo-sameorigin': { 'X-Frame-Options': 'SAMEORIGIN' },
  '/csp-self': { 'Content-Security-Policy': "frame-ancestors 'self'" },
  '/xfo-deny': { 'X-Frame-Options': 'DENY' },
  '/csp-none': { 'Content-Security-Policy': "frame-ancestors 'none'" },
};
const target = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/' || path in framingHeaders) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...framingHeaders[path] });
    return response.end(fixture);
  }
  response.writeHead(404).end();
});
await new Promise(done => target.listen(0, '127.0.0.1', done));
const targetUrl = `http://127.0.0.1:${target.address().port}/`;

// Image cost estimates. Inputs are the PNG's real pixel dimensions; nothing is rounded.
function pngSize(buffer) { return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }; }
// Anthropic: tokens ~= (w*h)/750. Images with a long edge over 1568 px or over ~1600 tokens are scaled down first.
function anthropicTokens(w, h) {
  let s = Math.min(1, 1568 / Math.max(w, h));
  if ((w * s) * (h * s) / 750 > 1600) s *= Math.sqrt((1600 * 750) / ((w * s) * (h * s)));
  return { raw: (w * h) / 750, afterResize: (w * s) * (h * s) / 750 };
}
// OpenAI high detail (GPT-4o family): fit in 2048x2048, scale shortest side down to 768, then 85 + 170 per 512 px tile.
function openaiTokens(w, h) {
  let s = Math.min(1, 2048 / Math.max(w, h));
  s *= Math.min(1, 768 / Math.min(w * s, h * s));
  return 85 + 170 * Math.ceil((w * s) / 512) * Math.ceil((h * s) / 512);
}

// Every browser action an agent would issue goes through `act`, so counts come from the run itself.
function recorder() {
  const record = { calls: [], resizes: 0, shots: [] };
  return {
    record,
    act: async (name, fn) => { record.calls.push(name); if (name === 'setViewportSize') record.resizes++; return fn(); },
    shot: async (file, fn) => {
      const buffer = await fn();
      await writeFile(file, buffer);
      const { width, height } = pngSize(buffer);
      record.shots.push({ file, width, height, pixels: width * height, bytes: buffer.length,
        anthropic: anthropicTokens(width, height), openai: openaiTokens(width, height) });
    },
  };
}

async function baseline(browser, dir) {
  const { record, act, shot } = recorder();
  const start = performance.now();
  const context = await browser.newContext({ viewport: windowSize, deviceScaleFactor: 1 });
  const page = await act('newPage', () => context.newPage());
  for (const size of defaultViewports) {
    await act('setViewportSize', () => page.setViewportSize(size));
    await act('goto', () => page.goto(targetUrl, { waitUntil: 'load' }));
    await act('screenshot', () => shot(join(dir, `baseline-${size.width}x${size.height}.png`), () => page.screenshot({ type: 'png' })));
  }
  record.wallMs = performance.now() - start;
  await context.close();
  return record;
}

async function harnessRun(browser, dir, origin, variant, contextOptions = {}) {
  const { record, act, shot } = recorder();
  const start = performance.now();
  const context = await browser.newContext({ viewport: windowSize, deviceScaleFactor: 1, ...contextOptions });
  const page = await act('newPage', () => context.newPage());
  await act('goto', () => page.goto(origin, { waitUntil: 'load' }));
  for (let index = 0; index < defaultViewports.length; index++) {
    await act('waitForFrame', () => page.frameLocator('iframe').nth(index).locator('#ready').waitFor());
  }
  const file = join(dir, `${variant}.png`);
  if (variant.endsWith('window')) await act('screenshot', () => shot(file, () => page.screenshot({ type: 'png' })));
  else if (variant === 'harness-previews') await act('screenshot', () => shot(file, () => page.locator('#previews').screenshot({ type: 'png' })));
  else {
    // Readable follow-up: switch Display scale to 100% and capture each preview card (Playwright scrolls each into view).
    await act('selectOption', () => page.getByLabel('Display scale').selectOption('1'));
    for (const [index, size] of defaultViewports.entries()) {
      await act('screenshot', () => shot(join(dir, `${variant}-${size.width}x${size.height}.png`),
        () => page.locator('.preview-card').nth(index).screenshot({ type: 'png' })));
    }
  }
  record.wallMs = performance.now() - start;
  // Readability probe (not timed, not counted): display scale of each preview, whether its card is wider than the
  // previews strip (then one shot cannot hold it), and whether it is fully inside the window at the final scroll position.
  record.previews = await page.evaluate(() => [...document.querySelectorAll('.preview-card')].map(card => {
    const box = card.getBoundingClientRect();
    const stripWidth = document.querySelector('#previews').clientWidth;
    const scale = new DOMMatrixReadOnly(getComputedStyle(card.querySelector('iframe')).transform).a;
    return { viewport: card.dataset.viewport, scale, bodyTextPx: 16 * scale, smallTextPx: 14 * scale,
      cardTop: box.top, cardBottom: box.bottom, cardWidth: box.width, previewsStripWidth: stripWidth, widerThanStrip: box.width > stripWidth,
      fullyInWindow: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth };
  }));
  await context.close();
  return record;
}

async function startPortlessHarness(url = targetUrl, name = 'harness.uibench', flags = []) {
  const configDir = await mkdtemp(join(tmpdir(), 'ui-harness-bench-'));
  const start = performance.now();
  const child = spawn(process.execPath, [join(root, 'dist/cli.js'), url, '--name', name, '--no-open', ...flags,
    '--config', join(configDir, 'ui-harness.config.json')], { env: { ...process.env, PORTLESS_SYNC_HOSTS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const origin = await new Promise((done, fail) => {
    const onData = chunk => { output += chunk; const match = output.match(/UI harness: (https:\/\/\S+)/); if (match) done(match[1]); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.once('exit', code => fail(new Error(`ui-harness exited ${code}: ${output.trim()}`)));
    setTimeout(() => fail(new Error(`ui-harness did not print a workspace URL within 30 s: ${output.trim()}`)), 30000).unref();
  }).catch(error => { child.kill('SIGINT'); throw error; });
  return { origin, startupMs: performance.now() - start, close: async () => {
    const exited = new Promise(done => child.once('exit', done));
    child.kill('SIGINT'); await exited; await rm(configDir, { recursive: true, force: true });
  } };
}

function totals(record) {
  const sum = key => record.shots.reduce((total, shot) => total + key(shot), 0);
  return { browserCalls: record.calls.length, screenshots: record.shots.length, resizes: record.resizes,
    pixels: sum(s => s.pixels), bytes: sum(s => s.bytes), anthropicTokensRaw: sum(s => s.anthropic.raw),
    anthropicTokensAfterResize: sum(s => s.anthropic.afterResize), openaiTokens: sum(s => s.openai), wallMs: record.wallMs };
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const launchStart = performance.now();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const browserLaunchMs = performance.now() - launchStart;

const harnessConfigDir = await mkdtemp(join(tmpdir(), 'ui-harness-bench-'));
const directStart = performance.now();
const direct = await startHarness({ url: targetUrl, configPath: join(harnessConfigDir, 'settings.json'), port: 0 });
const directStartupMs = performance.now() - directStart;
const sameOrigin = await startHarness({ url: targetUrl, configPath: join(harnessConfigDir, 'same-origin.json'), port: 0, sameOrigin: true });

const modes = {
  'baseline': dir => baseline(browser, dir),
  'harness-window': dir => harnessRun(browser, dir, direct.origin, 'harness-window'),
  'harness-previews': dir => harnessRun(browser, dir, direct.origin, 'harness-previews'),
  'harness-cards-100': dir => harnessRun(browser, dir, direct.origin, 'harness-cards-100'),
  'same-origin-window': dir => harnessRun(browser, dir, sameOrigin.workspaceUrl, 'same-origin-window'),
};
const blockers = [];
let portless;
if (values.portless) {
  try {
    portless = await startPortlessHarness();
    // Playwright's Chromium uses its own certificate store, not the system CA bundle that setup trusts.
    modes['portless-window'] = dir => harnessRun(browser, dir, portless.origin, 'portless-window', { ignoreHTTPSErrors: true });
  } catch (error) { blockers.push(`Portless launch: ${error.message}`); }
}

const results = Object.fromEntries(Object.keys(modes).map(mode => [mode, []]));
for (let run = 1; run <= runs; run++) {
  const dir = join(outDir, `run-${run}`);
  await mkdir(dir, { recursive: true });
  const names = Object.keys(modes);
  const order = names.map((_, index) => names[(index + run - 1) % names.length]); // rotate order each run
  for (const mode of order) {
    const record = await modes[mode](dir);
    results[mode].push({ run, order: order.indexOf(mode) + 1, ...totals(record), calls: record.calls, shots: record.shots, previews: record.previews });
  }
}

// A blocked preview swaps its frame for Chromium's error page, so a Frame handle taken early can
// detach before it loads. Poll a fresh handle until the content appears or the error page does.
async function frameRenders(page, index, content, timeout = 10_000) {
  for (const deadline = Date.now() + timeout; Date.now() < deadline; await page.waitForTimeout(25)) {
    const frame = await page.locator('iframe').nth(index).elementHandle().then(handle => handle.contentFrame());
    if (!frame) continue;
    if (frame.url().startsWith('chrome-error:')) return false;
    if (await content(frame).count().catch(() => 0) === 1) return true;
  }
  throw new Error(`Preview ${index} neither rendered nor failed within ${timeout} ms`);
}

// Framing matrix: does each preview render the fixture under each framing policy, per harness mode?
async function renderedFrames(workspaceUrl, contextOptions = {}) {
  const context = await browser.newContext({ viewport: windowSize, ...contextOptions });
  const page = await context.newPage();
  await page.goto(workspaceUrl, { waitUntil: 'load' });
  await page.locator('iframe').nth(defaultViewports.length - 1).waitFor();
  let rendered = 0;
  for (let index = 0; index < defaultViewports.length; index++) if (await frameRenders(page, index, frame => frame.locator('#ready'))) rendered++;
  const frameUrls = page.frames().filter(frame => frame !== page.mainFrame()).map(frame => frame.url());
  await context.close();
  return { rendered, frames: defaultViewports.length, frameUrls };
}
const framingModes = {
  'cross-origin (default)': { options: {} },
  'same-origin': { options: { sameOrigin: true } },
  'same-origin + allow-framing': { options: { sameOrigin: true, allowFraming: true } },
};
if (values.portless && !blockers.length) {
  framingModes['Portless cross-origin (default)'] = { flags: [] };
  framingModes['Portless same-origin'] = { flags: ['--same-origin'] };
  framingModes['Portless same-origin + allow-framing'] = { flags: ['--same-origin', '--allow-framing'] };
}
const framing = {};
let portlessLaunches = 0;
for (const [mode, { options, flags }] of Object.entries(framingModes)) {
  framing[mode] = {};
  for (const [label, path] of Object.entries(framingCases)) {
    const url = `${targetUrl.slice(0, -1)}${path}`;
    if (options) {
      const harness = await startHarness({ url, configPath: join(harnessConfigDir, 'framing.json'), port: 0, ...options });
      framing[mode][label] = await renderedFrames(harness.workspaceUrl);
      await harness.close();
    } else {
      try {
        const harness = await startPortlessHarness(url, `harness.uibench-f${++portlessLaunches}`, flags);
        try { framing[mode][label] = await renderedFrames(harness.origin, { ignoreHTTPSErrors: true }); }
        finally { await harness.close(); }
      } catch (error) { framing[mode][label] = { error: error.message }; }
    }
  }
}

const environment = { os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, cpuCount: cpus().length, node: process.version,
  playwright: JSON.parse(await readFile(join(root, 'node_modules/playwright/package.json'), 'utf8')).version,
  browser: `${browser.browserType().name()} ${browser.version()}`, window: windowSize, viewports: defaultViewports };
const averages = Object.fromEntries(Object.entries(results).map(([mode, list]) => [mode, Object.fromEntries(
  ['browserCalls', 'screenshots', 'resizes', 'pixels', 'bytes', 'anthropicTokensRaw', 'anthropicTokensAfterResize', 'openaiTokens', 'wallMs']
    .map(key => [key, list.reduce((total, item) => total + item[key], 0) / list.length]))]));
const report = { date: new Date().toISOString(), environment, browserLaunchMs, harnessStartupMs: { direct: directStartupMs, portless: portless?.startupMs },
  portlessOrigin: portless?.origin, blockers, framing, runs: results, averages };
await writeFile(join(outDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);

await browser.close();
await direct.close();
await sameOrigin.close();
await portless?.close();
await new Promise(done => target.close(done));
await rm(harnessConfigDir, { recursive: true, force: true });

const columns = ['browserCalls', 'screenshots', 'resizes', 'pixels', 'bytes', 'anthropicTokensRaw', 'anthropicTokensAfterResize', 'openaiTokens', 'wallMs'];
const lines = [`| mode | run | ${columns.join(' | ')} |`, `|${' --- |'.repeat(columns.length + 2)}`];
for (const [mode, list] of Object.entries(results)) {
  for (const item of list) lines.push(`| ${mode} | ${item.run} | ${columns.map(key => item[key]).join(' | ')} |`);
  lines.push(`| **${mode}** | **avg** | ${columns.map(key => averages[mode][key]).join(' | ')} |`);
}
const framingLines = [`| framing policy | ${Object.keys(framing).join(' | ')} |`, `|${' --- |'.repeat(Object.keys(framing).length + 1)}`];
for (const label of Object.keys(framingCases)) {
  framingLines.push(`| ${label} | ${Object.values(framing).map(cases => cases[label].error ? `error: ${cases[label].error}` : `${cases[label].rendered}/${cases[label].frames}`).join(' | ')} |`);
}
process.stdout.write(`${JSON.stringify({ environment, browserLaunchMs, harnessStartupMs: report.harnessStartupMs, blockers }, null, 2)}\n\n${lines.join('\n')}\n\nPreviews that rendered the fixture:\n\n${framingLines.join('\n')}\n\n`);
for (const mode of Object.keys(results).filter(mode => mode !== 'baseline')) {
  process.stdout.write(`${mode} previews (run 1): ${JSON.stringify(results[mode][0].previews)}\n`);
}
process.stdout.write(`\nScreenshots and results.json: ${outDir}\n`);
