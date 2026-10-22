import { Router } from 'express';
import { z } from 'zod';
import { db, isoNow } from '../db.js';
import { asyncHandler, HttpError, likeQuery, ok } from '../utils/http.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { canViewContent, extractHashtags, feedAuthorIds, mapAuthor, mapUser } from '../utils/users.js';
import { notify } from '../services/notify.js';

export const postsRouter = Router();

const PAGE_SIZE = 10;

interface PostShape {
  id: number;
  content: string;
  imageUrl: string;
  videoUrl: string;
  views: number;
  createdAt: string;
  hashtags: string[];
  author: ReturnType<typeof mapUser>;
  likes: number;
  comments: number;
  shares: number;
  likedByMe: boolean;
  sharedByMe: boolean;
}

async function decorate(postRows: Record<string, any>[], viewerId: number | undefined): Promise<PostShape[]> {
  if (postRows.length === 0) return [];
  const ids = postRows.map((p) => p.id);
  const [likes, comments, shares, myLikes, myShares] = await Promise.all([
    db('post_likes').whereIn('post_id', ids).groupBy('post_id').select('post_id', db.raw('COUNT(*) as c')),
    db('comments').whereIn('post_id', ids).groupBy('post_id').select('post_id', db.raw('COUNT(*) as c')),
    db('shares').whereIn('post_id', ids).groupBy('post_id').select('post_id', db.raw('COUNT(*) as c')),
    viewerId ? db('post_likes').whereIn('post_id', ids).where({ user_id: viewerId }) : Promise.resolve([]),
    viewerId ? db('shares').whereIn('post_id', ids).where({ user_id: viewerId }) : Promise.resolve([]),
  ]);
  const count = (rows: Record<string, any>[], key = 'post_id') =>
    new Map(rows.map((r) => [r[key], Number(r.c)]));
  const likeMap = count(likes);
  const commentMap = count(comments);
  const shareMap = count(shares);
  const likedSet = new Set(myLikes.map((r: any) => r.post_id));
  const sharedSet = new Set(myShares.map((r: any) => r.post_id));

  return postRows.map((p) => ({
    id: p.id,
    content: p.content,
    imageUrl: p.image_url,
    videoUrl: p.video_url ?? '',
    views: Number(p.views ?? 0),
    createdAt: p.created_at,
    hashtags: extractHashtags(p.content),
    author: mapAuthor(p),
    likes: likeMap.get(p.id) ?? 0,
    comments: commentMap.get(p.id) ?? 0,
    shares: shareMap.get(p.id) ?? 0,
    likedByMe: likedSet.has(p.id),
    sharedByMe: sharedSet.has(p.id),
  }));
}

/**
 * Home feed = my posts + posts I follow + reposts by those people, newest first.
 * `username` switches to a single profile's posts; `hashtag` filters by #topic.
 */
postsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id;
    const username = typeof req.query.username === 'string' ? req.query.username : undefined;
    const hashtag = typeof req.query.hashtag === 'string' ? req.query.hashtag.replace(/^#/, '') : undefined;
    const page = Math.max(0, Number(req.query.page ?? 0) || 0);

    let authorIds: number[];
    if (username) {
      const target = await db('users').where({ username }).first();
      if (!target) throw new HttpError(404, 'User not found.');
      if (!(await canViewContent(viewerId, target.id))) {
        throw new HttpError(403, 'This account is private. Follow to see their posts.');
      }
      authorIds = [target.id];
    } else if (viewerId) {
      authorIds = await feedAuthorIds(viewerId);
    } else {
      // Anonymous visitors only ever see public accounts.
      const all = await db('users').where({ is_private: false }).select('id');
      authorIds = all.map((u) => u.id);
    }

    if (authorIds.length === 0) {
      ok(res, { items: [], hasMore: false });
      return;
    }

    let postQuery = db('posts as p')
      .join('users as u', 'u.id', 'p.user_id')
      .whereIn('p.user_id', authorIds)
      .select(
        'p.id',
        'p.content',
        'p.image_url',
        'p.video_url',
        'p.views',
        'p.created_at',
        'p.user_id',
        'u.id as uid',
        'u.username',
        'u.display_name',
        'u.avatar_url',
        'u.bio',
        'u.is_private',
        'u.created_at as u_created_at',
      )
      .orderBy('p.created_at', 'desc')
      .orderBy('p.id', 'desc')
      .limit(PAGE_SIZE * 2)
      .offset(page * PAGE_SIZE);

    if (hashtag) {
      postQuery = postQuery.whereRaw('LOWER(p.content) LIKE ? ESCAPE ?', [
        likeQuery(`#${hashtag.toLowerCase()}`),
        '\\',
      ]);
    }
    const postRows = await postQuery;

    // Reposts from the same author set (skip when browsing one profile or one tag).
    let shareRows: Record<string, any>[] = [];
    if (!username && !hashtag) {
      const rawShareRows = await db('shares as s')
        .join('posts as p', 'p.id', 's.post_id')
        .join('users as author', 'author.id', 'p.user_id')
        .join('users as sharer', 'sharer.id', 's.user_id')
        .whereIn('s.user_id', authorIds)
        .select(
          's.id as share_id',
          's.note as share_note',
          's.created_at as share_created_at',
          's.user_id as sharer_id',
          'p.*',
          'author.id as uid',
          'author.username',
          'author.display_name',
          'author.avatar_url',
          'author.bio',
          'author.is_private',
          'author.created_at as u_created_at',
          'sharer.username as sharer_username',
          'sharer.display_name as sharer_display_name',
          'sharer.avatar_url as sharer_avatar_url',
        )
        .orderBy('s.created_at', 'desc')
        .limit(PAGE_SIZE * 2)
        .offset(page * PAGE_SIZE);

      // A repost must never reveal a post the viewer is not allowed to see — the
      // share author being followed says nothing about the *post* author (who may
      // be private or blocked). Cache the check per author for this page.
      const canSeeAuthor = new Map<number, boolean>();
      for (const row of rawShareRows) {
        const authorId = Number(row.user_id);
        if (!canSeeAuthor.has(authorId)) {
          canSeeAuthor.set(authorId, await canViewContent(viewerId, authorId));
        }
      }
      shareRows = rawShareRows.filter((row) => canSeeAuthor.get(Number(row.user_id)));
    }

    const normalizedPosts = postRows.map((p) => ({ ...p, user_id: p.user_id }));
    const decoratedPosts = await decorate(normalizedPosts, viewerId);
    const decoratedSharesRaw = await decorate(
      shareRows.map((r) => ({ ...r, user_id: r.user_id })),
      viewerId,
    );

    const items = [
      ...decoratedPosts.map((post) => ({ kind: 'post' as const, post, sharedBy: null, shareNote: '', sharedAt: null })),
      ...shareRows.map((row, i) => ({
        kind: 'share' as const,
        post: decoratedSharesRaw[i],
        sharedBy: {
          id: row.sharer_id,
          username: row.sharer_username,
          displayName: row.sharer_display_name,
          avatarUrl: row.sharer_avatar_url,
        },
        shareNote: row.share_note,
        sharedAt: row.share_created_at,
      })),
    ].sort((a, b) => {
      const ta = a.kind === 'post' ? a.post.createdAt : (a.sharedAt ?? '');
      const tb = b.kind === 'post' ? b.post.createdAt : (b.sharedAt ?? '');
      return tb.localeCompare(ta);
    });

    const pageItems = items.slice(0, PAGE_SIZE);
    ok(res, { items: pageItems, hasMore: items.length > PAGE_SIZE || postRows.length >= PAGE_SIZE });
  }),
);

postsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        content: z.string().trim().max(2000).optional().default(''),
        imageUrl: z.string().trim().max(500).optional().default(''),
        videoUrl: z.string().trim().max(500).optional().default(''),
      })
      .parse(req.body);
    if (!body.content && !body.imageUrl && !body.videoUrl) {
      throw new HttpError(400, 'Write something, add a photo, or add a video first.');
    }
    // A post carries at most one media attachment; a video wins if both slip in.
    const imageUrl = body.videoUrl ? '' : body.imageUrl;
    const [id] = await db('posts')
      .insert({
        user_id: req.user!.id,
        content: body.content,
        image_url: imageUrl,
        video_url: body.videoUrl,
        created_at: isoNow(),
      })
      .returning('id');
    const row = await db('posts as p')
      .join('users as u', 'u.id', 'p.user_id')
      .where('p.id', typeof id === 'object' ? (id as any).id : id)
      .select('p.*', 'u.id as uid', 'u.username', 'u.display_name', 'u.avatar_url', 'u.bio', 'u.is_private', 'u.created_at as u_created_at')
      .first();
    const [post] = await decorate([row], req.user!.id);
    ok(res, { post }, 201);
  }),
);

postsRouter.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const row = await db('posts as p')
      .join('users as u', 'u.id', 'p.user_id')
      .where('p.id', Number(req.params.id))
      .select('p.*', 'u.id as uid', 'u.username', 'u.display_name', 'u.avatar_url', 'u.bio', 'u.is_private', 'u.created_at as u_created_at')
      .first();
    if (!row) throw new HttpError(404, 'Post not found.');
    if (!(await canViewContent(req.user?.id, row.user_id))) {
      throw new HttpError(403, 'This post is private.');
    }
    const [post] = await decorate([row], req.user?.id);
    ok(res, { post });
  }),
);

postsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await db('posts').where({ id: Number(req.params.id) }).first();
    if (!row) throw new HttpError(404, 'Post not found.');
    if (row.user_id !== req.user!.id) throw new HttpError(403, 'You can only delete your own posts.');
    await db('posts').where({ id: row.id }).del();
    ok(res, { success: true });
  }),
);

postsRouter.post(
  '/:id/like',
  requireAuth,
  asyncHandler(async (req, res) => {
    const post = await db('posts').where({ id: Number(req.params.id) }).first();
    if (!post) throw new HttpError(404, 'Post not found.');
    if (!(await canViewContent(req.user!.id, post.user_id))) throw new HttpError(403, 'Not allowed.');
    const existing = await db('post_likes')
      .where({ post_id: post.id, user_id: req.user!.id })
      .first();
    if (existing) {
      await db('post_likes').where({ id: existing.id }).del();
    } else {
      await db('post_likes').insert({
        post_id: post.id,
        user_id: req.user!.id,
        created_at: isoNow(),
      });
      await notify({
        userId: post.user_id,
        actorId: req.user!.id,
        type: 'like',
        entityId: post.id,
        link: `/post/${post.id}`,
      });
    }
    const likes = await db('post_likes').where({ post_id: post.id }).count('* as c').first();
    ok(res, { likes: Number((likes as any)?.c ?? 0), likedByMe: !existing });
  }),
);

postsRouter.post(
  '/:id/share',
  requireAuth,
  asyncHandler(async (req, res) => {
    const post = await db('posts').where({ id: Number(req.params.id) }).first();
    if (!post) throw new HttpError(404, 'Post not found.');
    if (!(await canViewContent(req.user!.id, post.user_id))) throw new HttpError(403, 'Not allowed.');
    const note = z.object({ note: z.string().trim().max(280).optional().default('') }).parse(req.body).note;
    const existing = await db('shares').where({ post_id: post.id, user_id: req.user!.id }).first();
    if (existing) {
      await db('shares').where({ id: existing.id }).del();
    } else {
      await db('shares').insert({
        post_id: post.id,
        user_id: req.user!.id,
        note,
        created_at: isoNow(),
      });
      await notify({
        userId: post.user_id,
        actorId: req.user!.id,
        type: 'share',
        entityId: post.id,
        link: `/post/${post.id}`,
      });
    }
    const shares = await db('shares').where({ post_id: post.id }).count('* as c').first();
    ok(res, { shares: Number((shares as any)?.c ?? 0), sharedByMe: !existing });
  }),
);

