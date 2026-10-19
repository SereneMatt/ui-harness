import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { startHarness } from '../dist/server.js';

test('port-free URLs are preserved and saved settings survive a restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'settings.json');
  const harness = await startHarness({ url: 'dotcom.localhost', configPath, port: 0 });
  t.after(() => harness.close());
  const workspace = await fetch(`${harness.origin}/api/workspace`).then(response => response.json());
  assert.equal(workspace.settings.url, 'http://dotcom.localhost/');
  assert.deepEqual(workspace.settings.viewports, [
    { width: 390, height: 664 }, { width: 768, height: 1024 },
    { width: 1280, height: 720 }, { width: 1440, height: 900 },
  ]);
  const saved = { version: 1, url: 'https://dotcom.localhost/about', viewports: [{ width: 500, height: 700 }], scale: 0.5 };
  const response = await fetch(`${harness.origin}/api/settings`, {
    method: 'POST', headers: { Origin: harness.origin, 'X-Harness-Token': workspace.token }, body: JSON.stringify(saved),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), saved);
  const restored = await startHarness({ configPath, port: 0 });
  t.after(() => restored.close());
  const actual = await fetch(`${restored.origin}/api/workspace`).then(response => response.json());
  assert.deepEqual(actual.settings, saved);
});

test('invalid settings and foreign-origin writes cannot replace the project configuration', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'settings.json');
  const saved = { version: 1, url: 'http://localhost:4173/', viewports: [{ width: 390, height: 664 }], scale: 'fit' };
  await writeFile(configPath, JSON.stringify(saved));
  const harness = await startHarness({ configPath, port: 0 });
  t.after(() => harness.close());
  const { token } = await fetch(`${harness.origin}/api/workspace`).then(response => response.json());
  for (const invalid of [
    { ...saved, url: 'javascript://alert(1)' }, { ...saved, url: 'https://user:secret@localhost' },
    { ...saved, scale: 0 }, { ...saved, viewports: [] },
    { ...saved, viewports: [{ width: -1, height: 200 }] },
    { ...saved, viewports: [saved.viewports[0], saved.viewports[0]] },
  ]) {
    const response = await fetch(`${harness.origin}/api/settings`, {
      method: 'POST', headers: { Origin: harness.origin, 'X-Harness-Token': token }, body: JSON.stringify(invalid),
    });
    assert.equal(response.status, 400);
  }
  const foreign = await fetch(`${harness.origin}/api/settings`, {
    method: 'POST', headers: { Origin: 'https://example.com', 'X-Harness-Token': token }, body: JSON.stringify(saved),
  });
  assert.equal(foreign.status, 403);
  assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), saved);
});

test('an explicitly configured HTTPS proxy origin can save without trusting forwarded headers', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-proxy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'settings.json');
  const publicOrigin = 'https://harness.dotcom.localhost';
  const harness = await startHarness({ url: 'https://dotcom.localhost', configPath, port: 0, publicOrigin });
  t.after(() => harness.close());
  assert.equal(harness.origin, publicOrigin);
  const send = (path, options = {}) => new Promise((resolve, reject) => {
    const outgoing = request(`${harness.listenOrigin}${path}`, options, incoming => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', chunk => { body += chunk; });
      incoming.on('end', () => resolve({ status: incoming.statusCode, body: JSON.parse(body) }));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end(options.body);
  });
  const headers = { Host: 'harness.dotcom.localhost' };
  const response = await send('/api/workspace', { headers });
  assert.equal(response.status, 200);
  const { settings, token } = response.body;
  const save = await send('/api/settings', {
    method: 'POST', headers: { ...headers, Origin: publicOrigin, 'X-Harness-Token': token }, body: JSON.stringify(settings),
  });
  assert.equal(save.status, 200);
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).url, 'https://dotcom.localhost/');
  const forged = await send('/api/workspace', {
    headers: { Host: 'untrusted.example', 'X-Forwarded-Host': 'harness.dotcom.localhost', 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(forged.status, 403);
  const wrongOrigin = await send('/api/settings', {
    method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example', 'X-Harness-Token': token }, body: JSON.stringify(settings),
  });
  assert.equal(wrongOrigin.status, 403);
});
