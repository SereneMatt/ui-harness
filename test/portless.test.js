import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceName, portlessConnection, selectedProxyPort } from '../dist/portless.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('workspace names are stable and isolate projects with the same directory name', () => {
  assert.equal(workspaceName('/work/my-app/ui-harness.config.json'), workspaceName('/work/my-app/ui-harness.config.json'));
  assert.notEqual(workspaceName('/work/my-app/ui-harness.config.json'), workspaceName('/other/my-app/ui-harness.config.json'));
  assert.match(workspaceName('/work/My App!/settings.json'), /^harness\.my-app-[a-f0-9]{8}$/);
  assert.equal(workspaceName('/work/app/settings.json', 'harness.myapp'), 'harness.myapp');
  for (const name of ['-app', 'app-', 'UPPER', 'https://app', 'app:123', '', '../app']) {
    assert.throws(() => workspaceName('/work/app/settings.json', name));
  }
});

test('a portless child accepts the selected HTTPS proxy port and a valid internal listener', () => {
  assert.deepEqual(portlessConnection({ PORT: '4567', PORTLESS_URL: 'https://harness.myapp.localhost' }), {
    port: 4567, publicOrigin: 'https://harness.myapp.localhost',
  });
  assert.deepEqual(portlessConnection({ PORT: '4567', PORTLESS_PORT: '8443', PORTLESS_URL: 'https://harness.myapp.localhost:8443' }), {
    port: 4567, publicOrigin: 'https://harness.myapp.localhost:8443',
  });
  for (const url of [undefined, 'http://harness.localhost', 'https://harness.localhost:1355',
    'https://user:secret@harness.localhost', 'https://harness.localhost/path', 'https://harness.localhost/?a=b']) {
    assert.throws(() => portlessConnection({ PORT: '4567', PORTLESS_URL: url }), /portless HTTPS/);
  }
  for (const port of [undefined, '0', '-1', '65536', '1.5', 'abc']) {
    assert.throws(() => portlessConnection({ PORT: port, PORTLESS_URL: 'https://harness.localhost' }), /internal listener/);
  }
});

test('CLI rejects direct-port flags and malformed child environments before opening a listener', () => {
  for (const args of [['--port', '4317'], ['--origin', 'http://localhost:4317']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option/);
  }
  for (const origin of ['', 'http://harness.localhost', 'https://harness.localhost:1355']) {
    const result = spawnSync(process.execPath, [cli, 'https://myapp.localhost', '--no-open'], {
      encoding: 'utf8', env: { ...process.env, UI_HARNESS_PORTLESS_CHILD: '1', PORTLESS_URL: origin, PORT: '4567' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a portless HTTPS/);
    assert.doesNotMatch(result.stdout, /UI harness:/);
  }
});

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', status => resolve({ status, stdout, stderr }));
  });
}

test('workspace launch reports missing setup without invoking sudo', { timeout: 10_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'harness-no-sudo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sudo = join(directory, 'sudo');
  const marker = join(directory, 'sudo-called');
  await writeFile(sudo, `#!/bin/sh\necho called > '${marker}'\nexit 1\n`);
  await chmod(sudo, 0o755);
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  await writeFile(join(directory, 'ui-harness.port'), String(port));
  for (const flags of [['--proxy-port', String(port)], []]) {
    const result = await runCli(['https://myapp.localhost', ...flags, '--no-open'], {
      PORTLESS_STATE_DIR: directory, PORTLESS_PORT: undefined, PATH: `${directory}:${process.env.PATH}`,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`setup --proxy-port ${port}`));
    assert.doesNotMatch(result.stderr, /Unknown option/);
  }
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('setup and launch preserve an unrelated server and report a usable alternative', { timeout: 10_000 }, async t => {
  const listener = createServer(socket => socket.destroy());
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  const port = String(listener.address().port);
  for (const args of [['setup'], ['https://myapp.localhost', '--no-open']]) {
    const result = await runCli([...args, '--proxy-port', port]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /occupied by another server/);
    assert.match(result.stderr, /setup --proxy-port (8443|9443)/);
    assert.ok(listener.listening, 'The existing listener must remain running');
  }
});

test('invalid proxy ports fail before setup or launch', async () => {
  for (const port of ['0', '65536', '-1', '1.5', 'abc', '']) {
    const result = await runCli(['setup', `--proxy-port=${port}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Proxy port must be a whole number/);
  }
});


test('proxy port selection prefers flags, then environment, then saved setup, then 443', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'harness-port-selection-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { PORTLESS_STATE_DIR: directory };
  assert.equal(await selectedProxyPort(undefined, env), 443);
  await writeFile(join(directory, 'ui-harness.port'), '8443\n');
  assert.equal(await selectedProxyPort(undefined, env), 8443);
  assert.equal(await selectedProxyPort(undefined, { ...env, PORTLESS_PORT: '9443' }), 9443);
  assert.equal(await selectedProxyPort('10443', { ...env, PORTLESS_PORT: '9443' }), 10443);
  assert.equal(await readFile(join(directory, 'ui-harness.port'), 'utf8'), '8443\n');
  await writeFile(join(directory, 'ui-harness.port'), 'invalid');
  await assert.rejects(selectedProxyPort(undefined, env), /Saved proxy port is invalid/);
  assert.equal(await selectedProxyPort('8443', env), 8443);
  const help = await runCli(['--help'], env);
  assert.equal(help.status, 0, help.stderr);
});
