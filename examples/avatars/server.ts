import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const origin = new URL(process.env.PORTLESS_URL ?? 'https://avatars.localhost');
const port = Number(process.env.PORT);
if (origin.protocol !== 'https:' || origin.port || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Run pnpm example to start the demo through Portless.');
}
const html = await readFile(new URL('../examples/avatars/index.html', import.meta.url));
const server = createServer((request, response) => {
  if (request.headers.host !== origin.host) {
    response.writeHead(403).end('Use the example URL printed below.');
    return;
  }
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
});
server.listen(port, '127.0.0.1', () => console.log(`Animal avatars: ${origin.origin}`));
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
