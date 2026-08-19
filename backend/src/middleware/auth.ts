import { Request, Response, NextFunction } from 'express';
import { TokenPayload, verifyAccessToken, verifyTokenString } from '../lib/tokens';

// Extend Express Request so req.user is available in protected handlers.
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
  // Token sources (checked in order):
  //   1. Authorization: Bearer — regular API calls from the React portal
  //   2. ?token= query param  — initial /app/:id/?token= page open
  //   3. nebius_session cookie — subsequent in-app navigation after first load
  //   4. Referer ?token=       — asset/script loads triggered by the initial page
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

  // On the first authenticated /app/ request (token from URL or Referer), set
  // a short-lived HttpOnly cookie so subsequent in-app navigations and API
  // calls are authenticated without the token being in every URL.
  if ((queryToken || refererToken) && req.originalUrl.startsWith('/app/')) {
    const token = queryToken ?? refererToken!;
    res.setHeader(
      'Set-Cookie',
      `nebius_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`
    );
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyAccessToken(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (payload.role !== 'superadmin') {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }
  req.user = payload;
  next();
}