/** Register a unique view (one per viewer per post) for the view counter. */
postsRouter.post(
  '/:id/view',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const post = await db('posts').where({ id: Number(req.params.id) }).first();
    if (!post) throw new HttpError(404, 'Post not found.');
    if (!req.user) {
      ok(res, { views: Number(post.views ?? 0) });
      return;
    }
    if (!(await canViewContent(req.user.id, post.user_id))) {
      ok(res, { views: Number(post.views ?? 0) });
      return;
    }
    const existing = await db('post_views')
      .where({ post_id: post.id, user_id: req.user.id })
      .first();
    if (!existing) {
      await db('post_views').insert({
        post_id: post.id,
        user_id: req.user.id,
        created_at: isoNow(),
      });
      await db('posts').where({ id: post.id }).increment('views', 1);
    }
    const fresh = await db('posts').where({ id: post.id }).first();
    ok(res, { views: Number(fresh.views ?? 0) });
  }),
);

postsRouter.get(
  '/:id/comments',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const post = await db('posts').where({ id: Number(req.params.id) }).first();
    if (!post) throw new HttpError(404, 'Post not found.');
    if (!(await canViewContent(req.user?.id, post.user_id))) throw new HttpError(403, 'Not allowed.');
    const rows = await db('comments as c')
      .join('users as u', 'u.id', 'c.user_id')
      .where('c.post_id', post.id)
      .select(
        'c.id',
        'c.content',
        'c.created_at',
        'u.id as uid',
        'u.username',
        'u.display_name',
        'u.avatar_url',
      )
      .orderBy('c.created_at', 'asc')
      .limit(200);
    ok(res, {
      comments: rows.map((r: any) => ({
        id: r.id,
        content: r.content,
        createdAt: r.created_at,
        author: {
          id: r.uid,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          bio: '',
          isPrivate: false,
          createdAt: '',
        },
      })),
    });
  }),
);

postsRouter.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ content: z.string().trim().min(1).max(1000) }).parse(req.body);
    const post = await db('posts').where({ id: Number(req.params.id) }).first();
    if (!post) throw new HttpError(404, 'Post not found.');
    if (!(await canViewContent(req.user!.id, post.user_id))) throw new HttpError(403, 'Not allowed.');
    const [id] = await db('comments')
      .insert({
        post_id: post.id,
        user_id: req.user!.id,
        content: body.content,
        created_at: isoNow(),
      })
      .returning('id');
    await notify({
      userId: post.user_id,
      actorId: req.user!.id,
      type: 'comment',
      entityId: post.id,
      link: `/post/${post.id}`,
      data: { preview: body.content.slice(0, 80) },
    });
    ok(
      res,
      {
        comment: {
          id: typeof id === 'object' ? (id as any).id : id,
          content: body.content,
          createdAt: isoNow(),
          author: {
            id: req.user!.id,
            username: req.user!.username,
            displayName: req.user!.displayName,
            avatarUrl: req.user!.avatarUrl,
            bio: '',
            isPrivate: false,
            createdAt: '',
          },
        },
      },
      201,
    );
  }),
);

postsRouter.delete(
  '/:id/comments/:commentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const comment = await db('comments').where({ id: Number(req.params.commentId) }).first();
    if (!comment) throw new HttpError(404, 'Comment not found.');
    const post = await db('posts').where({ id: comment.post_id }).first();
    if (comment.user_id !== req.user!.id && post.user_id !== req.user!.id) {
      throw new HttpError(403, 'Not allowed.');
    }
    await db('comments').where({ id: comment.id }).del();
    ok(res, { success: true });
  }),
);
