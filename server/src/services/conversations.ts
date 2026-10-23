import { db, isoNow } from '../db.js';
import { HttpError } from '../utils/http.js';

export interface DirectConversation {
  id: number;
  /** True when an existing 1:1 conversation between the two users was reused. */
  existing: boolean;
}

/**
 * Find (or create) the direct conversation between two users.
 *
 * Used by both "new message" and story replies so a reply always lands in the
 * same thread the two people already share instead of creating duplicates.
 */
export async function findOrCreateDirectConversation(
  userId: number,
  otherId: number,
): Promise<DirectConversation> {
  if (userId === otherId) {
    throw new HttpError(400, 'You cannot start a conversation with yourself.');
  }
  const other = await db('users').where({ id: otherId }).first();
  if (!other) throw new HttpError(404, 'User not found.');

  // Either side blocking the other prevents a new (or continued) chat.
  const blocked = await db('blocks')
    .where({ blocker_id: otherId, blocked_id: userId })
    .orWhere({ blocker_id: userId, blocked_id: otherId })
    .first();
  if (blocked) throw new HttpError(403, 'You cannot message this user.');

  // Reuse an existing 1:1 conversation if there is one.
  const mine = await db('conversation_participants').where({ user_id: userId });
  for (const participation of mine) {
    const partners = await db('conversation_participants')
      .where({ conversation_id: participation.conversation_id })
      .whereNot({ user_id: userId });
    if (partners.length === 1 && partners[0].user_id === otherId) {
      return { id: participation.conversation_id, existing: true };
    }
  }

  const now = isoNow();
  const [inserted] = await db('conversations')
    .insert({ created_at: now, last_message_at: now })
    .returning('id');
  const id = typeof inserted === 'object' ? (inserted as any).id : inserted;
  await db('conversation_participants').insert([
    { conversation_id: id, user_id: userId },
    { conversation_id: id, user_id: otherId },
  ]);
  return { id, existing: false };
}
