import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { db, isoNow } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../utils/http.js';

export const AUTH_COOKIE = 'bongchat_token';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  coverUrl: string;
  isPrivate: boolean;
  theme: string;
  language: string;
  notificationPrefs: Record<string, boolean>;
  createdAt: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    expiresIn: `${config.sessionTtlHours}h`,
  });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionTtlHours * 3600_000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

async function loadUser(userId: number): Promise<AuthUser | undefined> {
  const row = await db('users').where({ id: userId }).first();
  if (!row) return undefined;
  const prefs =
    typeof row.notification_prefs === 'string'
      ? (JSON.parse(row.notification_prefs) as Record<string, boolean>)
      : {};
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    coverUrl: row.cover_url,
    isPrivate: row.is_private === true || row.is_private === 1,
    theme: row.theme,
    language: row.language,
    notificationPrefs: prefs,
    createdAt: row.created_at,
  };
}

export async function userFromToken(token: string): Promise<AuthUser | undefined> {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return undefined;
    return loadUser(userId);
  } catch {
    return undefined;
  }
}

/** Requires a valid session cookie. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE];
  const user = token ? await userFromToken(token) : undefined;
  if (!user) {
    next(new HttpError(401, 'You need to sign in to do that.'));
    return;
  }
  req.user = user;
  next();
}

/** Attaches req.user when a valid session exists, but never blocks the request. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE];
  if (token) {
    req.user = await userFromToken(token);
  }
  next();
}

export async function touchLastSeen(userId: number): Promise<void> {
  await db('users').where({ id: userId }).update({ last_seen_at: isoNow() });
}
