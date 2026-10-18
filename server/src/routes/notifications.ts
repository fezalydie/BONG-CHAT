import { Router } from 'express';
import { db, isoNow } from '../db.js';
import { asyncHandler, ok, parseJson } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

export const notificationsRouter = Router();

function mapNotification(row: Record<string, any>) {
  return {
    id: row.id,
    type: row.type,
    entityId: row.entity_id,
    link: row.link,
    read: row.read === true || row.read === 1,
    createdAt: row.created_at,
    data: parseJson<Record<string, any>>(row.data, {}),
  };
}

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db('notifications')
      .where({ user_id: req.user!.id })
      .orderBy('id', 'desc')
      .limit(60);
    const unread = await db('notifications')
      .where({ user_id: req.user!.id })
      .where({ read: false })
      .count('* as c')
      .first();
    ok(res, {
      notifications: rows.map(mapNotification),
      unreadCount: Number((unread as any)?.c ?? 0),
    });
  }),
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await db('notifications').where({ user_id: req.user!.id }).where({ read: false }).update({ read: true });
    ok(res, { success: true });
  }),
);

notificationsRouter.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await db('notifications')
      .where({ id: Number(req.params.id), user_id: req.user!.id })
      .update({ read: true });
    ok(res, { success: true });
  }),
);

notificationsRouter.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    await db('notifications').where({ user_id: req.user!.id }).del();
    ok(res, { success: true });
  }),
);
