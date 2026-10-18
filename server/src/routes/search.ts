import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, likeQuery, ok } from '../utils/http.js';
import { optionalAuth } from '../middleware/auth.js';
import { canViewContent, blockedIds, extractHashtags, feedAuthorIds, mapUser } from '../utils/users.js';

export const searchRouter = Router();

const WEB_SHORTCUTS = [
  { engine: 'Google', url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { engine: 'YouTube', url: (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  { engine: 'Wikipedia', url: (q: string) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
  { engine: 'DuckDuckGo', url: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
];

function normalizeUrl(query: string): string | null {
  const trimmed = query.trim();
  if (/^(https?:\/\/)/i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

/**
 * Unified search: people, posts, hashtags and — like a browser address bar —
 * external destinations the user can open directly.
 */
searchRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const type = String(req.query.type ?? 'all');
    if (!q) {
      ok(res, { users: [], posts: [], tags: [], web: [] });
      return;
    }
    const viewerId = req.user?.id;
    const allowedAuthors = viewerId ? await feedAuthorIds(viewerId) : undefined;
    const needle = likeQuery(q);

    const wantUsers = type === 'all' || type === 'users';
    const wantPosts = type === 'all' || type === 'posts';
    const wantWeb = type === 'all' || type === 'web';

    let users: any[] = [];
    if (wantUsers) {
      let userQuery = db('users')
        .where((builder) => {
          builder.whereRaw('LOWER(username) LIKE ? ESCAPE ?', [needle.toLowerCase(), '\\'])
            .orWhereRaw('LOWER(display_name) LIKE ? ESCAPE ?', [needle.toLowerCase(), '\\'])
            .orWhereRaw('LOWER(bio) LIKE ? ESCAPE ?', [needle.toLowerCase(), '\\']);
        })
        .select('id', 'username', 'display_name', 'avatar_url', 'bio', 'is_private', 'created_at')
        .limit(12);
      if (viewerId) {
        const hidden = await blockedIds(viewerId);
        if (hidden.length > 0) userQuery = userQuery.whereNotIn('id', hidden);
      }
      const rows = await userQuery;
      users = rows.map(mapUser);
    }

    let posts: any[] = [];
    let tags: string[] = [];
    if (wantPosts) {
      let query = db('posts as p')
        .join('users as u', 'u.id', 'p.user_id')
        .whereRaw('LOWER(p.content) LIKE ? ESCAPE ?', [needle.toLowerCase(), '\\'])
        .select(
          'p.id',
          'p.content',
          'p.image_url',
          'p.views',
          'p.created_at',
          'p.user_id',
          'u.username',
          'u.display_name',
          'u.avatar_url',
          'u.bio',
          'u.is_private',
          'u.created_at as u_created_at',
        )
        .orderBy('p.created_at', 'desc')
        .limit(20);
      if (allowedAuthors) query = query.whereIn('p.user_id', allowedAuthors);
      const rows = await query;
      const visible: any[] = [];
      for (const row of rows) {
        if (!(await canViewContent(viewerId, row.user_id))) continue;
        visible.push({
          id: row.id,
          content: row.content,
          imageUrl: row.image_url,
          views: Number(row.views ?? 0),
          createdAt: row.created_at,
          author: mapUser(row),
        });
      }
      posts = visible;

      const tagRows = await db('posts')
        .whereRaw('LOWER(content) LIKE ? ESCAPE ?', [likeQuery(`#${q.toLowerCase().replace(/^#/, '')}`), '\\'])
        .select('content')
        .limit(50);
      const tagSet = new Set<string>();
      for (const r of tagRows) for (const tag of extractHashtags(r.content)) tagSet.add(tag);
      tags = [...tagSet].slice(0, 12);
    }

    let web: any[] = [];
    if (wantWeb) {
      const url = normalizeUrl(q);
      if (url) {
        web.push({ label: q, url, kind: 'direct' });
      }
      web.push(
        ...WEB_SHORTCUTS.map((s) => ({
          label: `Search ${s.engine} for “${q}”`,
          url: s.url(q),
          kind: 'engine',
        })),
      );
    }

    ok(res, { users, posts, tags, web });
  }),
);
