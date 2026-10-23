import { Router } from 'express';
import { z } from 'zod';
import { db, isoNow } from '../db.js';
import { asyncHandler, HttpError, ok } from '../utils/http.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { canViewContent, feedAuthorIds, mapAuthor } from '../utils/users.js';
import { notify } from '../services/notify.js';

export const reelsRouter = Router();

/** Reels are tall videos, so the feed pages in smaller chunks than posts. */
const PAGE_SIZE = 6;

interface ReelShape {
  id: number;
  videoUrl: string;
  caption: string;
  views: number;
  createdAt: string;
  author: ReturnType<typeof mapAuthor>;
  likes: number;
  comments: number;
  likedByMe: boolean;
}

const reelColumns = [
  'r.id',
  'r.video_url',
  'r.caption',
  'r.views',
  'r.created_at',
  'r.user_id',
  'u.id as uid',
  'u.username',
  'u.display_name',
  'u.avatar_url',
  'u.bio',
  'u.is_private',
  'u.created_at as u_created_at',
];

async function decorateReels(rows: Record<string, any>[], viewerId: number | undefined): Promise<ReelShape[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [likes, comments, myLikes] = await Promise.all([
    db('reel_likes').whereIn('reel_id', ids).groupBy('reel_id').select('reel_id', db.raw('COUNT(*) as c')),
    db('reel_comments').whereIn('reel_id', ids).groupBy('reel_id').select('reel_id', db.raw('COUNT(*) as c')),
    viewerId
      ? db('reel_likes').whereIn('reel_id', ids).where({ user_id: viewerId })
      : Promise.resolve([] as Record<string, any>[]),
  ]);
  const count = (list: Record<string, any>[]) => new Map(list.map((row) => [row.reel_id, Number(row.c)]));
  const likeMap = count(likes);
  const commentMap = count(comments);
  const likedSet = new Set(myLikes.map((row: any) => row.reel_id));

  return rows.map((row) => ({
    id: row.id,
    videoUrl: row.video_url,
    caption: row.caption,
    views: Number(row.views ?? 0),
    createdAt: row.created_at,
    author: mapAuthor(row),
    likes: likeMap.get(row.id) ?? 0,
    comments: commentMap.get(row.id) ?? 0,
    likedByMe: likedSet.has(row.id),
  }));
}

async function loadReel(id: number): Promise<Record<string, any> | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return db('reels as r')
    .join('users as u', 'u.id', 'r.user_id')
    .where('r.id', id)
    .select(reelColumns)
    .first();
}

async function requireVisibleReel(id: number, viewerId: number | undefined): Promise<Record<string, any>> {
  const reel = await loadReel(id);
  if (!reel) throw new HttpError(404, 'Reel not found.');
  if (!(await canViewContent(viewerId, reel.user_id))) {
    throw new HttpError(403, 'This account is private. Follow to see their reels.');
  }
  return reel;
}

/** Feed of short videos from you and the accounts you follow (public only when anonymous). */
reelsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id;
    const username = typeof req.query.username === 'string' ? req.query.username : undefined;
    const page = Math.max(0, Number(req.query.page ?? 0) || 0);
    // Profile grids ask for a larger page; the player sticks to the default.
    const take = Math.min(30, Math.max(1, Number(req.query.limit ?? PAGE_SIZE) || PAGE_SIZE));

    let authorIds: number[];
    if (username) {
      const target = await db('users').where({ username }).first();
      if (!target) throw new HttpError(404, 'User not found.');
      if (!(await canViewContent(viewerId, target.id))) {
        throw new HttpError(403, 'This account is private. Follow to see their reels.');
      }
      authorIds = [target.id];
    } else if (viewerId) {
      authorIds = await feedAuthorIds(viewerId);
    } else {
      const all = await db('users').where({ is_private: false }).select('id');
      authorIds = all.map((u) => u.id);
    }

    if (authorIds.length === 0) {
      ok(res, { items: [], hasMore: false });
      return;
    }

    const rows = await db('reels as r')
      .join('users as u', 'u.id', 'r.user_id')
      .whereIn('r.user_id', authorIds)
      .select(reelColumns)
      .orderBy('r.created_at', 'desc')
      .orderBy('r.id', 'desc')
      .limit(take + 1)
      .offset(page * take);

    const hasMore = rows.length > take;
    const items = await decorateReels(rows.slice(0, take), viewerId);
    ok(res, { items, hasMore });
  }),
);

const createReelSchema = z.object({
  videoUrl: z.string().trim().min(1, 'A reel needs a video.').max(500),
  caption: z.string().trim().max(300, 'Captions are limited to 300 characters.').optional().default(''),
});

reelsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createReelSchema.parse(req.body);
    const [id] = await db('reels')
      .insert({
        user_id: req.user!.id,
        video_url: body.videoUrl,
        caption: body.caption,
        created_at: isoNow(),
      })
      .returning('id');
    const row = await loadReel(typeof id === 'object' ? (id as any).id : Number(id));
    const [reel] = await decorateReels(row ? [row] : [], req.user!.id);
    ok(res, { reel }, 201);
  }),
);

