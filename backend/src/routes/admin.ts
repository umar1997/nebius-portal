import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db';
import { TokenPayload } from '../lib/tokens';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

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
// Credentials from env only — admin is never written to or read from the DB.

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as Record<string, string>;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminHash) {
      console.error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set in env');
      return res.status(500).json({ error: 'Admin credentials not configured' });
    }

    // Always run bcrypt regardless of email match to prevent timing attacks
    const passwordMatch = await bcrypt.compare(password, adminHash);
    if (email !== adminEmail || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
      { userId: 'admin', email, role: 'superadmin' },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' } as jwt.SignOptions
    );

    // Admin refresh token — signed but NOT stored in DB.
    // Refresh flow validates by JWT signature alone (see POST /api/auth/refresh).
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
      .prepare(
        'SELECT id, name, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC'
      )
      .all() as User[];
    return res.json({ users });
  } catch (err) {
    console.error('[admin/users]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/users/pending ─────────────────────────────────────────────
// Must be registered before /users/:id to prevent 'pending' matching :id.

router.get('/users/pending', requireAdmin, (_req: Request, res: Response) => {
  try {
    const users = db
      .prepare(
        "SELECT id, name, email, role, status, created_at FROM users WHERE status = 'pending' ORDER BY created_at ASC"
      )
      .all() as User[];
    return res.json({ users });
  } catch (err) {
    console.error('[admin/users/pending]', err);
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

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

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
    const result = db
      .prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = db
      .prepare('SELECT id, name, email, role, status, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    return res.json({ user });
  } catch (err) {
    console.error('[admin/reject]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────

router.delete('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('[admin/delete-user]', err);
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
