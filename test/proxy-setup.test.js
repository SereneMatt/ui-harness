import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:https';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const portlessCli = fileURLToPath(new URL('./cli.js', import.meta.resolve('portless')));

async function unusedPort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.once('error', reject);
    child.once('exit', status => resolve({ status, output }));
  });
}

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), 'harness-proxy-setup-'));
  const proxies = [];
  t.after(async () => {
    try {
      for (const env of proxies) execFileSync(process.execPath, [portlessCli, 'proxy', 'stop'], { env, stdio: 'ignore', timeout: 10_000 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const trust = join(directory, 'trust');
  await mkdir(trust);
  const bundle = join(directory, 'certificates.pem');
  await writeFile(bundle, '');
  const hosts = join(directory, 'hosts');
  await writeFile(hosts, '127.0.0.1 localhost\n');
  // Redirect privileged OS effects in subprocesses. Certificate generation,
  // proxy startup, route loading, hosts reconciliation, and TLS remain real.
  const preload = join(directory, 'os-store.mjs');
  await writeFile(preload, `
    import fs from 'node:fs';
    import { basename, join } from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    const map = path => typeof path === 'string' && path === '/etc/hosts'
      ? process.env.TEST_HOSTS : typeof path === 'string' && path.endsWith('/portless-ca.crt')
        ? join(process.env.TEST_TRUST, basename(path)) : path;
    for (const name of ['readFileSync', 'writeFileSync', 'existsSync']) {
      const original = fs[name];
      fs[name] = (path, ...args) => original(map(path), ...args);
    }
    const copy = fs.copyFileSync;
    fs.copyFileSync = (source, destination, ...args) => copy(source, map(destination), ...args);
    syncBuiltinESMExports();
  `);
  const command = `#!${process.execPath}
    const fs = require('node:fs');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const name = path.basename(process.argv[1]);
    const args = process.argv.slice(2);
    if (name === 'sudo') {
      fs.appendFileSync(process.env.TEST_SUDO, 'called\\n');
      const child = spawnSync(args[0], args.slice(1), { stdio: 'inherit' });
      process.exit(child.status ?? 1);
    } else if (name === 'install') {
      fs.copyFileSync(args.at(-2), path.join(process.env.TEST_TRUST, path.basename(args.at(-1))));
    } else {
      fs.writeFileSync(process.env.SSL_CERT_FILE, fs.readdirSync(process.env.TEST_TRUST)
        .filter(name => name.endsWith('.crt'))
        .map(name => fs.readFileSync(path.join(process.env.TEST_TRUST, name), 'utf8')).join('\\n'));
    }
  `;
  for (const name of ['sudo', 'install', 'update-ca-trust', 'update-ca-certificates']) {
    await writeFile(join(directory, name), command);
    await chmod(join(directory, name), 0o755);
  }
  return { directory, trust, hosts, proxies, env: {
    ...process.env, PATH: `${directory}:${process.env.PATH}`, NODE_OPTIONS: `--import=${preload}`,
    SSL_CERT_FILE: bundle, TEST_TRUST: trust, TEST_HOSTS: hosts,
    TEST_SUDO: join(directory, 'sudo-called'), PORTLESS_SYNC_HOSTS: '0',
  } };
}

async function setup(fixture, directory, env) {
  const port = await unusedPort();
  const configured = { ...env, PORTLESS_STATE_DIR: directory };
  fixture.proxies.push(configured);
  const result = await run(['setup', '--proxy-port', String(port)], configured);
  assert.equal(result.status, 0, result.output);
  return { port, env: configured };
}

function fetchProxy(port, ca) {
  return new Promise((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', servername: 'localhost', port, ca }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error('Proxy request timed out')));
    outgoing.end();
  });
}

test('setting up a second Linux proxy preserves trusted TLS for both proxies', {
  skip: process.platform !== 'linux', timeout: 30_000,
}, async t => {
  const fixture = await sandbox(t);
  const first = await setup(fixture, join(fixture.directory, 'first'), fixture.env);
  const firstCA = await readFile(fixture.env.SSL_CERT_FILE);
  assert.equal(await fetchProxy(first.port, firstCA), 404);
  const second = await setup(fixture, join(fixture.directory, 'second'), fixture.env);
  const trusted = await readFile(fixture.env.SSL_CERT_FILE);
  assert.equal(await fetchProxy(first.port, trusted), 404, 'First proxy must remain trusted');
  assert.equal(await fetchProxy(second.port, trusted), 404, 'Second proxy must also be trusted');
});

test('explicit hosts sync makes a registered workspace available to the system resolver', {
  skip: process.platform !== 'linux', timeout: 30_000,
}, async t => {
  const fixture = await sandbox(t);
  const proxy = await setup(fixture, join(fixture.directory, 'proxy'), fixture.env);
  await writeFile(join(proxy.env.PORTLESS_STATE_DIR, 'routes.json'), JSON.stringify([
    { hostname: 'harness.safari.localhost', port: 12345, pid: process.pid },
  ]));
  delete proxy.env.PORTLESS_PORT;
  assert.doesNotMatch(await readFile(fixture.hosts, 'utf8'), /harness\.safari\.localhost/);
  const result = await run(['hosts', 'sync'], proxy.env);
  assert.equal(result.status, 0, result.output);
  assert.match(await readFile(fixture.hosts, 'utf8'), /127\.0\.0\.1\s+harness\.safari\.localhost/);
  assert.match(await readFile(fixture.hosts, 'utf8'), /127\.0\.0\.1 localhost/);
});


test('proxy setup enables automatic hosts synchronization unless explicitly disabled', {
  skip: process.platform !== 'linux', timeout: 30_000,
}, async t => {
  const fixture = await sandbox(t);
  delete fixture.env.PORTLESS_SYNC_HOSTS;
  const proxy = await setup(fixture, join(fixture.directory, 'proxy'), fixture.env);
  await writeFile(join(proxy.env.PORTLESS_STATE_DIR, 'routes.json'), JSON.stringify([
    { hostname: 'harness.automatic.localhost', port: 12345, pid: process.pid },
  ]));
  let hosts;
  for (let attempt = 0; attempt < 50; attempt++) {
    hosts = await readFile(fixture.hosts, 'utf8');
    if (hosts.includes('harness.automatic.localhost')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(hosts, /127\.0\.0\.1\s+harness\.automatic\.localhost/);
});


test('setup remembers the custom proxy across fresh commands without a state override', {
  skip: process.platform !== 'linux', timeout: 30_000,
}, async t => {
  const fixture = await sandbox(t);
  const env = { ...fixture.env, HOME: join(fixture.directory, 'home') };
  delete env.PORTLESS_STATE_DIR;
  delete env.PORTLESS_PORT;
  const port = await unusedPort();
  const state = join(env.HOME, '.portless', `ui-harness-${port}`);
  fixture.proxies.push({ ...env, PORTLESS_STATE_DIR: state });
  const result = await run(['setup', '--proxy-port', String(port)], env);
  assert.equal(result.status, 0, result.output);
  await writeFile(join(state, 'routes.json'), JSON.stringify([
    { hostname: 'harness.remembered.localhost', port: 12345, pid: process.pid },
  ]));
  const sync = await run(['hosts', 'sync'], env);
  assert.equal(sync.status, 0, sync.output);
  assert.match(await readFile(fixture.hosts, 'utf8'), /harness\.remembered\.localhost/);
  const reuse = await run(['setup'], env);
  assert.equal(reuse.status, 0, reuse.output);
  assert.match(reuse.output, new RegExp(`HTTPS proxy ready on port ${port}`));
});
