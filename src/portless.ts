import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { request } from 'node:https';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { readFile, access } from 'node:fs/promises';
import { PORTLESS_HEADER } from 'portless';

const portlessCli = fileURLToPath(new URL('./cli.js', import.meta.resolve('portless')));

export function workspaceName(configPath: string, name?: string): string {
  const directory = dirname(configPath);
  const slug = basename(directory).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,35) || 'project';
  const suffix = createHash('sha256').update(configPath).digest('hex').slice(0, 8);
  const result = name ?? `harness.${slug}-${suffix}`;
  if (result.length > 200 || !result.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Workspace name must contain lowercase letters, numbers, or hyphens, with optional dots between labels.');
  }
  return result;
}

export function proxyPort(value: string | undefined): number {
  if (value === undefined) return 443;
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('Proxy port must be a whole number between 1 and 65535.');
  }
  return Number(value);
}

export function portlessConnection(env: NodeJS.ProcessEnv): { port: number; publicOrigin: string } {
  let url: URL | undefined;
  try { url = new URL(env.PORTLESS_URL ?? ''); } catch { /* Report the same actionable error below. */ }
  if (!url || url.protocol !== 'https:' || Number(url.port || 443) !== proxyPort(env.PORTLESS_PORT) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The harness requires a portless HTTPS workspace. Run ui-harness setup to start Portless on the selected HTTPS port.');
  }
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Portless did not provide a valid internal listener. Restart ui-harness.');
  }
  return { port, publicOrigin: url.origin };
}

export async function runPortless(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const child = spawn(process.execPath, [portlessCli, ...args], {
    stdio: 'inherit',
    env: portlessEnvironment(env),
  });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    return await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)));
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

function portlessEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const port = proxyPort(env.PORTLESS_PORT);
  return {
    ...env, PORTLESS: '1', PORTLESS_HTTPS: '1', PORTLESS_PORT: String(port),
    // Pin discovery to this proxy: Portless otherwise prefers an existing proxy
    // on another port, even when PORTLESS_PORT is set.
    PORTLESS_STATE_DIR: env.PORTLESS_STATE_DIR || (port === 443
      ? join(homedir(), '.portless') : join(homedir(), '.portless', `ui-harness-${port}`)),
    PORTLESS_SYNC_HOSTS: '0',
  };
}

function proxyResponds(port: number): Promise<boolean> {
  return new Promise(resolve => {
    // Identity probe only. Browser verification must still validate TLS trust.
    const outgoing = request({ hostname: '127.0.0.1', port, method: 'HEAD',
      rejectUnauthorized: false, timeout: 1500 }, incoming => {
      incoming.resume();
      resolve(incoming.headers[PORTLESS_HEADER.toLowerCase()] === '1');
    });
    outgoing.on('error', () => resolve(false));
    outgoing.on('timeout', () => { outgoing.destroy(); resolve(false); });
    outgoing.end();
  });
}

function portIsListening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (listening: boolean) => { socket.destroy(); resolve(listening); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1500, () => finish(false));
  });
}

function setupCommand(port: number): string {
  return `ui-harness setup --proxy-port ${port}`;
}

export async function requireProxy(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const configured = portlessEnvironment(env);
  const port = proxyPort(configured.PORTLESS_PORT);
  if (!await proxyResponds(port)) {
    const occupied = await portIsListening(port);
    const alternative = port === 8443 ? 9443 : 8443;
    throw new Error(occupied
      ? `HTTPS proxy port ${port} is occupied by another server. Leave it running and use "${setupCommand(alternative)}", then launch with --proxy-port ${alternative}.`
      : `HTTPS proxy is not running on port ${port}. Run "${setupCommand(port)}" once in a terminal before starting agent sessions. Workspace launch does not perform administrator setup.`);
  }
  try {
    const directory = configured.PORTLESS_STATE_DIR!;
    const recorded = await readFile(join(directory, 'proxy.port'), 'utf8');
    if (Number(recorded.trim()) !== port) throw new Error('Port mismatch');
    await access(join(directory, 'proxy.tls'));
  } catch {
    throw new Error(`HTTPS proxy state does not match port ${port}. Use the same PORTLESS_STATE_DIR for setup and launch. Run "${setupCommand(port)}" in a terminal.`);
  }
}

async function ensureCertificateTrust(env: NodeJS.ProcessEnv): Promise<void> {
  // Read the system store in a fresh process: Node caches its CA list, so a
  // post-trust check in this process could still see the old store.
  const isTrusted = () => new Promise<boolean>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { X509Certificate } from 'node:crypto';
      import { getCACertificates } from 'node:tls';
      import { readFileSync } from 'node:fs';
      const fingerprint = new X509Certificate(readFileSync(process.argv[1])).fingerprint256;
      process.exit(getCACertificates('system').some(pem =>
        new X509Certificate(pem).fingerprint256 === fingerprint) ? 0 : 1);
    `, join(env.PORTLESS_STATE_DIR!, 'ca.pem')], { env, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0 || code === 1) resolve(code === 0);
      else reject(new Error('Could not check system certificate trust. Rerun setup in a terminal.'));
    });
  });
  if (await isTrusted()) return;
  const status = await runPortless(['trust'], env);
  if (status !== 0 || !await isTrusted()) {
    throw new Error('Certificate trust setup failed. Complete setup in an interactive terminal before using the workspace. No certificate trust is attempted during workspace launch.');
  }
}

export async function setupProxy(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const configured = portlessEnvironment(env);
  const port = proxyPort(configured.PORTLESS_PORT);
  if (await proxyResponds(port)) {
    await requireProxy(configured);
    await ensureCertificateTrust(configured);
    return;
  }
  if (await portIsListening(port)) {
    // Reuse the launch diagnostic without attempting elevation or takeover.
    await requireProxy(configured);
  }
  const status = await runPortless(['proxy', 'start', '--https', '--port', String(port)], configured);
  if (status !== 0) {
    throw new Error(`Portless setup failed. Run "${setupCommand(port)}" in a terminal. Ports 1024 and above avoid privileged binding; initial certificate trust may still require administrator approval.`);
  }
  await requireProxy(configured);
  await ensureCertificateTrust(configured);
}