reelsRouter.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const row = await requireVisibleReel(Number(req.params.id), req.user?.id);
    const [reel] = await decorateReels([row], req.user?.id);
    ok(res, { reel });
  }),
);

reelsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = await loadReel(id);
    if (!row) throw new HttpError(404, 'Reel not found.');
    if (row.user_id !== req.user!.id) throw new HttpError(403, 'You can only delete your own reels.');
    await db('reels').where({ id }).del();
    ok(res, { deleted: true });
  }),
);

reelsRouter.post(
  '/:id/like',
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.user!.id;
    const row = await requireVisibleReel(Number(req.params.id), viewerId);
    const existing = await db('reel_likes').where({ reel_id: row.id, user_id: viewerId }).first();

    if (existing) {
      await db('reel_likes').where({ reel_id: row.id, user_id: viewerId }).del();
    } else {
      await db('reel_likes').insert({ reel_id: row.id, user_id: viewerId, created_at: isoNow() });
      await notify({
        userId: row.user_id,
        actorId: viewerId,
        type: 'like',
        entityId: row.id,
        link: `/reels?username=${encodeURIComponent(row.username)}`,
        data: { reelId: row.id },
      });
    }

    const likes = await db('reel_likes').where({ reel_id: row.id }).count('* as c').first();
    ok(res, { liked: !existing, likes: Number((likes as any)?.c ?? 0) });
  }),
);

reelsRouter.post(
  '/:id/view',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id;
    const row = await requireVisibleReel(Number(req.params.id), viewerId);
    if (!viewerId) {
      ok(res, { views: Number(row.views ?? 0) });
      return;
    }
    const seen = await db('reel_views').where({ reel_id: row.id, user_id: viewerId }).first();
    if (!seen) {
      await db('reel_views').insert({ reel_id: row.id, user_id: viewerId, created_at: isoNow() });
      await db('reels').where({ id: row.id }).increment('views', 1);
    }
    const fresh = await db('reels').where({ id: row.id }).first();
    ok(res, { views: Number(fresh?.views ?? 0) });
  }),
);

const commentSchema = z.object({
  content: z.string().trim().min(1, 'Write a comment first.').max(500, 'Comments are limited to 500 characters.'),
});

reelsRouter.get(
  '/:id/comments',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const row = await requireVisibleReel(Number(req.params.id), req.user?.id);
    const rows = await db('reel_comments as c')
      .join('users as u', 'u.id', 'c.user_id')
      .where('c.reel_id', row.id)
      .select(
        'c.id',
        'c.content',
        'c.created_at',
        'c.user_id',
        'u.id as uid',
        'u.username',
        'u.display_name',
        'u.avatar_url',
        'u.bio',
        'u.is_private',
        'u.created_at as u_created_at',
      )
      .orderBy('c.created_at', 'asc')
      .orderBy('c.id', 'asc');
    ok(res, {
      items: rows.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.created_at,
        author: mapAuthor(comment),
      })),
    });
  }),
);

reelsRouter.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = commentSchema.parse(req.body);
    const row = await requireVisibleReel(Number(req.params.id), req.user!.id);
    const now = isoNow();
    const [id] = await db('reel_comments')
      .insert({
        reel_id: row.id,
        user_id: req.user!.id,
        content: body.content,
        created_at: now,
      })
      .returning('id');
    await notify({
      userId: row.user_id,
      actorId: req.user!.id,
      type: 'comment',
      entityId: row.id,
      link: `/reels?username=${encodeURIComponent(row.username)}`,
      data: { reelId: row.id, excerpt: body.content.slice(0, 120) },
    });
    ok(
      res,
      {
        comment: {
          id: typeof id === 'object' ? (id as any).id : Number(id),
          content: body.content,
          createdAt: now,
          author: {
            id: req.user!.id,
            username: req.user!.username,
            displayName: req.user!.displayName,
            avatarUrl: req.user!.avatarUrl,
            bio: req.user!.bio,
            isPrivate: req.user!.isPrivate,
            createdAt: req.user!.createdAt,
          },
        },
      },
      201,
    );
  }),
);

reelsRouter.delete(
  '/:id/comments/:commentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await requireVisibleReel(Number(req.params.id), req.user!.id);
    const comment = await db('reel_comments')
      .where({ id: Number(req.params.commentId), reel_id: row.id })
      .first();
    if (!comment) throw new HttpError(404, 'Comment not found.');
    if (comment.user_id !== req.user!.id && row.user_id !== req.user!.id) {
      throw new HttpError(403, 'You can only delete your own comments.');
    }
    await db('reel_comments').where({ id: comment.id }).del();
    ok(res, { deleted: true });
  }),
);
