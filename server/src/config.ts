import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * How many reverse-proxy hops to trust when resolving `req.ip`.
 * 0 (the default) means "trust no proxy", so a client cannot spoof its address
 * with an `X-Forwarded-For` header and slip past the auth rate limiter.
 */
function hops(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export const config = {
  port: num(process.env.PORT, 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',
  trustProxyHops: hops(process.env.TRUST_PROXY),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 168),
  db: {
    usePg: process.env.DB_CLIENT === 'pg',
    sqliteFile: path.resolve(serverRoot, process.env.DATABASE_FILE ?? './data/bongchat.db'),
    url: process.env.DATABASE_URL ?? '',
  },
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR ?? './uploads'),
  dataDir: path.resolve(serverRoot, './data'),
  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 8) * 1024 * 1024,
  maxVideoBytes: num(process.env.MAX_VIDEO_MB, 50) * 1024 * 1024,
  storyTtlHours: num(process.env.STORY_TTL_HOURS, 24),
  ai: {
    enabled: Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY),
    provider: process.env.AI_PROVIDER ?? '',
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  },
};
