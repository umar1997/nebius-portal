import * as http from 'http';
import * as net from 'net';
import httpProxy from 'http-proxy';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Request, Response } from 'express';
import db from './db';

type AppRow = { id: string; host: string; port: number };

// One agent for the lifetime of the process — socks5h:// = remote DNS on login node.
const socksAgent = new SocksProxyAgent(
  process.env.SOCKS_PROXY ?? 'socks5h://localhost:1080'
);

export const proxy = httpProxy.createProxyServer({ agent: socksAgent });

proxy.on('error', (err, _req, res) => {
  console.error('[proxy error]', err.message);
  const r = res as http.ServerResponse;
  if (!r.headersSent) {
    r.writeHead(502, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ error: 'Bad gateway — app unreachable via SOCKS tunnel' }));
  }
});

function lookupApp(id: string): AppRow | undefined {
  return db.prepare('SELECT id, host, port FROM apps WHERE id = ?').get(id) as AppRow | undefined;
}

// Build the URL to forward to the worker.
//
// Gradio with root_path="/app/<id>" mounts its page and API routes at the
// full prefixed path (e.g. /app/<id>/queue/join). Those go through unchanged.
//
// However, Gradio generates HTML asset tags with bare absolute paths
// (src="/assets/index.js" instead of src="/app/<id>/assets/index.js").
// nginx's sub_filter makes them relative so the browser requests
// /app/<id>/assets/index.js — but Gradio only serves assets at /assets/...
// So for asset paths only, we strip the /app/<id> prefix before forwarding.
function buildProxyUrl(url: string, appId: string): string {
  const prefix = `/app/${appId}`;
  if (!url.startsWith(prefix)) return url;

  const subPath = url.slice(prefix.length) || '/';

  if (subPath.startsWith('/assets/') || subPath.startsWith('/static/') || subPath.startsWith('/file=')) {
    return subPath;
  }

  return url;
}

// ── HTTP proxy ────────────────────────────────────────────────────────────────

export function proxyRequest(req: Request, res: Response): void {
  const appId = req.originalUrl.split('/')[2];

  if (!appId) {
    res.status(400).json({ error: 'Missing app ID' });
    return;
  }

  const app = lookupApp(appId);
  if (!app) {
    res.status(404).json({ error: 'App not found' });
    return;
  }

  req.url = buildProxyUrl(req.originalUrl, appId);

  proxy.web(req, res, {
    target: `http://${app.host}:${app.port}`,
    changeOrigin: true,
  });
}

// ── WebSocket proxy ───────────────────────────────────────────────────────────
// Called from the raw http.Server 'upgrade' event in index.ts.

export function proxyWebSocket(
  req: http.IncomingMessage,
  socket: net.Socket,
  head: Buffer
): void {
  const appId = req.url?.split('/')[2];

  if (!appId) {
    socket.destroy();
    return;
  }

  const app = lookupApp(appId);
  if (!app) {
    socket.destroy();
    return;
  }

  if (req.url) req.url = buildProxyUrl(req.url, appId);

  proxy.ws(req, socket, head, {
    target: `http://${app.host}:${app.port}`,
    changeOrigin: true,
  });
}
