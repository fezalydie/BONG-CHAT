import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { userFromToken, AUTH_COOKIE } from '../middleware/auth.js';

/** userId -> set of live socket ids (in-memory presence registry). */
const online = new Map<number, Set<string>>();

let io: Server | undefined;

export function isOnline(userId: number): boolean {
  return (online.get(userId)?.size ?? 0) > 0;
}

export function onlineUserIds(): number[] {
  return [...online.keys()];
}

export function emitToUser(userId: number, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function createSocketServer(httpServer: HttpServer): Server {
  const server = new Server(httpServer, {
    cors: { origin: config.webOrigin, credentials: true },
  });
  io = server;

  // Authenticate every socket with the same JWT cookie the REST API uses.
  server.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, AUTH_COOKIE);
    const user = token ? await userFromToken(token) : undefined;
    if (!user) {
      next(new Error('unauthorized'));
      return;
    }
    (socket.data as { userId: number }).userId = user.id;
    next();
  });

  server.on('connection', (socket) => {
    const userId = (socket.data as { userId: number }).userId;
    socket.join(`user:${userId}`);

    const set = online.get(userId) ?? new Set<string>();
    set.add(socket.id);
    const isFirstConnection = set.size === 1;
    online.set(userId, set);
    if (isFirstConnection) {
      server.emit('presence:update', { userId, online: true });
    }

    socket.on('watch:user', (targetId: number) => {
      if (typeof targetId === 'number') socket.join(`user:${targetId}`);
    });

    socket.on('disconnect', () => {
      const current = online.get(userId);
      if (!current) return;
      current.delete(socket.id);
      if (current.size === 0) {
        online.delete(userId);
        server.emit('presence:update', { userId, online: false });
      }
    });
  });

  return server;
}
