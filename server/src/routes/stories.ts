import { Router } from 'express';
import { z } from 'zod';
import { db, isoNow, isoInHours } from '../db.js';
import { asyncHandler, HttpError, ok } from '../utils/http.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { canViewContent, mapAuthor, mapUser } from '../utils/users.js';

export const storiesRouter = Router();

const GRADIENTS = ['sunset', 'ocean', 'candy', 'aurora', 'grape', 'fire'];

function mapStory(row: Record<string, any>) {
  return {
    id: row.id,
    content: row.content,
    imageUrl: row.image_url,
    videoUrl: row.video_url ?? '',
    style: row.style,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    author: {
      id: row.uid,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: '',
      isPrivate: Boolean(row.is_private),
      createdAt: '',
    },
  };
}

/** Remove expired stories lazily whenever the rail is loaded. */
async function purgeExpired(): Promise<void> {
  await db('stories').where('expires_at', '<', isoNow()).del();
}

/**
 * Story rail: every live story grouped by author, ordered by most recent.
 * `hasUnseen` drives the coloured ring around the avatar.
 */
storiesRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    await purgeExpired();
    const viewerId = req.user?.id;
    const rows = await db('stories as s')
      .join('users as u', 'u.id', 's.user_id')
      .select('s.*', 'u.id as uid', 'u.username', 'u.display_name', 'u.avatar_url', 'u.is_private')
      .orderBy('s.created_at', 'desc')
      .limit(300);

    const groups: Record<number, any> = {};
    for (const row of rows) {
      if (!(await canViewContent(viewerId, row.user_id))) continue;
      if (!groups[row.user_id]) {
        groups[row.user_id] = { user: mapAuthor(row), stories: [], hasUnseen: false, latestAt: row.created_at };
      }
      groups[row.user_id].stories.push(mapStory(row));
    }

    const storyIds = Object.values(groups).flatMap((g: any) => g.stories.map((s: any) => s.id));
    const seen = new Set<number>();
    if (viewerId && storyIds.length > 0) {
      const views = await db('story_views').whereIn('story_id', storyIds).where({ user_id: viewerId });
      for (const v of views) seen.add(v.story_id);
    }
    for (const group of Object.values(groups) as any[]) {
      group.hasUnseen = group.stories.some((s: any) => !seen.has(s.id));
      group.stories.sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));
    }

    const ordered = Object.values(groups).sort((a: any, b: any) => b.latestAt.localeCompare(a.latestAt));
    ok(res, { groups: ordered });
  }),
);

storiesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        content: z.string().trim().max(280).optional().default(''),
        imageUrl: z.string().trim().max(500).optional().default(''),
        videoUrl: z.string().trim().max(500).optional().default(''),
        style: z.enum(GRADIENTS as [string, ...string[]]).optional().default('sunset'),
      })
      .parse(req.body);
    if (!body.content && !body.imageUrl && !body.videoUrl) {
      throw new HttpError(400, 'Add a photo, a video or some text to your story.');
    }
    const now = isoNow();
    const [id] = await db('stories')
      .insert({
        user_id: req.user!.id,
        content: body.content,
        image_url: body.imageUrl,
        video_url: body.videoUrl,
        style: body.style,
        created_at: now,
        expires_at: isoInHours(Number(process.env.STORY_TTL_HOURS ?? 24)),
      })
      .returning('id');
    const row = await db('stories as s')
      .join('users as u', 'u.id', 's.user_id')
      .where('s.id', typeof id === 'object' ? (id as any).id : id)
      .select('s.*', 'u.id as uid', 'u.username', 'u.display_name', 'u.avatar_url', 'u.is_private')
      .first();
    ok(res, { story: mapStory(row) }, 201);
  }),
);

/** A single story plus its viewer list (viewer list only for the author). */
storiesRouter.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const row = await db('stories as s')
      .join('users as u', 'u.id', 's.user_id')
      .where('s.id', Number(req.params.id))
      .select('s.*', 'u.id as uid', 'u.username', 'u.display_name', 'u.avatar_url', 'u.is_private')
      .first();
    if (!row) throw new HttpError(404, 'Story not found.');
    if (!(await canViewContent(req.user?.id, row.user_id))) throw new HttpError(403, 'Not allowed.');
    let viewers: any[] = [];
    if (req.user && row.user_id === req.user.id) {
      const rows = await db('story_views as sv')
        .join('users as u', 'u.id', 'sv.user_id')
        .where('sv.story_id', row.id)
        .select('u.*', 'sv.viewed_at')
        .orderBy('sv.viewed_at', 'desc')
        .limit(100);
      viewers = rows.map((r: any) => ({ user: mapUser(r), viewedAt: r.viewed_at }));
    }
    ok(res, { story: mapStory(row), viewers });
  }),
);

/** Record that the viewer watched a story (once per viewer per story). */
storiesRouter.post(
  '/:id/view',
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await db('stories').where({ id: Number(req.params.id) }).first();
    if (!story) throw new HttpError(404, 'Story not found.');
    if (!(await canViewContent(req.user!.id, story.user_id))) throw new HttpError(403, 'Not allowed.');
    const existing = await db('story_views')
      .where({ story_id: story.id, user_id: req.user!.id })
      .first();
    if (!existing) {
      await db('story_views').insert({
        story_id: story.id,
        user_id: req.user!.id,
        viewed_at: isoNow(),
      });
    }
    const views = await db('story_views').where({ story_id: story.id }).count('* as c').first();
    ok(res, { views: Number((views as any)?.c ?? 0), seen: true });
  }),
);

storiesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await db('stories').where({ id: Number(req.params.id) }).first();
    if (!story) throw new HttpError(404, 'Story not found.');
    if (story.user_id !== req.user!.id) throw new HttpError(403, 'Not your story.');
    await db('stories').where({ id: story.id }).del();
    ok(res, { success: true });
  }),
);
