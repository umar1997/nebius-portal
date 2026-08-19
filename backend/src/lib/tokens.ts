import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export type TokenPayload = {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
};

export function verifyTokenString(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyAccessToken(authHeader: string | undefined): TokenPayload | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyTokenString(authHeader.slice(7));
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
