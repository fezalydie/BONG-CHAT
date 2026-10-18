import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, isoNow, isoInHours } from '../db.js';
import { asyncHandler, HttpError, ok } from '../utils/http.js';
import {
  clearAuthCookie,
  requireAuth,
  setAuthCookie,
  signToken,
  touchLastSeen,
  type AuthUser,
} from '../middleware/auth.js';
import { config } from '../config.js';
import { mapUser } from '../utils/users.js';
import { unreadNotificationCount } from '../services/notify.js';

export const authRouter = Router();

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(20, 'Username must be at most 20 characters.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers and underscores.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  displayName: z.string().trim().min(1).max(40).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(128),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email.'),
  password: z.string().min(1, 'Enter your password.'),
});

function publicPayload(user: AuthUser) {
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      coverUrl: user.coverUrl,
      isPrivate: user.isPrivate,
      theme: user.theme,
      language: user.language,
      notificationPrefs: user.notificationPrefs,
      createdAt: user.createdAt,
    },
  };
}

async function sessionPayload(user: AuthUser) {
  const unread = await unreadNotificationCount(user.id);
  return { ...publicPayload(user), unreadNotifications: unread };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await db('users')
      .where({ username: body.username })
      .orWhere({ email: body.email })
      .first();
    if (existing) {
      throw new HttpError(409, 'That username or email is already registered.');
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const [inserted] = await db('users')
      .insert({
        username: body.username,
        email: body.email,
        password_hash: passwordHash,
        display_name: body.displayName || body.username,
        created_at: isoNow(),
      })
      .returning('id');
    const newUserId = typeof inserted === 'object' ? (inserted as any).id : inserted;
    const row = await db('users').where({ id: newUserId }).first();
    const user: AuthUser = {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      coverUrl: row.cover_url,
      isPrivate: false,
      theme: row.theme,
      language: row.language,
      notificationPrefs: JSON.parse(row.notification_prefs),
      createdAt: row.created_at,
    };
    setAuthCookie(res, signToken(user.id));
    await touchLastSeen(user.id);
    ok(res, await sessionPayload(user), 201);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const row = await db('users')
      .where({ username: body.identifier })
      .orWhere({ email: body.identifier })
      .first();
    const valid = row ? await bcrypt.compare(body.password, row.password_hash) : false;
    if (!row || !valid) {
      throw new HttpError(401, 'Incorrect username/email or password.');
    }
    const user: AuthUser = {
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
      notificationPrefs: JSON.parse(row.notification_prefs),
      createdAt: row.created_at,
    };
    setAuthCookie(res, signToken(user.id));
    await touchLastSeen(user.id);
    ok(res, await sessionPayload(user));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    clearAuthCookie(res);
    ok(res, { success: true });
  }),
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.bongchat_token;
    if (!token) {
      ok(res, { user: null });
      return;
    }
    const { userFromToken } = await import('../middleware/auth.js');
    const user = await userFromToken(token);
    if (!user) {
      ok(res, { user: null });
      return;
    }
    ok(res, await sessionPayload(user));
  }),
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const row = await db('users').where({ email }).first();
    // Always answer 200 so the endpoint cannot be used to probe for accounts.
    if (!row) {
      ok(res, { success: true, message: 'If that email exists, a reset link has been generated.' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db('password_resets').where({ user_id: row.id }).del();
    await db('password_resets').insert({
      user_id: row.id,
      token_hash: tokenHash,
      expires_at: isoInHours(1),
      created_at: isoNow(),
    });
    const resetUrl = `${config.webOrigin}/reset-password?token=${token}`;
    // No SMTP server is configured by default, so the link is printed to the
    // server console and returned in development. Add any mail provider in
    // production and replace this block with a real email delivery call.
    console.log(`[auth] Password reset for ${email}: ${resetUrl}`);
    ok(res, {
      success: true,
      message: 'If that email exists, a reset link has been generated.',
      resetUrl: config.isProd ? undefined : resetUrl,
    });
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ token: z.string().min(10), password: z.string().min(6).max(128) })
      .parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
    const reset = await db('password_resets').where({ token_hash: tokenHash }).first();
    if (!reset || reset.used || reset.expires_at < isoNow()) {
      throw new HttpError(400, 'This reset link is invalid or has expired.');
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    await db('users').where({ id: reset.user_id }).update({ password_hash: passwordHash });
    await db('password_resets').where({ id: reset.id }).update({ used: true });
    ok(res, { success: true, message: 'Password updated. You can sign in now.' });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(6).max(128) })
      .parse(req.body);
    const row = await db('users').where({ id: req.user!.id }).first();
    const valid = await bcrypt.compare(body.currentPassword, row.password_hash);
    if (!valid) throw new HttpError(400, 'Your current password is incorrect.');
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await db('users').where({ id: req.user!.id }).update({ password_hash: passwordHash });
    ok(res, { success: true, message: 'Password changed.' });
  }),
);
