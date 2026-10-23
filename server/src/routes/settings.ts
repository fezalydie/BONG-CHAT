import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { asyncHandler, ok, parseJson } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

export const settingsRouter = Router();

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['en', 'bn', 'hi', 'es', 'fr', 'ar']).optional(),
  isPrivate: z.boolean().optional(),
  notificationPrefs: z
    .object({
      likes: z.boolean().optional(),
      comments: z.boolean().optional(),
      follows: z.boolean().optional(),
      messages: z.boolean().optional(),
      shares: z.boolean().optional(),
      sounds: z.boolean().optional(),
    })
    .optional(),
});

settingsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await db('users').where({ id: req.user!.id }).first();
    ok(res, {
      settings: {
        theme: row.theme,
        language: row.language,
        isPrivate: row.is_private === true || row.is_private === 1,
        notificationPrefs: parseJson<Record<string, boolean>>(row.notification_prefs, {
          likes: true,
          comments: true,
          follows: true,
          messages: true,
          shares: true,
          sounds: true,
        }),
      },
    });
  }),
);

settingsRouter.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    const row = await db('users').where({ id: req.user!.id }).first();
    const currentPrefs = parseJson<Record<string, boolean>>(row.notification_prefs, {});
    const patch: Record<string, unknown> = {};
    if (body.theme !== undefined) patch.theme = body.theme;
    if (body.language !== undefined) patch.language = body.language;
    if (body.isPrivate !== undefined) patch.is_private = body.isPrivate;
    if (body.notificationPrefs !== undefined) {
      patch.notification_prefs = JSON.stringify({
        ...currentPrefs,
        ...body.notificationPrefs,
      });
    }
    if (Object.keys(patch).length > 0) {
      await db('users').where({ id: req.user!.id }).update(patch);
    }
    // Going public auto-approves anyone whose request was pending, so they are
    // not stuck in limbo behind a request that no longer needs approval.
    if (body.isPrivate === false) {
      await db('follows')
        .where({ follow_id: req.user!.id, status: 'pending' })
        .update({ status: 'accepted' });
    }
    const fresh = await db('users').where({ id: req.user!.id }).first();
    ok(res, {
      settings: {
        theme: fresh.theme,
        language: fresh.language,
        isPrivate: fresh.is_private === true || fresh.is_private === 1,
        notificationPrefs: parseJson<Record<string, boolean>>(fresh.notification_prefs, {}),
      },
    });
  }),
);
