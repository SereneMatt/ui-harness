import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { workspaceName, portlessConnection } from '../dist/portless.js';

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

test('a portless child accepts only HTTPS origins without a public port and a valid internal listener', () => {
  assert.deepEqual(portlessConnection({ PORT: '4567', PORTLESS_URL: 'https://harness.myapp.localhost' }), {
    port: 4567, publicOrigin: 'https://harness.myapp.localhost',
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
