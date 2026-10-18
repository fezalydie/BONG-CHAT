import { db, isoNow } from '../db.js';
import { emitToUser } from '../sockets/index.js';

export interface NotifyInput {
  userId: number;
  actorId?: number | null;
  type: 'like' | 'comment' | 'follow' | 'share' | 'message' | 'system';
  entityId?: number | null;
  link?: string;
  data?: Record<string, unknown>;
  /** Only notify when this key is currently offline (used for chat messages). */
  onlyWhenOffline?: boolean;
}

export async function notify(input: NotifyInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return; // never notify yourself

  if (input.onlyWhenOffline) {
    const { isOnline } = await import('../sockets/index.js');
    if (isOnline(input.userId)) return;
  }

  const [prefsRow, actorRow] = await Promise.all([
    db('users').where({ id: input.userId }).first(),
    input.actorId ? db('users').where({ id: input.actorId }).first() : Promise.resolve(undefined),
  ]);
  const prefs = prefsRow?.notification_prefs ? JSON.parse(prefsRow.notification_prefs) : {};
  const prefKey =
    input.type === 'like'
      ? 'likes'
      : input.type === 'comment'
        ? 'comments'
        : input.type === 'follow'
          ? 'follows'
          : input.type === 'share'
            ? 'shares'
            : 'messages';
  if (prefs[prefKey] === false) return;

  const row = {
    user_id: input.userId,
    actor_id: input.actorId ?? null,
    type: input.type,
    entity_id: input.entityId ?? null,
    link: input.link ?? '',
    data: JSON.stringify({
      ...(input.data ?? {}),
      actor: actorRow
        ? {
            id: actorRow.id,
            username: actorRow.username,
            displayName: actorRow.display_name,
            avatarUrl: actorRow.avatar_url,
          }
        : null,
    }),
    created_at: isoNow(),
  };
  await db('notifications').insert(row);
  const created = await db('notifications')
    .where({ user_id: input.userId })
    .orderBy('id', 'desc')
    .first();

  const unread = await db('notifications').where({ user_id: input.userId }).where({ read: false }).count('* as c').first();
  emitToUser(input.userId, 'notification:new', {
    id: created?.id ?? 0,
    type: input.type,
    link: row.link,
    actor: row.data ? JSON.parse(row.data).actor : null,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    unreadCount: Number((unread as any)?.c ?? 0),
  });
}

export async function unreadNotificationCount(userId: number): Promise<number> {
  const row = await db('notifications').where({ user_id: userId }).where({ read: false }).count('* as c').first();
  return Number((row as any)?.c ?? 0);
}
