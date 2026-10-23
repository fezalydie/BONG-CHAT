import { Router } from 'express';
import { z } from 'zod';
import { db, isoNow } from '../db.js';
import { asyncHandler, HttpError, likeQuery, ok, bool } from '../utils/http.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { blockedIds, canViewContent, mapUser, viewerFlags } from '../utils/users.js';
import { notify } from '../services/notify.js';

export const usersRouter = Router();

/** Update the signed-in user's profile. */
usersRouter.put(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(40).optional(),
        bio: z.string().trim().max(300).optional(),
        avatarUrl: z.string().trim().max(500).optional(),
        coverUrl: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.displayName !== undefined) patch.display_name = body.displayName;
    if (body.bio !== undefined) patch.bio = body.bio;
    if (body.avatarUrl !== undefined) patch.avatar_url = body.avatarUrl;
    if (body.coverUrl !== undefined) patch.cover_url = body.coverUrl;
    if (Object.keys(patch).length > 0) {
      await db('users').where({ id: req.user!.id }).update(patch);
    }
    const row = await db('users').where({ id: req.user!.id }).first();
    ok(res, { user: mapUser(row), email: row.email });
  }),
);

/** Signed-in user's account summary used by the settings pages. */
usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await db('users').where({ id: req.user!.id }).first();
    const [posts, followers, following] = await Promise.all([
      db('posts').where({ user_id: row.id }).count('* as c').first(),
      db('follows').where({ follow_id: row.id, status: 'accepted' }).count('* as c').first(),
      db('follows').where({ follower_id: row.id, status: 'accepted' }).count('* as c').first(),
    ]);
    ok(res, {
      user: {
        ...mapUser(row),
        email: row.email,
        theme: row.theme,
        language: row.language,
        notificationPrefs: JSON.parse(row.notification_prefs),
      },
      stats: {
        posts: Number((posts as any)?.c ?? 0),
        followers: Number((followers as any)?.c ?? 0),
        following: Number((following as any)?.c ?? 0),
      },
    });
  }),
);

/** People the viewer might want to follow. */
usersRouter.get(
  '/suggestions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const hidden = await blockedIds(req.user!.id);
    const rows = await db('users')
      .whereNotIn('id', [req.user!.id, ...hidden])
      .orderByRaw('RANDOM()')
      .limit(6);
    ok(res, { users: rows.map(mapUser) });
  }),
);

/** Blocked list for the settings page. */
usersRouter.get(
  '/blocked',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db('blocks')
      .join('users', 'users.id', 'blocks.blocked_id')
      .where('blocks.blocker_id', req.user!.id)
      .select('users.*');
    ok(res, { users: rows.map(mapUser) });
  }),
);

/** Incoming follow requests waiting for the signed-in (private) account. */
usersRouter.get(
  '/requests',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db('follows as f')
      .join('users as u', 'u.id', 'f.follower_id')
      .where({ 'f.follow_id': req.user!.id, 'f.status': 'pending' })
      .select('u.*', 'f.created_at as requested_at')
      .orderBy('f.created_at', 'desc');
    ok(res, {
      requests: rows.map((row: any) => ({
        user: mapUser(row),
        requestedAt: row.requested_at,
      })),
    });
  }),
);

/** Public profile. */
usersRouter.get(
  '/:username',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const row = await db('users').where({ username: req.params.username }).first();
    if (!row) throw new HttpError(404, 'User not found.');
    const flags = await viewerFlags(req.user?.id, row.id);
    if (flags.isBlocked) throw new HttpError(403, 'You cannot view this profile.');
    const visible = await canViewContent(req.user?.id, row.id);
    const [posts, followers, following] = await Promise.all([
      db('posts').where({ user_id: row.id }).count('* as c').first(),
      db('follows').where({ follow_id: row.id, status: 'accepted' }).count('* as c').first(),
      db('follows').where({ follower_id: row.id, status: 'accepted' }).count('* as c').first(),
    ]);
    const [followRequest, pendingRequest] = await Promise.all([
      req.user?.id
        ? db('follows').where({ follower_id: req.user.id, follow_id: row.id }).first()
        : undefined,
      req.user?.id
        ? db('follows')
            .where({ follower_id: row.id, follow_id: req.user.id, status: 'accepted' })
            .first()
        : undefined,
    ]);
    const outgoingAccepted = Boolean(followRequest) && followRequest.status === 'accepted';
    const outgoingPending = Boolean(followRequest) && followRequest.status === 'pending';
    ok(res, {
      user: mapUser(row),
      stats: {
        posts: visible ? Number((posts as any)?.c ?? 0) : 0,
        followers: Number((followers as any)?.c ?? 0),
        following: Number((following as any)?.c ?? 0),
      },
      viewer: {
        isMe: flags.isMe,
        isFollowing: outgoingAccepted,
        isRequested: outgoingPending,
        isFollowedBy: Boolean(pendingRequest),
        isBlocked: flags.isBlocked,
        canViewContent: visible,
      },
    });
  }),
);

