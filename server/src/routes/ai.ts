import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../utils/http.js';
import { optionalAuth } from '../middleware/auth.js';
import { askAssistant, SUGGESTED_PROMPTS } from '../services/aiBrain.js';
import { config } from '../config.js';

export const aiRouter = Router();

aiRouter.get(
  '/suggestions',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    ok(res, {
      prompts: SUGGESTED_PROMPTS,
      assistant: { name: 'Bongy', provider: config.ai.enabled ? config.ai.model : 'builtin' },
    });
  }),
);

aiRouter.post(
  '/message',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        message: z.string().trim().min(1).max(2000),
        history: z
          .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
          .max(20)
          .optional()
          .default([]),
      })
      .parse(req.body);
    const result = await askAssistant(body.message, body.history);
    ok(res, result);
  }),
);
