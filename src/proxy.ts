import { request as httpRequest, type IncomingMessage, type ServerResponse, type OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { getCACertificates } from 'node:tls';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import type { Duplex } from 'node:stream';

// Same-origin mode: the harness forwards every path outside its reserved prefix to
// the target, so previews and the workspace share one origin.
export const workspacePath = '/__ui-harness';

export interface TargetProxy {
  web(request: IncomingMessage, response: ServerResponse): void;
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
}

const hopByHop = new Set(['connection', 'keep-alive', 'proxy-connection', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'http2-settings']);

// RFC 6761: *.localhost is loopback. Node's resolver does not guarantee that, and Portless targets use it.
function lookup(hostname: string, options: object, callback: (...args: any[]) => void) {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    const address: LookupAddress = { address: '127.0.0.1', family: 4 };
    return (options as { all?: boolean }).all ? callback(null, [address]) : callback(null, address.address, address.family);
  }
  return dnsLookup(hostname, options, callback);
}

// Rewrites only `frame-ancestors`; other directives pass through.
export function allowSameOriginFraming(policy: string): string {
  return policy.split(';').map(directive => /^\s*frame-ancestors(\s|$)/i.test(directive) ? " frame-ancestors 'self'" : directive)
    .join(';').trim();
}

export function createTargetProxy(target: URL, workspaceOrigin: () => string, allowFraming: boolean): TargetProxy {
  const secure = target.protocol === 'https:';
  const send = secure ? httpsRequest : httpRequest;
  // Trust the system store too, so a Portless HTTPS target with a locally trusted CA works.
  const tls = secure ? { servername: target.hostname, ca: [...getCACertificates('default'), ...getCACertificates('system')] } : {};
  const connection = { protocol: target.protocol, hostname: target.hostname, port: target.port || (secure ? 443 : 80), lookup, ...tls };

  function requestHeaders(request: IncomingMessage, keepUpgrade: boolean): OutgoingHttpHeaders {
    const origin = workspaceOrigin();
    const headers: OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(request.headersDistinct)) {
      if (!value || name.startsWith(':') || (!keepUpgrade && hopByHop.has(name))) continue;
      headers[name] = value.length === 1 ? value[0] : value;
    }
    headers.host = target.host;
    for (const name of ['origin', 'referer']) {
      const value = headers[name];
      if (typeof value === 'string' && (value === origin || value.startsWith(`${origin}/`))) headers[name] = target.origin + value.slice(origin.length);
    }
    return headers;
  }

  function responseHeaders(incoming: IncomingMessage): OutgoingHttpHeaders {
    const origin = workspaceOrigin();
    const headers: OutgoingHttpHeaders = {};
    for (const [name, values] of Object.entries(incoming.headersDistinct)) {
      if (!values || hopByHop.has(name)) continue;
      let list = values;
      if (name === 'location') list = list.map(value => value === target.origin || value.startsWith(`${target.origin}/`) ? origin + value.slice(target.origin.length) : value);
      // Cookies set for the target host become host-only cookies on the workspace host.
      if (name === 'set-cookie') list = list.map(value => value.replace(/;\s*domain=[^;]*/gi, ''));
      if (allowFraming && name === 'x-frame-options') list = ['SAMEORIGIN'];
      if (allowFraming && (name === 'content-security-policy' || name === 'content-security-policy-report-only')) list = list.map(allowSameOriginFraming);
      headers[name] = name === 'set-cookie' || list.length > 1 ? list : list[0];
    }
    return headers;
  }

  return {
    web(request, response) {
      const outgoing = send({ ...connection, method: request.method, path: request.url, headers: requestHeaders(request, false) }, incoming => {
        response.writeHead(incoming.statusCode ?? 502, incoming.statusMessage, responseHeaders(incoming));
        incoming.pipe(response);
      });
      outgoing.on('error', error => {
        if (response.headersSent) return response.destroy(error);
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(`UI harness could not reach ${target.origin}: ${error.message}\n`);
      });
      request.pipe(outgoing);
    },
    // WebSocket and other upgrades (for example Vite or Next.js HMR) are piped through unchanged.
    upgrade(request, socket, head) {
      const outgoing = send({ ...connection, method: request.method, path: request.url, headers: requestHeaders(request, true) });
      outgoing.on('upgrade', (incoming, upstream, upstreamHead) => {
        const lines = [`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}`];
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) lines.push(`${incoming.rawHeaders[index]}: ${incoming.rawHeaders[index + 1]}`);
        socket.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (upstreamHead.length) socket.write(upstreamHead);
        if (head.length) upstream.write(head);
        upstream.pipe(socket).pipe(upstream);
        upstream.on('error', () => socket.destroy());
        socket.on('error', () => upstream.destroy());
      });
      outgoing.on('response', incoming => {
        socket.end(`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\nConnection: close\r\n\r\n`);
        incoming.resume();
      });
      outgoing.on('error', () => socket.destroy());
      outgoing.end();
    },
  };
}
