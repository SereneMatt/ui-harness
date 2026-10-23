#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { startHarness, type Harness } from './server.js';
import { normalizeUrl } from './settings.js';
import { workspaceName, portlessConnection, runPortless, setupProxy, requireProxy, proxyPort } from './portless.js';

const help = `UI harness — inspect a running site at multiple viewport sizes.

Usage: ui-harness [URL] [options]
       ui-harness setup

  --config PATH  Settings file (default: ./ui-harness.config.json)
  --name NAME    Workspace name (default: stable name derived from the project)
  --proxy-port PORT  HTTPS proxy port (default: 443, or PORTLESS_PORT)
  --no-open      Print the workspace URL without opening a browser
  --help         Show this help
  --version      Print the package version

Examples:
  ui-harness https://myapp.localhost
  ui-harness https://myapp.localhost --name harness.myapp --no-open
  ui-harness --config ./ui-harness.config.json

The workspace uses a named HTTPS URL. Nonstandard proxy ports appear in the URL.
Portless is included. Workspace launches reuse setup without administrator prompts.
First run may require an administrator prompt for proxy and certificate setup.
Run "ui-harness setup" in a terminal before using an unattended agent.
Start your target application's development server separately.
`;

function showServer(harness: Harness, open: boolean) {
  if (open) {
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const browser = spawn(command, [harness.origin], { stdio: 'ignore', detached: true });
    browser.on('error', () => process.stderr.write(`Open ${harness.origin} in your browser.\n`));
    browser.unref();
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await harness.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required.');
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, name: { type: 'string' }, 'proxy-port': { type: 'string' },
    'no-open': { type: 'boolean' }, help: { type: 'boolean' }, version: { type: 'boolean' },
  } });
  const port = proxyPort(values['proxy-port'] ?? process.env.PORTLESS_PORT);
  const proxyEnv = { ...process.env, PORTLESS_PORT: String(port) };
  if (values.help) process.stdout.write(help);
  else if (values.version) {
    const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${version}\n`);
  } else if (positionals[0] === 'setup') {
    if (positionals.length !== 1 || Object.keys(values).some(key => key !== 'proxy-port')) throw new Error('Usage: ui-harness setup [--proxy-port PORT]');
    await setupProxy(proxyEnv);
    process.stdout.write(`HTTPS proxy ready on port ${port}. Launch workspaces with --proxy-port ${port}.\n`);
  } else {
    if (positionals.length > 1) throw new Error('Pass one development URL. Use --help for usage.');
    const configPath = resolve(values.config || 'ui-harness.config.json');
    const name = workspaceName(configPath, values.name);
    if (process.env.UI_HARNESS_PORTLESS_CHILD !== '1') {
      // Validate the target before checking proxy readiness.
      const url = positionals[0] ?? JSON.parse(await readFile(configPath, 'utf8').catch(error => {
        if (error.code === 'ENOENT') throw new Error('Pass a development URL or use a saved workspace.', { cause: error });
        throw error;
      })).url;
      normalizeUrl(url);
      await requireProxy(proxyEnv);
      process.exitCode = await runPortless([
        name, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2),
      ], { ...proxyEnv, UI_HARNESS_PORTLESS_CHILD: '1', CI: '1' });
    } else {
      const connection = portlessConnection(proxyEnv);
      const harness = await startHarness({ url: positionals[0], configPath, ...connection });
      process.stdout.write(`UI harness: ${harness.origin}\nSettings: ${configPath}\nPress Ctrl+C to stop.\n`);
      showServer(harness, !values['no-open']);
    }
  }
} catch (error) {
  process.stderr.write(`UI harness: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
