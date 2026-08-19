import { Router, Request, Response } from 'express';
import * as http from 'http';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { isHostAllowed } from '../allowlist';

const router = Router();

const APP_TYPES = ['react', 'gradio', 'other'] as const;
type AppType = (typeof APP_TYPES)[number];

type App = {
  id: string;
  name: string;
  host: string;
  port: number;
  type: AppType;
  description: string | null;
  created_at: string;
};

function validateFields(
  body: Record<string, unknown>,
  opts: { requireAll: boolean }
): string | null {
  const { name, host, port, type } = body;

  if (opts.requireAll && (!name || !host || !port || !type)) {
    return 'name, host, port, and type are required';
  }
  if (host !== undefined && !isHostAllowed(host as string)) {
    return `Host '${host}' is not in the allowed list`;
  }
  if (type !== undefined && !APP_TYPES.includes(type as AppType)) {
    return `type must be one of: ${APP_TYPES.join(', ')}`;
  }
  if (port !== undefined) {
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      return 'port must be an integer between 1 and 65535';
    }
  }
  return null;
}

// ── GET /api/apps ─────────────────────────────────────────────────────────────
// Users with role 'user' only see apps they have explicit permission to access.
// Admin and superadmin roles see all apps.

router.get('/', (req: Request, res: Response) => {
  try {
    let apps: App[];
    if (req.user?.role === 'user') {
      apps = db
        .prepare(`
          SELECT apps.* FROM apps
          INNER JOIN user_app_permissions ON apps.id = user_app_permissions.app_id
          WHERE user_app_permissions.user_id = ?
          ORDER BY apps.created_at DESC
        `)
        .all(req.user.userId) as App[];
    } else {
      apps = db.prepare('SELECT * FROM apps ORDER BY created_at DESC').all() as App[];
    }
    return res.json({ apps });
  } catch (err) {
    console.error('[apps/list]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/apps ────────────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const err = validateFields(body, { requireAll: true });
    if (err) return res.status(400).json({ error: err });

    const { name, host, port, type, description } = body;
    const id = uuidv4().replace(/-/g, '').slice(0, 8);

    db.prepare(
      'INSERT INTO apps (id, name, host, port, type, description) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, host, Number(port), type, (description as string) ?? null);

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as App;

    return res.status(201).json({
      app,
      rootPath: `/app/${id}`,
    });
  } catch (err) {
    console.error('[apps/create]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/apps/:id ─────────────────────────────────────────────────────────

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as App | undefined;
    if (!existing) return res.status(404).json({ error: 'App not found' });

    const body = req.body as Record<string, unknown>;
    const err = validateFields(body, { requireAll: false });
    if (err) return res.status(400).json({ error: err });

    const { name, host, port, type, description } = body;

    db.prepare(
      'UPDATE apps SET name=?, host=?, port=?, type=?, description=? WHERE id=?'
    ).run(
      name ?? existing.name,
      host ?? existing.host,
      port !== undefined ? Number(port) : existing.port,
      type ?? existing.type,
      description !== undefined ? description : existing.description,
      id
    );

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as App;
    return res.json({ app });
  } catch (err) {
    console.error('[apps/update]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/apps/:id ──────────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM apps WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'App not found' });
    return res.json({ message: 'App deleted' });
  } catch (err) {
    console.error('[apps/delete]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/apps/:id/health ──────────────────────────────────────────────────
// Must be registered before /:id to prevent 'health' matching as an id.

router.get('/:id/health', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const app = db
      .prepare('SELECT id, host, port FROM apps WHERE id = ?')
      .get(id) as Pick<App, 'id' | 'host' | 'port'> | undefined;

    if (!app) return res.status(404).json({ error: 'App not found' });

    const agent = new SocksProxyAgent(
      process.env.SOCKS_PROXY ?? 'socks5h://localhost:1080'
    );

    const probe = http.request(
      { hostname: app.host, port: app.port, path: '/', method: 'HEAD', agent, timeout: 5000 },
      (probeRes) => {
        probeRes.resume();
        res.json({ healthy: true, status: probeRes.statusCode, host: app.host, port: app.port });
      }
    );

    probe.on('timeout', () => {
      probe.destroy();
      res.json({ healthy: false, error: 'Timeout', host: app.host, port: app.port });
    });

    probe.on('error', (e) => {
      res.json({ healthy: false, error: e.message, host: app.host, port: app.port });
    });

    probe.end();
  } catch (err) {
    console.error('[apps/health]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
