import { db } from '../db.js';
import { bool } from './http.js';

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  isPrivate: boolean;
  createdAt: string;
}

export function mapUser(row: Record<string, any>): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isPrivate: bool(row.is_private),
    createdAt: row.created_at,
  };
}

/**
 * Map a *joined* row (a parent row plus user columns) into a public user.
 * Joined queries alias the user id as `uid` and the user's own `created_at` as
 * `u_created_at`, because the parent row already owns `id` and `created_at`.
 */
export function mapAuthor(row: Record<string, any>): PublicUser {
  return mapUser({
    ...row,
    id: row.uid ?? row.user_id,
    created_at: row.u_created_at ?? row.created_at,
  });
}

/** Relationship of the viewer towards the profile owner. */
export interface ViewerFlags {  isMe: boolean;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isBlocked: boolean;
}

export async function viewerFlags(viewerId: number | undefined, ownerId: number): Promise<ViewerFlags> {
  if (!viewerId || viewerId === ownerId) {
    return {
      isMe: Boolean(viewerId) && viewerId === ownerId,
      isFollowing: false,
      isFollowedBy: false,
      isBlocked: false,
    };
  }
  const [follow, reverse, block] = await Promise.all([
    db('follows').where({ follower_id: viewerId, follow_id: ownerId }).first(),
    db('follows').where({ follower_id: ownerId, follow_id: viewerId }).first(),
    db('blocks').where({ blocker_id: viewerId, blocked_id: ownerId }).first(),
  ]);
  return {
    isMe: false,
    isFollowing: Boolean(follow),
    isFollowedBy: Boolean(reverse),
    isBlocked: Boolean(block),
  };
}

/**
 * Can the viewer see this user's content?
 *  - the owner always can
 *  - public accounts are visible to everyone
 *  - private accounts are visible only to followers (anonymous visitors see nothing)
 *  - blocked users see nothing of each other
 */
export async function canViewContent(viewerId: number | undefined, ownerId: number): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const owner = await db('users').where({ id: ownerId }).first();
  if (!owner) return false;
  if (viewerId) {
    const [blockedByMe, blockedMe] = await Promise.all([
      db('blocks').where({ blocker_id: viewerId, blocked_id: ownerId }).first(),
      db('blocks').where({ blocker_id: ownerId, blocked_id: viewerId }).first(),
    ]);
    if (blockedByMe || blockedMe) return false;
  }
  if (!bool(owner.is_private)) return true;
  if (!viewerId) return false;
  const follow = await db('follows').where({ follower_id: viewerId, follow_id: ownerId }).first();
  return Boolean(follow);
}

/** Ids the viewer must never see (blocked in either direction). */
export async function blockedIds(viewerId: number): Promise<number[]> {
  const rows = await db('blocks')
    .where({ blocker_id: viewerId })
    .orWhere({ blocked_id: viewerId })
    .select('blocker_id', 'blocked_id');
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.blocker_id !== viewerId) ids.add(row.blocker_id);
    if (row.blocked_id !== viewerId) ids.add(row.blocked_id);
  }
  return [...ids];
}

/** Ids the viewer is allowed to read (self + accepted follows), minus blocked users. */
export async function feedAuthorIds(viewerId: number): Promise<number[]> {
  const [follows, hidden] = await Promise.all([
    db('follows').where({ follower_id: viewerId }).select('follow_id'),
    blockedIds(viewerId),
  ]);
  const ids = new Set<number>([viewerId, ...follows.map((f) => f.follow_id)]);
  for (const id of hidden) ids.delete(id);
  return [...ids];
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export function linkify(text: string): Array<{ type: 'text' | 'link'; value: string }> {
  const parts: Array<{ type: 'text' | 'link'; value: string }> = [];
  const regex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, start) });
    parts.push({ type: 'link', value: match[0] });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}
