import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startHarness } from '../dist/server.js';

const framing = {
  open: {},
  sameorigin: { 'X-Frame-Options': 'SAMEORIGIN' },
  self: { 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self'" },
  deny: { 'X-Frame-Options': 'DENY' },
  none: { 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" },
};

let browser;
let target;
let targetUrl;
const seen = [];

before(async () => {
  target = createServer((incoming, response) => {
    seen.push({ url: incoming.url, host: incoming.headers.host, origin: incoming.headers.origin });
    const path = new URL(incoming.url, 'http://localhost').pathname.slice(1);
    if (path in framing) {
      response.writeHead(200, { 'Content-Type': 'text/html', ...framing[path] });
      return response.end(`<!doctype html><h1>Framed ${path}</h1><p id="cookie"></p><script>document.cookie='seen=1';</script>`);
    }
    if (path === 'redirect') return response.writeHead(302, { Location: `${targetUrl}/open` }).end();
    if (path === 'cookie') return response.writeHead(200, { 'Set-Cookie': ['session=1; Domain=127.0.0.1; Path=/; HttpOnly', 'theme=dark'] }).end('ok');
    response.writeHead(404).end();
  });
  // Echo server standing in for a dev server's HMR WebSocket.
  target.on('upgrade', (incoming, socket) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: echo\r\nConnection: Upgrade\r\nX-Seen-Host: ${incoming.headers.host}\r\n\r\n`);
    socket.pipe(socket);
  });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  targetUrl = `http://127.0.0.1:${target.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close();
  if (target) await new Promise(resolve => target.close(resolve));
});

async function harness(t, path, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-same-origin-'));
  const started = await startHarness({ url: `${targetUrl}/${path}`, configPath: join(directory, 'settings.json'), port: 0, ...options });
  t.after(async () => { await started.close(); await rm(directory, { recursive: true, force: true }); });
  return started;
}

async function rendered(t, path, options) {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-same-origin-'));
  const started = await startHarness({ url: `${targetUrl}/${path}`, configPath: join(directory, 'settings.json'), port: 0, ...options });
  const context = await browser.newContext();
  // Close the browser first: the server waits for its open connections.
  t.after(async () => {
    await context.close();
    await started.close();
    await rm(directory, { recursive: true, force: true });
  });
  const { workspaceUrl } = started;
  const page = await context.newPage();
  await page.goto(workspaceUrl);
  await page.locator('iframe').nth(3).waitFor();
  // A blocked preview swaps its frame for Chromium's error page, so a Frame handle taken early can
  // detach before it loads. Poll a fresh handle until the heading or the error page appears.
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; await page.waitForTimeout(25)) {
    const frame = await page.locator('iframe').first().elementHandle().then(handle => handle.contentFrame());
    if (!frame) continue;
    if (frame.url().startsWith('chrome-error:')) return false;
    if (await frame.getByRole('heading', { name: `Framed ${path}` }).count().catch(() => 0) === 1) return true;
  }
  throw new Error(`Preview for ${path} neither rendered nor failed`);
}

for (const [mode, options, expected] of [
  ['cross-origin', {}, { open: true, sameorigin: false, self: false, deny: false, none: false }],
  ['same-origin', { sameOrigin: true }, { open: true, sameorigin: true, self: true, deny: false, none: false }],
  ['same-origin with allowFraming', { sameOrigin: true, allowFraming: true }, { open: true, sameorigin: true, self: true, deny: true, none: true }],
]) {
  test(`${mode} previews render only the framing policies that allow them`, async t => {
    const actual = {};
    for (const path of Object.keys(framing)) actual[path] = await rendered(t, path, options);
    assert.deepEqual(actual, expected);
  });
}

test('same-origin mode serves the workspace under its prefix and forwards everything else', async t => {
  const started = await harness(t, 'open', { sameOrigin: true });
  assert.equal(started.workspaceUrl, `${started.origin}/__ui-harness/`);
  const workspace = await fetch(`${started.origin}/__ui-harness/api/workspace`).then(response => response.json());
  assert.equal(workspace.proxyOrigin, targetUrl);
  assert.equal((await fetch(`${started.origin}/__ui-harness`, { redirect: 'manual' })).headers.get('location'), '/__ui-harness/');
  assert.equal((await fetch(`${started.origin}/__ui-harness/app.js`)).status, 200);

  seen.length = 0;
  const page = await fetch(`${started.origin}/open`, { headers: { Origin: started.origin } });
  assert.match(await page.text(), /Framed open/);
  assert.deepEqual(seen.at(-1), { url: '/open', host: new URL(targetUrl).host, origin: targetUrl });
  assert.equal((await fetch(`${started.origin}/redirect`, { redirect: 'manual' })).headers.get('location'), `${started.origin}/open`);
  assert.deepEqual((await fetch(`${started.origin}/cookie`)).headers.getSetCookie(), ['session=1; Path=/; HttpOnly', 'theme=dark']);
  assert.equal((await fetch(`${started.origin}/missing`)).status, 404);
});

test('same-origin mode keeps other CSP directives and only rewrites framing when asked', async t => {
  const plain = await harness(t, 'none', { sameOrigin: true });
  assert.equal((await fetch(`${plain.origin}/none`)).headers.get('content-security-policy'), "default-src 'self'; frame-ancestors 'none'");
  assert.equal((await fetch(`${plain.origin}/deny`)).headers.get('x-frame-options'), 'DENY');
  const rewritten = await harness(t, 'none', { sameOrigin: true, allowFraming: true });
  assert.equal((await fetch(`${rewritten.origin}/none`)).headers.get('content-security-policy'), "default-src 'self'; frame-ancestors 'self'");
  assert.equal((await fetch(`${rewritten.origin}/deny`)).headers.get('x-frame-options'), 'SAMEORIGIN');
  await assert.rejects(harness(t, 'open', { allowFraming: true }), /requires same-origin mode/);
});

test('same-origin mode forwards WebSocket-style upgrades and checks the workspace host', async t => {
  const started = await harness(t, 'open', { sameOrigin: true });
  const { port } = new URL(started.origin);
  const upgrade = await new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path: '/hmr', headers: { Connection: 'Upgrade', Upgrade: 'echo' } });
    outgoing.on('upgrade', (incoming, socket) => {
      socket.once('data', data => { socket.destroy(); resolve({ status: incoming.statusCode, host: incoming.headers['x-seen-host'], echo: String(data) }); });
      socket.write('ping');
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
  assert.deepEqual(upgrade, { status: 101, host: new URL(targetUrl).host, echo: 'ping' });
  const forged = await new Promise(resolve => {
    request({ host: '127.0.0.1', port, path: '/open', headers: { Host: 'attacker.example' } }, incoming => { incoming.resume(); resolve(incoming.statusCode); }).end();
  });
  assert.equal(forged, 403);
});
