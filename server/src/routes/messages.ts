import { Router } from 'express';
import { z } from 'zod';
import { db, isoNow } from '../db.js';
import { asyncHandler, HttpError, likeQuery, ok, parseJson } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { blockedIds, mapAuthor, mapUser, linkify } from '../utils/users.js';
import { emitToUser, isOnline } from '../sockets/index.js';
import { notify } from '../services/notify.js';
import { findOrCreateDirectConversation } from '../services/conversations.js';

export const messagesRouter = Router();

async function participantsOf(conversationId: number): Promise<number[]> {
  const rows = await db('conversation_participants').where({ conversation_id: conversationId });
  return rows.map((r) => r.user_id);
}

async function assertParticipant(conversationId: number, userId: number): Promise<void> {
  const ids = await participantsOf(conversationId);
  if (!ids.includes(userId)) throw new HttpError(403, 'This conversation does not belong to you.');
}

function mapMessage(row: Record<string, any>) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    content: row.content,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    parts: linkify(row.content ?? ''),
    // Story replies carry a snapshot so they still render after the story expires.
    storyId: row.story_id ?? null,
    story: parseJson<Record<string, any> | null>(row.story_snapshot, null),
    sender: {
      id: row.uid,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };
}

/** Conversation list with the other participant, last message and unread badge. */
messagesRouter.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const hidden = await blockedIds(me);
    const myConversations = await db('conversation_participants').where({ user_id: me });
    const ids = myConversations.map((r) => r.conversation_id);
    if (ids.length === 0) {
      ok(res, { conversations: [] });
      return;
    }

    const rows = await db('conversations as c')
      .join('conversation_participants as cp', 'cp.conversation_id', 'c.id')
      .join('users as u', 'u.id', 'cp.user_id')
      .whereIn('c.id', ids)
      .whereNot('u.id', me)
      .select(
        'c.id as conversation_id',
        'c.last_message_at',
        'u.id as uid',
        'u.username',
        'u.display_name',
        'u.avatar_url',
        'u.bio',
        'u.is_private',
        'u.created_at as u_created_at',
        'u.last_seen_at',
      );

    const result: any[] = [];
    for (const row of rows) {
      if (hidden.includes(row.uid)) continue;
      if (q && !row.username.toLowerCase().includes(q.toLowerCase()) && !row.display_name.toLowerCase().includes(q.toLowerCase())) {
        continue;
      }
      const [last, unread] = await Promise.all([
        db('messages').where({ conversation_id: row.conversation_id }).orderBy('id', 'desc').first(),
        db('messages')
          .where({ conversation_id: row.conversation_id })
          .whereNot({ sender_id: me })
          .whereNull('read_at')
          .count('* as c')
          .first(),
      ]);
      result.push({
        id: row.conversation_id,
        user: {
          ...mapAuthor(row),
          lastSeenAt: row.last_seen_at,
          online: isOnline(row.uid),
        },
        lastMessage: last ? mapMessage(last) : null,
        unreadCount: Number((unread as any)?.c ?? 0),
        lastMessageAt: row.last_message_at,
      });
    }
    result.sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
    ok(res, { conversations: result });
  }),
);

/** Start (or reuse) a direct conversation with another user. */
messagesRouter.post(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { username } = z.object({ username: z.string().trim().min(1) }).parse(req.body);
    const other = await db('users').where({ username }).first();
    if (!other) throw new HttpError(404, 'User not found.');
    const { id: conversationId, existing } = await findOrCreateDirectConversation(
      req.user!.id,
      other.id,
    );
    ok(res, { conversationId, existing }, existing ? 200 : 201);
  }),
);

messagesRouter.get(
  '/conversations/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertParticipant(id, req.user!.id);
    const conversation = await db('conversations').where({ id }).first();
    const rows = await db('conversation_participants as cp')
      .join('users as u', 'u.id', 'cp.user_id')
      .where('cp.conversation_id', id)
      .select('u.*', 'u.last_seen_at');
    ok(res, {
      conversation: { id: conversation.id, lastMessageAt: conversation.last_message_at },
      participants: rows.map((r: any) => ({ ...mapUser(r), lastSeenAt: r.last_seen_at, online: isOnline(r.id) })),
    });
  }),
);

/** Paged message history, newest page first (client reverses for display). */
messagesRouter.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertParticipant(id, req.user!.id);
    const before = Number(req.query.before ?? 0) || 0;
    let query = db('messages as m')
      .join('users as u', 'u.id', 'm.sender_id')
      .where('m.conversation_id', id)
      .select(
        'm.id',
        'm.conversation_id',
        'm.sender_id',
        'm.content',
        'm.image_url',
        'm.story_id',
        'm.story_snapshot',
        'm.created_at',
        'm.read_at',
        'u.id as uid',
        'u.username',
        'u.display_name',
        'u.avatar_url',
      )
      .orderBy('m.id', 'desc')
      .limit(30);
    if (before > 0) query = query.where('m.id', '<', before);
    const rows = await query;
    ok(res, {
      messages: rows.reverse().map(mapMessage),
      hasMore: rows.length === 30,
    });
  }),
);

/** Send a message. Delivered instantly over the socket; also persisted. */
messagesRouter.post(
  '/conversations/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertParticipant(id, req.user!.id);
    const body = z
      .object({
        content: z.string().trim().max(2000).optional().default(''),
        imageUrl: z.string().trim().max(500).optional().default(''),
      })
      .parse(req.body);
    if (!body.content && !body.imageUrl) throw new HttpError(400, 'Type a message first.');

    const participants = await participantsOf(id);
    const recipientId = participants.find((p) => p !== req.user!.id);
    const now = isoNow();
    const [inserted] = await db('messages')
      .insert({
        conversation_id: id,
        sender_id: req.user!.id,
        content: body.content,
        image_url: body.imageUrl,
        created_at: now,
      })
      .returning('id');
    const messageId = typeof inserted === 'object' ? (inserted as any).id : inserted;
    await db('conversations').where({ id }).update({ last_message_at: now });

    const senderRow = await db('users').where({ id: req.user!.id }).first();
    const payload = {
      id: messageId,
      conversationId: id,
      content: body.content,
      imageUrl: body.imageUrl,
      createdAt: now,
      readAt: null,
      parts: linkify(body.content),
      storyId: null,
      story: null,
      sender: {
        id: senderRow.id,
        username: senderRow.username,
        displayName: senderRow.display_name,
        avatarUrl: senderRow.avatar_url,
      },
    };

    if (recipientId) {
      emitToUser(recipientId, 'message:new', payload);
      emitToUser(recipientId, 'conversation:updated', { conversationId: id });
      if (body.imageUrl) {
        emitToUser(recipientId, 'chat:image', { conversationId: id, from: payload.sender });
      }
      await notify({
        userId: recipientId,
        actorId: req.user!.id,
        type: 'message',
        entityId: id,
        link: `/messages/${id}`,
        onlyWhenOffline: true,
        data: { preview: (body.content || 'Sent a photo').slice(0, 80) },
      });
    }
    ok(res, { message: payload }, 201);
  }),
);

/** Mark the conversation as read (everything the other side sent). */
messagesRouter.post(
  '/conversations/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertParticipant(id, req.user!.id);
    await db('messages')
      .where({ conversation_id: id })
      .whereNot({ sender_id: req.user!.id })
      .whereNull('read_at')
      .update({ read_at: isoNow() });
    if (req.user) emitToUser(req.user.id, 'conversation:read', { conversationId: id });
    ok(res, { success: true });
  }),
);
