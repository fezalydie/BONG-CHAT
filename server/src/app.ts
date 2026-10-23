import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { HttpError } from './utils/http.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { postsRouter } from './routes/posts.js';
import { reelsRouter } from './routes/reels.js';
import { storiesRouter } from './routes/stories.js';
import { messagesRouter } from './routes/messages.js';
import { notificationsRouter } from './routes/notifications.js';
import { searchRouter } from './routes/search.js';
import { settingsRouter } from './routes/settings.js';
import { uploadsRouter } from './routes/uploads.js';
import { aiRouter } from './routes/ai.js';
import { integrationsRouter } from './routes/integrations.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Very small in-memory limiter for the auth endpoints (brute-force guard). */
export function rateLimit(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  // Expired entries are only overwritten when the same address comes back, so
  // sweep them before the map can grow without bound (many IPv6 addresses).
  const SWEEP_ABOVE = 1000;
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    if (hits.size > SWEEP_ABOVE) {
      for (const [address, entry] of hits) {
        if (entry.resetAt < now) hits.delete(address);
      }
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}

export function createApp(): express.Express {
  const app = express();

  // Express must not believe X-Forwarded-For unless a proxy really sits in
  // front of us: otherwise any client can spoof req.ip and dodge the limiter.
  if (config.trustProxyHops > 0) {
    app.set('trust proxy', config.trustProxyHops);
  }

  // Small, dependency-free set of hardening headers.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(
    cors({
      origin: config.webOrigin,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'bong-chat', time: new Date().toISOString() });
  });

  // Brute-force guard: only the credential endpoints are limited. Session
  // checks (`GET /me`) and logout are cheap and must never be throttled — the
  // SPA calls `/me` on every boot, and many users can share one IP (NAT).
  const authLimiter = rateLimit(60_000, 30);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/reels', reelsRouter);
  app.use('/api/stories', storiesRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/integrations', integrationsRouter);

  // Uploaded images (avatars, posts, stories, chat photos).
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: config.isProd ? '7d' : 0,
      fallthrough: true,
    }),
  );

  // In production the built frontend is served by this same server.
  const clientDist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found.' });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err && typeof err === 'object' && (err as any).name === 'ZodError') {
      const issue = (err as any).issues?.[0];
      res.status(400).json({ error: issue?.message ?? 'Invalid input.' });
      return;
    }
    if (err instanceof SyntaxError && 'body' in (err as any)) {
      res.status(400).json({ error: 'Malformed JSON body.' });
      return;
    }
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