/** Follow / unfollow. Following a private account sends a request instead. */
usersRouter.post(
  '/:username/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const target = await db('users').where({ username: req.params.username }).first();
    if (!target) throw new HttpError(404, 'User not found.');
    if (target.id === req.user!.id) throw new HttpError(400, 'You cannot follow yourself.');
    const existing = await db('follows')
      .where({ follower_id: req.user!.id, follow_id: target.id })
      .first();

    // Toggle off: unfollow an accepted follow, or cancel a pending request.
    if (existing) {
      await db('follows').where({ id: existing.id }).del();
    } else {
      const needsApproval = bool(target.is_private);
      await db('follows').insert({
        follower_id: req.user!.id,
        follow_id: target.id,
        status: needsApproval ? 'pending' : 'accepted',
        created_at: isoNow(),
      });
      if (needsApproval) {
        await notify({
          userId: target.id,
          actorId: req.user!.id,
          type: 'follow_request',
          link: `/profile/${req.user!.username}`,
        });
      } else {
        await notify({
          userId: target.id,
          actorId: req.user!.id,
          type: 'follow',
          link: `/profile/${req.user!.username}`,
        });
      }
    }

    const followers = await db('follows')
      .where({ follow_id: target.id, status: 'accepted' })
      .count('* as c')
      .first();
    ok(res, {
      following: !existing && !bool(target.is_private),
      requested: !existing && bool(target.is_private),
      followers: Number((followers as any)?.c ?? 0),
    });
  }),
);

/** Approve a pending follow request addressed to the signed-in user. */
usersRouter.post(
  '/requests/:username/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requester = await db('users').where({ username: req.params.username }).first();
    if (!requester) throw new HttpError(404, 'User not found.');
    const request = await db('follows')
      .where({ follower_id: requester.id, follow_id: req.user!.id, status: 'pending' })
      .first();
    if (!request) throw new HttpError(404, 'No pending request from this user.');
    await db('follows').where({ id: request.id }).update({ status: 'accepted' });
    await notify({
      userId: requester.id,
      actorId: req.user!.id,
      type: 'follow_accepted',
      link: `/profile/${req.user!.username}`,
    });
    const followers = await db('follows')
      .where({ follow_id: req.user!.id, status: 'accepted' })
      .count('* as c')
      .first();
    ok(res, { accepted: true, followers: Number((followers as any)?.c ?? 0) });
  }),
);

/** Decline (delete) a pending follow request addressed to the signed-in user. */
usersRouter.post(
  '/requests/:username/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requester = await db('users').where({ username: req.params.username }).first();
    if (!requester) throw new HttpError(404, 'User not found.');
    const deleted = await db('follows')
      .where({ follower_id: requester.id, follow_id: req.user!.id, status: 'pending' })
      .del();
    ok(res, { rejected: deleted > 0 });
  }),
);

/** Block / unblock. Blocking hides both users from each other. */
usersRouter.post(
  '/:username/block',
  requireAuth,
  asyncHandler(async (req, res) => {
    const target = await db('users').where({ username: req.params.username }).first();
    if (!target) throw new HttpError(404, 'User not found.');
    if (target.id === req.user!.id) throw new HttpError(400, 'You cannot block yourself.');
    const existing = await db('blocks')
      .where({ blocker_id: req.user!.id, blocked_id: target.id })
      .first();
    if (existing) {
      await db('blocks').where({ id: existing.id }).del();
    } else {
      await db('blocks').insert({
        blocker_id: req.user!.id,
        blocked_id: target.id,
        created_at: isoNow(),
      });
      // Blocking also removes any follow relationship in both directions.
      await db('follows')
        .where({ follower_id: req.user!.id, follow_id: target.id })
        .orWhere({ follower_id: target.id, follow_id: req.user!.id })
        .del();
    }
    ok(res, { blocked: !existing });
  }),
);

/** Follower / following lists (used on the profile page). */
usersRouter.get(
  '/:username/followers',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const target = await db('users').where({ username: req.params.username }).first();
    if (!target) throw new HttpError(404, 'User not found.');
    if (!(await canViewContent(req.user?.id, target.id))) {
      throw new HttpError(403, 'This account is private.');
    }
    const rows = await db('follows')
      .join('users', 'users.id', 'follows.follower_id')
      .where('follows.follow_id', target.id)
      .where('follows.status', 'accepted')
      .select('users.*')
      .limit(100);
    ok(res, { users: rows.map(mapUser) });
  }),
);

usersRouter.get(
  '/:username/following',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const target = await db('users').where({ username: req.params.username }).first();
    if (!target) throw new HttpError(404, 'User not found.');
    if (!(await canViewContent(req.user?.id, target.id))) {
      throw new HttpError(403, 'This account is private.');
    }
    const rows = await db('follows')
      .join('users', 'users.id', 'follows.follow_id')
      .where('follows.follower_id', target.id)
      .where('follows.status', 'accepted')
      .select('users.*')
      .limit(100);
    ok(res, { users: rows.map(mapUser) });
  }),
);

/** Delete the signed-in account (settings → account). */
usersRouter.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
    const row = await db('users').where({ id: req.user!.id }).first();
    const valid = await bcryptCompare(password, row.password_hash);
    if (!valid) throw new HttpError(400, 'Your password is incorrect.');
    await db('users').where({ id: req.user!.id }).del();
    res.clearCookie('bongchat_token', { path: '/' });
    ok(res, { success: true });
  }),
);

async function bcryptCompare(plain: string, hash: string): Promise<boolean> {
  const bcrypt = (await import('bcryptjs')).default;
  return bcrypt.compare(plain, hash);
}
