import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('packed CLI runs outside the checkout, serves assets, saves settings, and shuts down', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-harness-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tarball = process.env.UI_HARNESS_TARBALL
    ? resolve(process.env.UI_HARNESS_TARBALL) : join(directory, 'package.tgz');
  const run = (command, args, cwd = directory) => execFileSync(command, args, {
    cwd, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!process.env.UI_HARNESS_TARBALL) run('pnpm', ['pack', '--ignore-scripts', '--out', tarball], root);
  const contents = run('tar', ['-tzf', tarball]).trim().split('\n');
  for (const path of ['dist/cli.js', 'dist/portless.js', 'dist/server.js', 'dist/settings.js', 'web/index.html', 'dist/browser.js',
    'web/style.css', 'data/chromium-viewports.json', 'docs/reference.md', 'LICENSE', 'THIRD_PARTY_NOTICES']) {
    assert.ok(contents.includes(`package/${path}`), `Missing packaged file: ${path}`);
  }
  assert.ok(!contents.some(path => /package\/(?:examples\/|\.example-build\/|test\/|node_modules\/|\.scratch\/|docs\/agents\/|AGENTS.md)/.test(path)));
  assert.ok(!contents.includes('package/dist/example.js'), 'The demo server must stay outside the package');
  assert.ok(!contents.some(path => path.endsWith('.ts')), 'Only compiled JavaScript ships');
  await writeFile(join(directory, 'package.json'), '{"private":true}\n');
  run('pnpm', ['add', tarball, '--ignore-scripts']);
  const cli = join(directory, 'node_modules/.bin/ui-harness');
  assert.equal(run(cli, ['--version']).trim(), manifest.version);
  assert.match(run(cli, ['--help']), /Usage: ui-harness/);
  // Exercise the same package runner used by pnpx, without a registry publication.
  assert.equal(run('pnpm', [`--package=${tarball}`, 'dlx', 'ui-harness', '--version']).trim(), manifest.version);

  const ca = await readFile(process.env.NODE_EXTRA_CA_CERTS || join(process.env.PORTLESS_STATE_DIR || join(homedir(), '.portless'), 'ca.pem'));
  const name = `harness.${directory.split('/').at(-1).toLowerCase()}`;
  const fetchWorkspace = (url, options = {}) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const outgoing = request({
      hostname: '127.0.0.1', port: 443, servername: parsed.hostname, ca,
      path: parsed.pathname, method: options.method || 'GET',
      headers: { Host: parsed.hostname, ...options.headers },
    }, incoming => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', chunk => { body += chunk; });
      incoming.on('end', () => resolve({ status: incoming.statusCode, text: async () => body, json: async () => JSON.parse(body) }));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(10_000, () => outgoing.destroy(new Error('Workspace request timed out')));
    outgoing.end(options.body);
  });

  async function launch(args) {
    const env = { ...process.env };
    delete env.PORT;
    delete env.PORTLESS_URL;
    delete env.UI_HARNESS_PORTLESS_CHILD;
    env.PORTLESS_SYNC_HOSTS = '0';
    const child = spawn(cli, [...args, '--name', name, '--no-open'], {
      cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    t.after(async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
      try { await exited; } finally { clearTimeout(timeout); }
    });
    let output = '';
    let errors = '';
    child.stderr.on('data', data => { errors += data; });
    const origin = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`CLI startup timed out: ${output} ${errors}`)), 15_000);
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/UI harness: (https:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      exited.then(result => { clearTimeout(timeout); reject(new Error(`CLI exited before startup: ${JSON.stringify(result)} ${errors}`)); }, reject);
    });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await fetchWorkspace(`${origin}/api/workspace`);
      if (response.status === 200) { ready = true; break; }
      await delay(50);
    }
    assert.ok(ready, 'Portless must route to the running workspace');
    return { origin, stop: async () => {
      child.kill('SIGTERM');
      let timer;
      try {
        const result = await Promise.race([exited, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('CLI did not shut down')), 5_000);
        })]);
        assert.equal(result.signal, null);
        assert.ok([0, 143].includes(result.code), `Unexpected shutdown: ${JSON.stringify(result)}`);
      } finally { clearTimeout(timer); }
    } };
  }
  const first = await launch(['https://myapp.localhost']);
  assert.equal(new URL(first.origin).port, '');
  assert.equal(first.origin, `https://${name}.localhost`);
  for (const path of ['/', '/app.js', '/style.css', '/settings.js']) {
    const response = await fetchWorkspace(`${first.origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 0);
  }
  const workspace = await fetchWorkspace(`${first.origin}/api/workspace`).then(response => response.json());
  assert.equal(workspace.settings.url, 'https://myapp.localhost/');
  assert.ok(workspace.catalog);
  const saved = { ...workspace.settings, scale: 0.5, viewports: [{ width: 500, height: 700 }] };
  const response = await fetchWorkspace(`${first.origin}/api/settings`, {
    method: 'POST', headers: { Origin: first.origin, 'X-Harness-Token': workspace.token }, body: JSON.stringify(saved),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'ui-harness.config.json'), 'utf8')), saved);
  await first.stop();
  const second = await launch([]);
  assert.deepEqual((await fetchWorkspace(`${second.origin}/api/workspace`).then(response => response.json())).settings, saved);
  await second.stop();
  // The shared proxy reloads its route file asynchronously after the CLI exits.
  let status;
  for (let attempt = 0; attempt < 40; attempt++) {
    status = (await fetchWorkspace(`${second.origin}/api/workspace`)).status;
    if (status === 404) break;
    await delay(50);
  }
  assert.equal(status, 404, 'Portless removes the route on shutdown');
});
