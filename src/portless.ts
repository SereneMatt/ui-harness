import { createHash } from 'node:crypto';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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

export function portlessConnection(env: NodeJS.ProcessEnv): { port: number; publicOrigin: string } {
  let url: URL | undefined;
  try { url = new URL(env.PORTLESS_URL ?? ''); } catch { /* Report the same actionable error below. */ }
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The harness requires a portless HTTPS workspace. Run ui-harness setup to start Portless on its standard HTTPS port.');
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
    env: { ...env, PORTLESS: '1', PORTLESS_HTTPS: '1', PORTLESS_PORT: '443' },
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

export async function setupProxy(): Promise<void> {
  // An explicit standard port prevents Portless from falling back to a URL with a port.
  const status = await runPortless(['proxy', 'start', '--https', '--port', '443']);
  if (status !== 0) {
    throw new Error('Portless setup failed. Run "pnpx @serenematt/ui-harness setup" in a terminal and complete the administrator prompt.');
  }
}
