import { Request, Response, NextFunction } from 'express';
import { TokenPayload, verifyAccessToken, verifyTokenString } from '../lib/tokens';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function tokenFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).searchParams.get('token');
  } catch {
    return null;
  }
}

function sessionCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('nebius_session='));
  return entry ? entry.slice('nebius_session='.length) : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const queryToken   = typeof req.query.token === 'string' ? req.query.token : undefined;
  const cookieToken  = sessionCookieToken(req.headers.cookie);
  const refererToken = tokenFromReferer(req.headers.referer);

  const payload =
    verifyAccessToken(req.headers.authorization) ??
    (queryToken   ? verifyTokenString(queryToken)   : null) ??
    (cookieToken  ? verifyTokenString(cookieToken)  : null) ??
    (refererToken ? verifyTokenString(refererToken) : null);

  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.user = payload;

  if ((queryToken || refererToken) && req.originalUrl.startsWith('/app/')) {
    const token = queryToken ?? refererToken!;
    res.setHeader(
      'Set-Cookie',
      `nebius_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`
    );
  }

  next();
}

// Accepts both database admin-role users and the env-backed superadmin.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyAccessToken(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (payload.role !== 'superadmin' && payload.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: admin access required' });
    return;
  }
  req.user = payload;
  next();
}

// Only the env-backed superadmin may call routes protected by this middleware.
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyAccessToken(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (payload.role !== 'superadmin') {
    res.status(403).json({ error: 'Forbidden: superadmin access required' });
    return;
  }
  req.user = payload;
  next();
}
