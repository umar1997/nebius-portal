import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { TokenPayload, verifyAccessToken, hashToken } from '../lib/tokens';
import { requireAuth } from '../middleware/auth';

export type { TokenPayload };
export { verifyAccessToken };

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function issueTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' } as jwt.SignOptions
  );
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' } as jwt.SignOptions
  );
  return { accessToken, refreshToken };
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { name, email, password, confirmPassword } = req.body as Record<string, string>;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);

    db.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, name, email, password_hash);

    return res.status(201).json({ message: 'Account pending admin approval' });
  } catch (err) {
    console.error('[signup]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as Record<string, string>;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

    const dummyHash = '$2b$12$aaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const passwordMatch = await bcrypt.compare(password, user?.password_hash ?? dummyHash);

    if (!user || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Account rejected' });
    }

    const { accessToken, refreshToken } = issueTokens(user);
    const decoded = jwt.decode(refreshToken) as TokenPayload & { exp: number };
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), user.id, hashToken(refreshToken), expiresAt);

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────

router.post('/refresh', (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    let payload: TokenPayload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Admin tokens are validated by JWT signature alone — admin is never in DB.
    if (payload.role === 'superadmin' && payload.userId === 'admin') {
      const accessToken = jwt.sign(
        { userId: 'admin', email: payload.email, role: 'superadmin' },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' } as jwt.SignOptions
      );
      return res.json({ accessToken });
    }

    const row = db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
      .get(hashToken(refreshToken)) as RefreshTokenRow | undefined;

    if (!row) {
      return res.status(401).json({ error: 'Refresh token revoked' });
    }

    const user = db
      .prepare('SELECT id, email, role, status FROM users WHERE id = ?')
      .get(payload.userId) as Pick<User, 'id' | 'email' | 'role' | 'status'> | undefined;

    if (!user || user.status !== 'approved') {
      return res.status(401).json({ error: 'User not found or not approved' });
    }

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' } as jwt.SignOptions
    );

    return res.json({ accessToken });
  } catch (err) {
    console.error('[refresh]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(refreshToken));

    return res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('[logout]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const user = db
      .prepare('SELECT id, name, email, role, status, created_at FROM users WHERE id = ?')
      .get(req.user!.userId) as Omit<User, 'password_hash' | 'updated_at'> | undefined;

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
