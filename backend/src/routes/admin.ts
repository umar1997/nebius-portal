import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth';

const router = Router();

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
};

// ── POST /api/admin/login ────────────────────────────────────────────────────
// Credentials from env only — superadmin is never written to or read from DB.

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as Record<string, string>;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash  = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminHash) {
      console.error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set in env');
      return res.status(500).json({ error: 'Admin credentials not configured' });
    }

    const passwordMatch = await bcrypt.compare(password, adminHash);
    if (email !== adminEmail || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
      { userId: 'admin', email, role: 'superadmin' },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { userId: 'admin', email, role: 'superadmin' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' } as jwt.SignOptions
    );

    return res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error('[admin/login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────

router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  try {
    const users = db
      .prepare('SELECT id, name, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC')
      .all() as User[];
    return res.json({ users });
  } catch (err) {
    console.error('[admin/users]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/users/pending ─────────────────────────────────────────────
// Must be before /users/:id to prevent 'pending' matching :id.

router.get('/users/pending', requireAdmin, (_req: Request, res: Response) => {
  try {
    const users = db
      .prepare("SELECT id, name, email, role, status, created_at FROM users WHERE status = 'pending' ORDER BY created_at ASC")
      .all() as User[];
    return res.json({ users });
  } catch (err) {
    console.error('[admin/users/pending]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/users ────────────────────────────────────────────────────
// Create a user directly as approved. Password is set by the admin.
// Only superadmin may create admin-role users.

router.post('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body as Record<string, string>;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const targetRole = role === 'admin' ? 'admin' : 'user';

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'approved')"
    ).run(id, name, email, password_hash, targetRole);

    const user = db
      .prepare('SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    return res.status(201).json({ user });
  } catch (err) {
    console.error('[admin/create-user]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/admin/users/:id/approve ───────────────────────────────────────

router.patch('/users/:id/approve', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db
      .prepare("UPDATE users SET status = 'approved', updated_at = datetime('now') WHERE id = ?")
      .run(id);

    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });

    const user = db
      .prepare('SELECT id, name, email, role, status, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    return res.json({ user });
  } catch (err) {
    console.error('[admin/approve]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/admin/users/:id/reject ────────────────────────────────────────

router.patch('/users/:id/reject', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as Pick<User, 'id' | 'role'> | undefined;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin' && req.user!.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can reject admin users' });
    }

    const result = db
      .prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
      .run(id);

    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });

    const user = db
      .prepare('SELECT id, name, email, role, status, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    return res.json({ user });
  } catch (err) {
    console.error('[admin/reject]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/admin/users/:id/password ──────────────────────────────────────

router.patch('/users/:id/password', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body as Record<string, string>;

    if (!password) {
      return res.status(400).json({ error: 'password is required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as Pick<User, 'id' | 'role'> | undefined;
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin' && req.user!.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can change admin passwords' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(password_hash, id);

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('[admin/change-password]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
// Superadmin only. Can promote to 'admin' or demote to 'user'.

router.patch('/users/:id/role', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body as Record<string, string>;

    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: "role must be 'admin' or 'user'" });
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
      .run(role, id);

    const updated = db
      .prepare('SELECT id, name, email, role, status, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    return res.json({ user: updated });
  } catch (err) {
    console.error('[admin/change-role]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────

router.delete('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as Pick<User, 'id' | 'role'> | undefined;
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'admin' && req.user!.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can delete admin users' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('[admin/delete-user]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/users/:id/apps ────────────────────────────────────────────
// Returns the list of app IDs the user has been granted access to.

router.get('/users/:id/apps', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = db
      .prepare('SELECT app_id FROM user_app_permissions WHERE user_id = ?')
      .all(id) as { app_id: string }[];
    return res.json({ appIds: rows.map(r => r.app_id) });
  } catch (err) {
    console.error('[admin/user-apps/get]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/admin/users/:id/apps ────────────────────────────────────────────
// Replaces the full set of app permissions for a user.

router.put('/users/:id/apps', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { appIds } = req.body as { appIds?: string[] };

    if (!Array.isArray(appIds)) {
      return res.status(400).json({ error: 'appIds must be an array' });
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const replace = db.transaction((ids: string[]) => {
      db.prepare('DELETE FROM user_app_permissions WHERE user_id = ?').run(id);
      const insert = db.prepare(
        'INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_id) VALUES (?, ?, ?)'
      );
      for (const appId of ids) {
        insert.run(uuidv4(), id, appId);
      }
    });

    replace(appIds);

    return res.json({ appIds });
  } catch (err) {
    console.error('[admin/user-apps/set]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/notifications/count ───────────────────────────────────────

router.get('/notifications/count', requireAdmin, (_req: Request, res: Response) => {
  try {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE status = 'pending'")
      .get() as { count: number };
    return res.json({ pendingCount: row.count });
  } catch (err) {
    console.error('[admin/notifications/count]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
